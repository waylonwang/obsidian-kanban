import { TFile, Vault } from 'obsidian';
import { KanbanTask } from './types';

interface KanbanBoardSettings {
  dateTrigger?: string;
  timeTrigger?: string;
  dateFormat?: string;
}

const DEFAULT_KANBAN_SETTINGS: KanbanBoardSettings = {
  dateTrigger: '@',
  timeTrigger: '@@',
  dateFormat: 'YYYY-MM-DD'
};

export class KanbanParser {
  private vault: Vault;
  private globalSettings: KanbanBoardSettings | null = null;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /**
   * Load global Kanban plugin settings from .obsidian/plugins/obsidian-kanban/data.json
   */
  private async loadGlobalKanbanSettings(): Promise<KanbanBoardSettings> {
    if (this.globalSettings) {
      return this.globalSettings;
    }

    const settings: KanbanBoardSettings = { ...DEFAULT_KANBAN_SETTINGS };

    try {
      const kanbanConfigPath = '.obsidian/plugins/obsidian-kanban/data.json';

      const adapter = this.vault.adapter as any;
      if (adapter && adapter.fsPromises && adapter.path && adapter.basePath) {
        const fullPath = adapter.path.join(adapter.basePath, kanbanConfigPath);

        const configContent = await adapter.fsPromises.readFile(fullPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (config['date-trigger']) {
          settings.dateTrigger = config['date-trigger'];
        }
        if (config['time-trigger']) {
          settings.timeTrigger = config['time-trigger'];
        }
        if (config['date-format']) {
          settings.dateFormat = config['date-format'];
        }
      }
    } catch (error) {
      // Config file not found or invalid, use defaults
    }

    this.globalSettings = settings;
    return settings;
  }

  /**
   * Get effective settings: global config + file-specific overrides
   */
  private async getEffectiveSettings(content: string): Promise<KanbanBoardSettings> {
    // Start with global settings from Kanban plugin config
    const globalSettings = await this.loadGlobalKanbanSettings();
    const settings: KanbanBoardSettings = { ...globalSettings };

    // Check for file-specific overrides in frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];

      // Override with file-specific settings if present
      const dateTriggerMatch = frontmatter.match(/date-trigger:\s*['"]?([^'"\n]+)['"]?/);
      if (dateTriggerMatch) {
        settings.dateTrigger = dateTriggerMatch[1].trim();
      }

      const timeTriggerMatch = frontmatter.match(/time-trigger:\s*['"]?([^'"\n]+)['"]?/);
      if (timeTriggerMatch) {
        settings.timeTrigger = timeTriggerMatch[1].trim();
      }

      const dateFormatMatch = frontmatter.match(/date-format:\s*['"]?([^'"\n]+)['"]?/);
      if (dateFormatMatch) {
        settings.dateFormat = dateFormatMatch[1].trim();
      }
    }

    return settings;
  }

  async parseKanbanFile(file: TFile): Promise<KanbanTask[]> {
    const content = await this.vault.read(file);
    const settings = await this.getEffectiveSettings(content);
    return this.parseKanbanContent(content, file.path, settings);
  }

  parseKanbanContent(content: string, filePath: string, settings?: KanbanBoardSettings): KanbanTask[] {
    const boardSettings = settings || DEFAULT_KANBAN_SETTINGS;
    const { dateTrigger, timeTrigger } = boardSettings;

    const tasks: KanbanTask[] = [];
    const lines = content.split('\n');

    const escapedDateTrigger = dateTrigger!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedTimeTrigger = timeTrigger!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const datePattern = new RegExp(`${escapedDateTrigger}\\{(\\d{4}-\\d{2}-\\d{2})\\}`);
    const singleTimePattern = new RegExp(`${escapedTimeTrigger}\\{(\\d{2}:\\d{2})\\}`);
    const timeRangePattern = new RegExp(`${escapedTimeTrigger}\\{(\\d{2}:\\d{2})-(\\d{2}:\\d{2})\\}`);

    // Helper function to find a date in a line using board-specific trigger
    const findDateInLine = (line: string): string | null => {
      const dateMatch = line.match(datePattern);
      return dateMatch ? dateMatch[1] : null;
    };

    // Helper function to find tags in a line
    const findTagsInLine = (line: string): string[] => {
      const tags: string[] = [];
      const tagMatches = line.match(/#[a-zA-Z0-9]+/g);
      if (tagMatches) {
        tagMatches.forEach(tag => {
          tags.push(tag);
        });
      }
      return tags;
    };

    // Helper function to check if a line is a task
    const isTaskLine = (line: string): boolean => {
      return line.includes('- [ ]') || line.includes('- [x]');
    };

    // Helper function to check if a line is indented (subtask)
    const isIndented = (line: string): boolean => {
      return line.startsWith('\t') || line.startsWith('    ');
    };

    // Helper function to check if a line is a Kanban list header
    const isListHeader = (line: string): boolean => {
      return line.trim().startsWith('## ');
    };

    // Helper function to extract list name from header
    const extractListName = (line: string): string => {
      return line.trim().replace(/^## /, '').trim();
    };

    // Track parent task information for subtasks
    let currentParentDate: string | null = null;
    let currentParentTags: string[] = [];
    let currentListName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (!line.trim()) continue;

      // Check if line is a Kanban list header
      if (isListHeader(line)) {
        currentListName = extractListName(line);
        continue;
      }

      // Check if line contains a task
      if (isTaskLine(line)) {
        // Check if task is completed
        const completed = line.includes('- [x]');

        // Check if this is a subtask (indented)
        const isSubtask = isIndented(line);

        // Extract task description
        let description = line.replace(/- \[ \]|- \[x\]/, '').trim();

        // Look for date in current line
        let date = findDateInLine(line);
        let tags = findTagsInLine(line);
        let time: string | null = null;

        // If this is a subtask, use parent task's date and tags if available
        if (isSubtask && currentParentDate) {
          if (!date) date = currentParentDate;
          tags = [...tags, ...currentParentTags];
        } else if (!isSubtask) {
          // This is a parent task, store its info for potential subtasks
          currentParentDate = date;
          currentParentTags = [...tags];
        }

        // If date not found in current line, look ahead up to 3 lines
        if (!date) {
          for (let j = 1; j <= 3 && i + j < lines.length; j++) {
            const nextLine = lines[i + j];

            // Skip if next line is another task
            if (isTaskLine(nextLine) && !isIndented(nextLine)) {
              break;
            }

            // Check for date in next line
            const nextLineDate = findDateInLine(nextLine);
            if (nextLineDate) {
              date = nextLineDate;

              // Also look for tags in this line
              const nextLineTags = findTagsInLine(nextLine);
              tags = [...tags, ...nextLineTags];

              // Extract time if available (single time or time range)
              const timeRangeMatch = nextLine.match(timeRangePattern);
              const singleTimeMatch = nextLine.match(singleTimePattern);

              if (timeRangeMatch) {
                // Time range format: @{09:00-11:30}
                const startTime = timeRangeMatch[1];
                const endTime = timeRangeMatch[2];
                time = `${startTime}-${endTime}`;
              } else if (singleTimeMatch) {
                // Single time format: @{09:30}
                time = singleTimeMatch[1];
              }

              // Update parent date and tags if this is a parent task
              if (!isSubtask) {
                currentParentDate = date;
                currentParentTags = [...currentParentTags, ...nextLineTags];
              }

              break;
            }
          }
        } else {
          // Extract time if available on same line as date
          const timeMatch = line.match(singleTimePattern);
          if (timeMatch) {
            time = timeMatch[1];
          }
        }

        // Only add task if it has a date
        if (date) {
          // Extract linked note from [[...]] pattern
          let linkedNote: string | undefined;
          const linkMatch = description.match(/\[\[([^\]]+)\]\]/);
          if (linkMatch) {
            linkedNote = linkMatch[1];
          }

          // Clean up description - remove date and time markers
          const dateMarkerPattern = new RegExp(`${escapedDateTrigger}\\{\\d{4}-\\d{2}-\\d{2}\\}`, 'g');
          const timeMarkerPattern = new RegExp(`${escapedTimeTrigger}\\{[^}]+\\}`, 'g');

          description = description.replace(dateMarkerPattern, '').trim();
          if (time) description = description.replace(timeMarkerPattern, '').trim();

          // Remove tags from description
          tags.forEach(tag => {
            description = description.replace(tag, '').trim();
          });

          // Remove markdown formatting (bold, italic, etc.)
          description = description.replace(/\*\*(.*?)\*\*/g, '$1').trim(); // Remove bold
          description = description.replace(/\*(.*?)\*/g, '$1').trim(); // Remove italic
          description = description.replace(/__(.*?)__/g, '$1').trim(); // Remove underline

          // Parse time into startTime and endTime if it's a range
          let startTime: string | undefined;
          let endTime: string | undefined;
          let displayTime: string | undefined;

          if (time) {
            if (time.includes('-')) {
              // Time range: "09:00-11:30"
              const [start, end] = time.split('-');
              startTime = start;
              endTime = end;
              displayTime = time; // Keep original format for display
            } else {
              // Single time: "09:30"
              displayTime = time;
              startTime = time;
            }
          }

          // Generate a more stable ID based on content
          const taskId = `task-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}-${description.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}-${date}`;

          // Add task to parsed tasks
          tasks.push({
            id: taskId,
            description,
            titleRaw: description, // For plain markdown files, same as description
            date,
            time: displayTime,
            startTime,
            endTime,
            tags,
            priorities: [], // Not available in plain markdown
            assignees: [], // Not available in plain markdown
            completed,
            source: filePath,
            linkedNote,
            listName: currentListName || undefined
          });
        }
      }
    }

    return tasks;
  }

  async getAllKanbanTasks(kanbanFilePath?: string, includedLists?: string[], excludedLists?: string[]): Promise<KanbanTask[]> {
    const allTasks: KanbanTask[] = [];

    if (kanbanFilePath) {
      // Read specific file
      const file = this.vault.getAbstractFileByPath(kanbanFilePath);
      if (file instanceof TFile) {
        const tasks = await this.parseKanbanFile(file);
        allTasks.push(...tasks);
      }
    } else {
      // Read all markdown files
      const markdownFiles = this.vault.getMarkdownFiles();
      for (const file of markdownFiles) {
        const tasks = await this.parseKanbanFile(file);
        allTasks.push(...tasks);
      }
    }

    // Apply list filtering
    return this.filterTasksByLists(allTasks, includedLists, excludedLists);
  }

  private filterTasksByLists(tasks: KanbanTask[], includedLists?: string[], excludedLists?: string[]): KanbanTask[] {
    if (!includedLists && !excludedLists) {
      return tasks; // No filtering
    }

    return tasks.filter(task => {
      // If no list name is available, include the task by default
      if (!task.listName) {
        return true;
      }

      // If excludedLists is specified and task's list is in it, exclude the task
      if (excludedLists && excludedLists.length > 0) {
        if (excludedLists.includes(task.listName)) {
          return false;
        }
      }

      // If includedLists is specified and not empty, only include tasks from those lists
      if (includedLists && includedLists.length > 0) {
        return includedLists.includes(task.listName);
      }

      // If only excludedLists is specified, include all others
      return true;
    });
  }

  async getAllAvailableLists(kanbanFilePath?: string): Promise<string[]> {
    const allLists = new Set<string>();

    if (kanbanFilePath) {
      // Read specific file
      const file = this.vault.getAbstractFileByPath(kanbanFilePath);
      if (file instanceof TFile) {
        const lists = await this.extractListsFromFile(file);
        lists.forEach(list => allLists.add(list));
      }
    } else {
      // Read all markdown files
      const markdownFiles = this.vault.getMarkdownFiles();
      for (const file of markdownFiles) {
        const lists = await this.extractListsFromFile(file);
        lists.forEach(list => allLists.add(list));
      }
    }

    return Array.from(allLists).sort();
  }

  private async extractListsFromFile(file: TFile): Promise<string[]> {
    const content = await this.vault.read(file);
    const lines = content.split('\n');
    const lists: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('## ')) {
        const listName = line.trim().replace(/^## /, '').trim();
        if (listName && !lists.includes(listName)) {
          lists.push(listName);
        }
      }
    }

    return lists;
  }

  async updateTaskDateInFile(task: KanbanTask, newDate: string): Promise<boolean> {
    try {
      const file = this.vault.getAbstractFileByPath(task.source);
      if (!(file instanceof TFile)) {
        return false;
      }

      const content = await this.vault.read(file);
      const settings = await this.getEffectiveSettings(content);
      const { dateTrigger } = settings;
      const escapedDateTrigger = dateTrigger!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const lines = content.split('\n');

      // Find the task line by matching the description
      let taskLineIndex = -1;
      let foundTask = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this line contains a task with our description
        if ((line.includes('- [ ]') || line.includes('- [x]')) &&
            line.includes(task.description)) {

          // Additional verification: check if this line or nearby lines contain the old date
          const checkLines = [line];
          // Check up to 3 lines ahead for date information
          for (let j = 1; j <= 3 && i + j < lines.length; j++) {
            const nextLine = lines[i + j];
            // Stop if we hit another task
            if (nextLine.includes('- [ ]') || nextLine.includes('- [x]')) {
              break;
            }
            checkLines.push(nextLine);
          }

          // Check if any of these lines contain the old date using board-specific trigger
          const combinedText = checkLines.join(' ');
          const dateMarker = `${dateTrigger}{${task.date}}`;
          if (combinedText.includes(dateMarker)) {
            taskLineIndex = i;
            foundTask = true;
            break;
          }
        }
      }

      if (!foundTask) {
        return false;
      }

      // Update the date in the found line and subsequent lines
      let updated = false;
      for (let i = taskLineIndex; i < Math.min(taskLineIndex + 4, lines.length); i++) {
        const oldDatePattern = new RegExp(`${escapedDateTrigger}\\{${task.date.replace(/[-]/g, '\\-')}\\}`, 'g');
        if (oldDatePattern.test(lines[i])) {
          lines[i] = lines[i].replace(oldDatePattern, `${dateTrigger}{${newDate}}`);
          updated = true;
          break;
        }
      }

      if (!updated) {
        return false;
      }

      // Write the updated content back to the file
      const updatedContent = lines.join('\n');
      await this.vault.modify(file, updatedContent);

      return true;

    } catch (error) {
      return false;
    }
  }

  async updateTaskInFile(task: KanbanTask, updates: { description?: string; date?: string; time?: string; completed?: boolean }): Promise<boolean> {
    try {
      const file = this.vault.getAbstractFileByPath(task.source);
      if (!(file instanceof TFile)) {
        return false;
      }

      const content = await this.vault.read(file);
      const settings = await this.getEffectiveSettings(content);
      const { dateTrigger, timeTrigger } = settings;
      const escapedDateTrigger = dateTrigger!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedTimeTrigger = timeTrigger!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const lines = content.split('\n');

      // Find the task line by matching the description
      let taskLineIndex = -1;
      let foundTask = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this line contains a task with our description
        if ((line.includes('- [ ]') || line.includes('- [x]')) &&
            line.includes(task.description)) {

          // Additional verification: check if this line or nearby lines contain the old date
          const checkLines = [line];
          // Check up to 3 lines ahead for date information
          for (let j = 1; j <= 3 && i + j < lines.length; j++) {
            const nextLine = lines[i + j];
            // Stop if we hit another task
            if (nextLine.includes('- [ ]') || nextLine.includes('- [x]')) {
              break;
            }
            checkLines.push(nextLine);
          }

          // Check if any of these lines contain the old date using board-specific trigger
          const combinedText = checkLines.join(' ');
          const dateMarker = `${dateTrigger}{${task.date}}`;
          if (combinedText.includes(dateMarker)) {
            taskLineIndex = i;
            foundTask = true;
            break;
          }
        }
      }

      if (!foundTask) {
        return false;
      }

      // Update the task line and subsequent lines
      let updated = false;

      // Update completion status
      if (updates.completed !== undefined) {
        const newStatus = updates.completed ? '- [x]' : '- [ ]';
        const oldStatus = task.completed ? '- [x]' : '- [ ]';
        lines[taskLineIndex] = lines[taskLineIndex].replace(oldStatus, newStatus);
        updated = true;
      }

      // Update description
      if (updates.description && updates.description !== task.description) {
        lines[taskLineIndex] = lines[taskLineIndex].replace(task.description, updates.description);
        updated = true;
      }

      // Update date and time in subsequent lines
      for (let i = taskLineIndex; i < Math.min(taskLineIndex + 4, lines.length); i++) {
        // Update date
        if (updates.date && updates.date !== task.date) {
          const oldDatePattern = new RegExp(`${escapedDateTrigger}\\{${task.date.replace(/[-]/g, '\\-')}\\}`, 'g');
          if (oldDatePattern.test(lines[i])) {
            lines[i] = lines[i].replace(oldDatePattern, `${dateTrigger}{${updates.date}}`);
            updated = true;
          }
        }

        // Update time
        if (updates.time !== undefined) {
          if (task.time) {
            // Replace existing time
            const oldTimePattern = new RegExp(`${escapedTimeTrigger}\\{${task.time.replace(/[-:]/g, '\\$&')}\\}`, 'g');
            if (updates.time) {
              lines[i] = lines[i].replace(oldTimePattern, `${timeTrigger}{${updates.time}}`);
            } else {
              lines[i] = lines[i].replace(oldTimePattern, '');
            }
            updated = true;
          } else if (updates.time) {
            // Add new time
            const dateMarker = `${dateTrigger}{${task.date}}`;
            if (lines[i].includes(dateMarker)) {
              lines[i] = lines[i] + ` ${timeTrigger}{${updates.time}}`;
              updated = true;
            }
          }
        }
      }

      if (!updated) {
        return false;
      }

      // Write the updated content back to the file
      const updatedContent = lines.join('\n');
      await this.vault.modify(file, updatedContent);

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Extract all list names from a Kanban file
   */
  async getListNamesFromFile(filePath: string): Promise<string[]> {
    try {
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return [];
      }

      const content = await this.vault.read(file);
      const lines = content.split('\n');
      const listNames: string[] = [];

      for (const line of lines) {
        if (line.startsWith('## ')) {
          const listName = line.replace('## ', '').trim();
          if (listName) {
            listNames.push(listName);
          }
        }
      }

      return listNames;
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract list names from content string
   */
  getListNamesFromContent(content: string): string[] {
    const lines = content.split('\n');
    const listNames: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        const listName = line.replace('## ', '').trim();
        if (listName) {
          listNames.push(listName);
        }
      }
    }

    return listNames;
  }

  /**
   * Get all unique list names from all markdown files
   */
  async getAllListNames(): Promise<string[]> {
    const allLists = new Set<string>();

    const markdownFiles = this.vault.getMarkdownFiles();
    for (const file of markdownFiles) {
      const content = await this.vault.read(file);
      const lists = this.getListNamesFromContent(content);
      lists.forEach(list => allLists.add(list));
    }

    return Array.from(allLists).sort();
  }

  async addNewTaskToFile(filePath: string, taskDescription: string, date: string, listName: string, time?: string, tags: string[] = []): Promise<boolean> {
    try {
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return false;
      }

      const content = await this.vault.read(file);
      const settings = await this.getEffectiveSettings(content);
      const { dateTrigger, timeTrigger } = settings;

      let lines = content.split('\n');

      // Find the specified list/column
      let insertIndex = -1;
      let foundList = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('## ') && lines[i].replace('## ', '').trim() === listName) {
          foundList = true;
          // Find the end of this section to insert the new task
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith('## ')) {
              insertIndex = j;
              break;
            }
          }
          if (insertIndex === -1) {
            insertIndex = lines.length;
          }
          break;
        }
      }

      if (!foundList || insertIndex === -1) {
        return false; // Specified list not found
      }

      // Create the new task line
      let newTaskLine = `- [ ] **${taskDescription}**`;

      // Add tags and date on the next line using board-specific triggers
      let metaLine = '\t';
      if (tags.length > 0) {
        metaLine += tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ') + ' ';
      }
      metaLine += `${dateTrigger}{${date}}`;
      if (time) {
        metaLine += ` ${timeTrigger}{${time}}`;
      }

      // Insert the new task
      lines.splice(insertIndex, 0, newTaskLine, metaLine);

      // Write back to file
      const updatedContent = lines.join('\n');
      await this.vault.modify(file, updatedContent);

      return true;

    } catch (error) {
      return false;
    }
  }
}