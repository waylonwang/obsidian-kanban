import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { h, render } from 'preact';
import { CalendarComponent } from './calendar-component';
import { KanbanParser } from './kanban-parser';
import { KanbanTask, DEFAULT_KANBAN_CALENDAR_SETTINGS } from './types';
import KanbanPlugin from '../main';
import { KanbanView } from '../KanbanView';

export const VIEW_TYPE_KANBAN_CALENDAR = 'kanban-calendar-view';

export class KanbanCalendarView extends ItemView {
  private containerEl_: HTMLElement | null = null;
  private parser: KanbanParser;
  private plugin: KanbanPlugin;
  private tasks: KanbanTask[] = [];
  private availableLists: string[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: KanbanPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.parser = new KanbanParser(this.app.vault);
  }

  getViewType(): string {
    return VIEW_TYPE_KANBAN_CALENDAR;
  }

  getDisplayText(): string {
    return '看板日历';
  }

  getIcon(): string {
    return 'calendar-days';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('kanban-calendar-view');

    // Store container for rendering
    this.containerEl_ = container as HTMLElement;

    // Load initial tasks
    await this.loadTasks();

    // Render Preact component
    this.renderComponent();

    // Set up file watcher for modifications
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.loadTasks();
          this.renderComponent();
        }
      })
    );

    // Set up active file change listener (for useCurrentFile mode)
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async () => {
        const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;
        if (calendarSettings.useCurrentFile) {
          await this.loadTasks();
          this.renderComponent();
        }
      })
    );
  }

  async onClose(): Promise<void> {
    if (this.containerEl_) {
      render(null, this.containerEl_);
      this.containerEl_ = null;
    }
  }

  private getCurrentTargetFile(): TFile | null {
    const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;

    if (calendarSettings.useCurrentFile) {
      return this.app.workspace.getActiveFile();
    }

    if (calendarSettings.defaultKanbanBoard) {
      const file = this.app.vault.getAbstractFileByPath(calendarSettings.defaultKanbanBoard);
      return file instanceof TFile ? file : null;
    }

    return null;
  }

  private async loadTasks(): Promise<void> {
    try {
      const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;
      const targetFile = this.getCurrentTargetFile();

      if (calendarSettings.useCurrentFile) {
        // Only load from current active file
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
          this.tasks = await this.parser.parseKanbanFile(activeFile);
          this.availableLists = await this.parser.getListNamesFromFile(activeFile.path);
        } else {
          this.tasks = [];
          this.availableLists = [];
        }
      } else {
        // Use default settings: specific file or all files
        this.tasks = await this.parser.getAllKanbanTasks(
          calendarSettings.defaultKanbanBoard || undefined,
          calendarSettings.includedLists.length > 0 ? calendarSettings.includedLists : undefined,
          calendarSettings.excludedLists.length > 0 ? calendarSettings.excludedLists : undefined
        );

        // Get lists from default board if specified
        if (targetFile) {
          this.availableLists = await this.parser.getListNamesFromFile(targetFile.path);
        } else {
          // When scanning all files, collect unique list names from all files
          this.availableLists = await this.parser.getAllListNames();
        }
      }

      // Filter completed tasks if setting is disabled
      if (!calendarSettings.showCompletedTasks) {
        this.tasks = this.tasks.filter(task => !task.completed);
      }
    } catch (error) {
      this.tasks = [];
      this.availableLists = [];
    }
  }

  private renderComponent(): void {
    if (!this.containerEl_) return;

    const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;
    const targetFile = this.getCurrentTargetFile();

    render(h(CalendarComponent, {
      tasks: this.tasks,
      taskColors: calendarSettings.taskColors,
      hideWeekends: calendarSettings.hideWeekends,
      availableLists: this.availableLists,
      onTaskClick: (_task: KanbanTask) => {
        // Only show modal, don't open file
      },
      onOpenFile: (task: KanbanTask) => {
        this.openTaskSource(task);
      },
      onOpenLinkedNote: (noteName: string) => {
        this.openLinkedNote(noteName);
      },
      onTaskMove: async (task: KanbanTask, newDate: string) => {
        try {
          const success = await this.parser.updateTaskDateInFile(task, newDate);

          if (success) {
            const taskIndex = this.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
              this.tasks[taskIndex].date = newDate;
              this.renderComponent();
            }
          }
        } catch (error) {
          // Handle error silently
        }
      },
      onTaskUpdate: async (task: KanbanTask, updates: { description?: string; date?: string; time?: string; completed?: boolean }) => {
        try {
          const success = await this.parser.updateTaskInFile(task, updates);

          if (success) {
            const taskIndex = this.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
              if (updates.description) this.tasks[taskIndex].description = updates.description;
              if (updates.date) this.tasks[taskIndex].date = updates.date;
              if (updates.time !== undefined) this.tasks[taskIndex].time = updates.time;
              if (updates.completed !== undefined) this.tasks[taskIndex].completed = updates.completed;
              this.renderComponent();
            }
          }
        } catch (error) {
          // Handle error silently
        }
      },
      onTaskCreate: async (taskData: { description: string; date: string; listName: string; time?: string; tags: string[] }) => {
        try {
          const file = targetFile;
          if (!file) {
            return; // No target file available
          }

          const success = await this.parser.addNewTaskToFile(
            file.path,
            taskData.description,
            taskData.date,
            taskData.listName,
            taskData.time,
            taskData.tags
          );

          if (success) {
            const newTask: KanbanTask = {
              id: `task-${taskData.description.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}-${taskData.date}`,
              description: taskData.description,
              titleRaw: taskData.description,
              date: taskData.date,
              time: taskData.time,
              startTime: taskData.time && !taskData.time.includes('-') ? taskData.time : undefined,
              endTime: taskData.time && taskData.time.includes('-') ? taskData.time.split('-')[1] : undefined,
              tags: taskData.tags,
              priorities: [],
              assignees: [],
              completed: false,
              source: file.path,
              listName: taskData.listName
            };

            this.tasks.push(newTask);
            this.renderComponent();

            setTimeout(async () => {
              await this.loadTasks();
              this.renderComponent();
            }, 50);
          }
        } catch (error) {
          // Handle error silently
        }
      },
      onDateChange: (_date: string) => {
        // Date changed
      },
      initialView: calendarSettings.calendarView,
      initialDate: new Date().toISOString(),
      calendarLocation: 'sidebar',
      onLocationChange: (location: 'view' | 'sidebar') => {
        if (location === 'view') {
          // 先找到 KanbanView 并切换到日历视图
          const kanbanLeaves = this.app.workspace.getLeavesOfType('kanban');
          if (kanbanLeaves.length > 0) {
            // 找到与日历任务来源相同的看板，或使用第一个可用的
            const targetLeaf = kanbanLeaves.find(leaf => {
              const view = leaf.view as KanbanView;
              return view.file && this.tasks.some(t => t.source === view.file.path);
            }) || kanbanLeaves[0];

            const kanbanView = targetLeaf.view as KanbanView;
            if (kanbanView) {
              this.app.workspace.setActiveLeaf(targetLeaf);
              kanbanView.setView('calendar');
            }
          }
          // 关闭侧边栏日历
          this.leaf.detach();
        }
      }
    }), this.containerEl_);
  }

  private async openTaskSource(task: KanbanTask): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.source);

      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        this.app.workspace.setActiveLeaf(leaf);
      }
    } catch (error) {
      // Handle error silently
    }
  }

  private async openLinkedNote(noteName: string): Promise<void> {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(noteName, '');

      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        this.app.workspace.setActiveLeaf(leaf);
      } else {
        const newFile = await this.app.vault.create(`${noteName}.md`, '');
        if (newFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(newFile);
          this.app.workspace.setActiveLeaf(leaf);
        }
      }
    } catch (error) {
      // Handle error silently
    }
  }

  async refresh(): Promise<void> {
    await this.loadTasks();
    this.renderComponent();
  }
}