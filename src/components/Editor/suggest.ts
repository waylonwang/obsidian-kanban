import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
  moment,
} from 'obsidian';

import KanbanPlugin from '../../main';
import { buildTimeArray } from '../Item/helpers';
import { c, escapeRegExpStr } from '../helpers';
import { applyDate, constructDatePicker, toNextMonth, toPreviousMonth } from './datepicker';
import { Instance } from './flatpickr/types/instance';
import { PriorityOption, AssigneeOption } from '../types';

export function matchTimeTrigger(timeTrigger: string, editor: Editor, cursor: EditorPosition) {
  const textCtx = (editor.getLine(cursor.line) || '').slice(0, cursor.ch);
  const timeTriggerRegex = new RegExp(`(?:^|\\s)${escapeRegExpStr(timeTrigger)}{?([^}]*)$`);
  return textCtx.match(timeTriggerRegex);
}

export function matchDateTrigger(dateTrigger: string, editor: Editor, cursor: EditorPosition) {
  const textCtx = (editor.getLine(cursor.line) || '').slice(0, cursor.ch);
  const dateTriggerRegex = new RegExp(`(?:^|\\s)${escapeRegExpStr(dateTrigger)}{?([^}]*)$`);
  return textCtx.match(dateTriggerRegex);
}

export function matchTagTrigger(editor: Editor, cursor: EditorPosition) {
  const textCtx = (editor.getLine(cursor.line) || '').slice(0, cursor.ch);
  // 只匹配 #! 和 #@ 开头的特殊标签格式，避免与 Obsidian 原生标签下拉冲突
  const tagRegex = /(?:^|\s)(#[!@][^\s\u2000-\u206F\u2E00-\u2E7F'"#$%&()*+,.:;<=>?^`{|}~[\]\\]*)$/;
  return textCtx.match(tagRegex);
}

// 匹配优先级触发：输入 ! 字符
export function matchPriorityTrigger(editor: Editor, cursor: EditorPosition) {
  const textCtx = (editor.getLine(cursor.line) || '').slice(0, cursor.ch);
  // 匹配行首或空格后的 ! 字符
  const priorityRegex = /(?:^|\s)!([^!\s]*)$/;
  return textCtx.match(priorityRegex);
}

// 匹配负责人触发：输入 @ 字符
export function matchAssigneeTrigger(editor: Editor, cursor: EditorPosition) {
  const textCtx = (editor.getLine(cursor.line) || '').slice(0, cursor.ch);
  // 匹配行首或空格后的 @ 字符（排除邮箱格式）
  const assigneeRegex = /(?:^|\s)@([^@\s]*)$/;
  return textCtx.match(assigneeRegex);
}

export class DateSuggest extends EditorSuggest<[]> {
  plugin: KanbanPlugin;
  app: App;

  get stateManager() {
    return this.context ? this.plugin.stateManagers.get(this.context.file) : null;
  }

  constructor(app: App, plugin: KanbanPlugin) {
    super(app);

    this.app = app;
    this.plugin = plugin;

    [...(this.scope as any).keys].forEach((k: any) => this.scope.unregister(k));

    this.suggestEl.addClass(c('date-suggest'));

    const move = (dir: 'up' | 'right' | 'down' | 'left') => {
      const { datepicker } = this;
      if (!datepicker) return;

      const currentDate = moment(datepicker.selectedDates[0] || new Date());
      let nextDate: Date;

      if (dir === 'right') {
        if (currentDate.weekday() === 6) {
          nextDate = toNextMonth(currentDate).toDate();
        } else {
          nextDate = currentDate.add(1, 'day').toDate();
        }
      } else if (dir === 'left') {
        if (currentDate.weekday() === 0) {
          nextDate = toPreviousMonth(currentDate).toDate();
        } else {
          nextDate = currentDate.subtract(1, 'day').toDate();
        }
      } else if (dir === 'up') {
        nextDate = currentDate.subtract(1, 'week').toDate();
      } else if (dir === 'down') {
        nextDate = currentDate.add(1, 'week').toDate();
      }

      if (nextDate) {
        datepicker.setDate(nextDate, false);
        return false;
      }
    };

    this.scope.register([], 'ArrowLeft', () => move('left'));
    this.scope.register([], 'ArrowRight', () => move('right'));
    this.scope.register([], 'ArrowDown', () => move('down'));
    this.scope.register([], 'ArrowUp', () => move('up'));

    this.scope.register([], 'Enter', () => {
      const selectedDates = this.datepicker.selectedDates;
      const ctx = this.context;

      if (selectedDates.length) {
        applyDate(ctx, this.stateManager, selectedDates[0]);
      } else {
        applyDate(ctx, this.stateManager, new Date());
      }

      this.close();
      return false;
    });

    this.scope.register([], 'Escape', () => {
      this.close();
      return false;
    });
  }

  getSuggestions(): [] {
    return [];
  }

  suggestEl: HTMLElement;
  renderSuggestion(): void {}
  selectSuggestion(): void {}

  datepicker: Instance = null;
  showSuggestions() {
    const { datepicker, suggestEl, context, stateManager } = this;
    if (!datepicker && stateManager) {
      suggestEl.empty();
      suggestEl.addClasses([c('date-picker'), c('ignore-click-outside')]);
      constructDatePicker(context, stateManager, suggestEl, (picker) => {
        this.datepicker = picker;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.updatePosition(true);
      });
    }
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const stateManager = this.plugin.getStateManager(file);
    if (!stateManager) return null;

    const dateTrigger = stateManager.getSetting('date-trigger');
    const match = matchDateTrigger(dateTrigger, editor, cursor);
    if (!match) return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - dateTrigger.length },
      end: cursor,
      query: dateTrigger,
    };
  }

  close() {
    super.close();

    if (this.datepicker) {
      this.datepicker.destroy();
      this.datepicker = null;
      this.suggestEl.empty();
    }
  }
}

export class TimeSuggest extends EditorSuggest<string> {
  plugin: KanbanPlugin;
  times: string[];

  constructor(app: App, plugin: KanbanPlugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo {
    const stateManager = this.plugin.getStateManager(file);
    if (!stateManager) return null;

    const timeTrigger = stateManager.getSetting('time-trigger');
    const match = matchTimeTrigger(timeTrigger, editor, cursor);
    if (!match) return null;

    this.times = buildTimeArray(stateManager);

    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - match[1].length - timeTrigger.length,
      },
      end: cursor,
      query: match[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
    const stateManager = this.plugin.getStateManager(context.file);
    if (!stateManager) return [];

    return this.times.filter((t) => {
      return t.startsWith(context.query) || t.startsWith('0' + context.query);
    });
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    if (value.endsWith('00')) {
      el.createEl('strong', { text: value });
    } else {
      el.setText(value);
    }
  }

  selectSuggestion(value: string): void {
    const { context, plugin } = this;
    const stateManager = plugin.getStateManager(context.file);
    if (!stateManager) return;

    const timeTrigger = stateManager.getSetting('time-trigger');
    const replacement = `${timeTrigger}{${value}} `;

    context.editor.replaceRange(replacement, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + replacement.length,
    });
    context.editor.focus();
  }

  close(): void {
    super.close();
    this.times = null;
  }
}

export class TagSuggest extends EditorSuggest<string> {
  plugin: KanbanPlugin;
  app: App;
  tags: string[];

  constructor(app: App, plugin: KanbanPlugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const stateManager = this.plugin.getStateManager(file);
    if (!stateManager) return null;

    const match = matchTagTrigger(editor, cursor);
    if (!match) return null;

    // 获取所有标签：从当前文件和所有 Kanban 卡片
    const allTags: Set<string> = new Set();

    // 从当前文件的 frontmatter 和内容获取标签
    const fileCache = this.app.metadataCache.getFileCache(file);
    if (fileCache?.tags) {
      fileCache.tags.forEach((t) => allTags.add(t.tag));
    }
    if (Array.isArray(fileCache?.frontmatter?.tags)) {
      fileCache.frontmatter.tags.forEach((t: string) => allTags.add(`#${t}`));
    }

    // 从所有 Kanban 文件获取标签
    this.plugin.stateManagers.forEach((manager) => {
      const board = manager.state;
      board.children.forEach((lane) => {
        lane.children.forEach((item) => {
          item.data.metadata.tags?.forEach((tag) => allTags.add(tag));
        });
      });
    });

    this.tags = Array.from(allTags).sort();

    const tagText = match[1]; // 匹配到的标签文本（如 #!高）
    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - tagText.length,
      },
      end: cursor,
      query: tagText,
    };
  }

  getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
    const query = context.query.toLowerCase();
    return this.tags.filter((tag) => {
      return tag.toLowerCase().startsWith(query) || tag.toLowerCase().includes(query);
    });
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    const { context } = this;
    if (!context) return;

    const replacement = `${value} `;
    context.editor.replaceRange(replacement, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + replacement.length,
    });
    context.editor.focus();
  }

  close(): void {
    super.close();
    this.tags = null;
  }
}

// 带颜色信息的建议项
interface SuggestItem {
  label: string;
  color?: string;
  backgroundColor?: string;
}

// 优先级下拉选择
export class PrioritySuggest extends EditorSuggest<SuggestItem> {
  plugin: KanbanPlugin;
  app: App;
  priorities: SuggestItem[];

  constructor(app: App, plugin: KanbanPlugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const stateManager = this.plugin.getStateManager(file);
    if (!stateManager) return null;

    const match = matchPriorityTrigger(editor, cursor);
    if (!match) return null;

    // 优先显示配置中预定义的优先级选项（带颜色信息）
    const configuredPriorities = stateManager.getSetting('priority-options') as { label: string; color?: string; backgroundColor?: string }[] | undefined;
    const priorityMap: Map<string, SuggestItem> = new Map();

    // 先添加预定义选项
    if (configuredPriorities && configuredPriorities.length > 0) {
      configuredPriorities.forEach(p => {
        priorityMap.set(p.label, { label: p.label, color: p.color, backgroundColor: p.backgroundColor });
      });
    }

    // 然后添加从 Kanban 卡片收集的已有优先级标签
    this.plugin.stateManagers.forEach((manager) => {
      const board = manager.state;
      board.children.forEach((lane) => {
        lane.children.forEach((item) => {
          item.data.metadata.tags?.forEach((tag) => {
            if (tag.startsWith('#!')) {
              const label = tag.slice(2); // 去掉 #! 前缀
              if (!priorityMap.has(label)) {
                priorityMap.set(label, { label });
              }
            }
          });
        });
      });
    });

    // 如果没有预定义和收集到的优先级，使用默认值
    if (priorityMap.size === 0) {
      ['高', '中', '低', '紧急', '重要'].forEach(p => priorityMap.set(p, { label: p }));
    }

    // 预定义选项排在前面，其他选项按字母排序排在后面
    if (configuredPriorities && configuredPriorities.length > 0) {
      const configuredLabels = configuredPriorities.map(p => p.label);
      const remaining = Array.from(priorityMap.entries())
        .filter(([label]) => !configuredLabels.includes(label))
        .map(([, item]) => item)
        .sort((a, b) => a.label.localeCompare(b.label));
      this.priorities = [...configuredPriorities.map(p => ({ label: p.label, color: p.color, backgroundColor: p.backgroundColor })), ...remaining];
    } else {
      this.priorities = Array.from(priorityMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    }

    const inputText = match[1] || ''; // 用户输入的内容（!后面的部分）
    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - inputText.length - 1, // 包含 ! 字符
      },
      end: cursor,
      query: inputText,
    };
  }

  getSuggestions(context: EditorSuggestContext): SuggestItem[] | Promise<SuggestItem[]> {
    const query = context.query.toLowerCase();
    return this.priorities.filter((p) => {
      return p.label.toLowerCase().startsWith(query) || p.label.toLowerCase().includes(query);
    });
  }

  renderSuggestion(value: SuggestItem, el: HTMLElement): void {
    const tagEl = el.createEl('a', {
      cls: `tag ${c('item-tag')}`,
      text: `!${value.label}`,
    });
    if (value.color || value.backgroundColor) {
      tagEl.style.setProperty('--tag-color', value.color || '');
      tagEl.style.setProperty('--tag-background', value.backgroundColor || '');
    }
  }

  selectSuggestion(value: SuggestItem): void {
    const { context } = this;
    if (!context) return;

    // 将 !xxx 转换为 #!xxx
    const replacement = `#!${value.label} `;
    context.editor.replaceRange(replacement, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + replacement.length,
    });
    context.editor.focus();
  }

  close(): void {
    super.close();
    this.priorities = null;
  }
}

// 负责人下拉选择
export class AssigneeSuggest extends EditorSuggest<SuggestItem> {
  plugin: KanbanPlugin;
  app: App;
  assignees: SuggestItem[];

  constructor(app: App, plugin: KanbanPlugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
    const stateManager = this.plugin.getStateManager(file);
    if (!stateManager) return null;

    const match = matchAssigneeTrigger(editor, cursor);
    if (!match) return null;

    // 优先显示配置中预定义的负责人选项（带颜色信息）
    const configuredAssignees = stateManager.getSetting('assignee-options') as { label: string; color?: string; backgroundColor?: string }[] | undefined;
    const assigneeMap: Map<string, SuggestItem> = new Map();

    // 先添加预定义选项
    if (configuredAssignees && configuredAssignees.length > 0) {
      configuredAssignees.forEach(a => {
        assigneeMap.set(a.label, { label: a.label, color: a.color, backgroundColor: a.backgroundColor });
      });
    }

    // 然后添加从 Kanban 卡片收集的已有负责人标签
    this.plugin.stateManagers.forEach((manager) => {
      const board = manager.state;
      board.children.forEach((lane) => {
        lane.children.forEach((item) => {
          item.data.metadata.tags?.forEach((tag) => {
            if (tag.startsWith('#@')) {
              const label = tag.slice(2); // 去掉 #@ 前缀
              if (!assigneeMap.has(label)) {
                assigneeMap.set(label, { label });
              }
            }
          });
        });
      });
    });

    // 预定义选项排在前面，其他选项按字母排序排在后面
    if (configuredAssignees && configuredAssignees.length > 0) {
      const configuredLabels = configuredAssignees.map(a => a.label);
      const remaining = Array.from(assigneeMap.entries())
        .filter(([label]) => !configuredLabels.includes(label))
        .map(([, item]) => item)
        .sort((a, b) => a.label.localeCompare(b.label));
      this.assignees = [...configuredAssignees.map(a => ({ label: a.label, color: a.color, backgroundColor: a.backgroundColor })), ...remaining];
    } else {
      this.assignees = Array.from(assigneeMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    }

    const inputText = match[1] || ''; // 用户输入的内容（@后面的部分）
    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - inputText.length - 1, // 包含 @ 字符
      },
      end: cursor,
      query: inputText,
    };
  }

  getSuggestions(context: EditorSuggestContext): SuggestItem[] | Promise<SuggestItem[]> {
    const query = context.query.toLowerCase();
    return this.assignees.filter((a) => {
      return a.label.toLowerCase().startsWith(query) || a.label.toLowerCase().includes(query);
    });
  }

  renderSuggestion(value: SuggestItem, el: HTMLElement): void {
    const tagEl = el.createEl('a', {
      cls: `tag ${c('item-tag')}`,
      text: `@${value.label}`,
    });
    if (value.color || value.backgroundColor) {
      tagEl.style.setProperty('--tag-color', value.color || '');
      tagEl.style.setProperty('--tag-background', value.backgroundColor || '');
    }
  }

  selectSuggestion(value: SuggestItem): void {
    const { context } = this;
    if (!context) return;

    // 将 @xxx 转换为 #@xxx
    const replacement = `#@${value.label} `;
    context.editor.replaceRange(replacement, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + replacement.length,
    });
    context.editor.focus();
  }

  close(): void {
    super.close();
    this.assignees = null;
  }
}
