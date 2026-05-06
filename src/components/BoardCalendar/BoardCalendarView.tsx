import { VNode } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { Board, Item, Lane } from '../types';
import { StateManager } from '../../StateManager';
import { KanbanView } from '../../KanbanView';
import { KanbanTask } from '../../calendar/types';
import { CalendarComponent } from '../../calendar/calendar-component';
import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';

interface BoardCalendarViewProps {
  boardData: Board;
  stateManager: StateManager;
  view: KanbanView;
}

interface LabelColorConfig {
  label: string;
  color?: string;
  backgroundColor?: string;
}

/**
 * 清理title，移除日期时间标记
 */
function cleanTitle(title: string, dateTrigger: string, timeTrigger: string): string {
  // 移除日期标记: %{YYYY-MM-DD} 或自定义触发符
  const datePattern = new RegExp(`${dateTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]+\\}`, 'g');
  let cleaned = title.replace(datePattern, '');

  // 移除时间标记: %%{HH:MM} 或自定义触发符
  const timePattern = new RegExp(`${timeTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]+\\}`, 'g');
  cleaned = cleaned.replace(timePattern, '');

  return cleaned.trim();
}

/**
 * 从title中移除优先级和负责人（当move-priorities-assignees开启时）
 */
function removePrioritiesAndAssigneesFromTitle(title: string, priorities: string[], assignees: string[]): string {
  let cleaned = title;
  // 移除优先级标记 !priority
  priorities.forEach(p => {
    const pattern = new RegExp(`!${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(pattern, '');
  });
  // 移除负责人标记 @assignee
  assignees.forEach(a => {
    const pattern = new RegExp(`@${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(pattern, '');
  });
  return cleaned.trim();
}

/**
 * 从title中移除标签（当move-tags开启时）
 */
function removeTagsFromTitle(title: string, tags: string[]): string {
  let cleaned = title;
  tags.forEach(tag => {
    // 标签可能是 #tag 或 tag 格式
    const tagPattern = new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(tagPattern, '');
  });
  return cleaned.trim();
}

/**
 * 将 Board 数据转换为 KanbanTask 数组
 */
function boardToTasks(
  boardData: Board,
  filePath: string,
  dateTrigger: string,
  timeTrigger: string,
  movePrioritiesAssignees: boolean,
  moveTags: boolean
): KanbanTask[] {
  const tasks: KanbanTask[] = [];

  boardData.children.forEach((lane: Lane) => {
    const listName = lane.data.title;

    lane.children.forEach((item: Item) => {
      const { metadata, checked, title, titleRaw } = item.data;

      // 只有有日期的才显示在日历中
      if (metadata.dateStr) {
        // 提取链接笔记
        let linkedNote: string | undefined;
        const linkMatch = title.match(/\[\[([^\]]+)\]\]/);
        if (linkMatch) {
          linkedNote = linkMatch[1];
        }

        // 清理title：移除日期时间标记
        let cleanedTitle = cleanTitle(titleRaw || title, dateTrigger, timeTrigger);

        // 如果开启move-priorities-assignees，移除优先级和负责人
        const priorities = metadata.priorities || [];
        const assignees = metadata.assignees || [];
        if (movePrioritiesAssignees) {
          cleanedTitle = removePrioritiesAndAssigneesFromTitle(cleanedTitle, priorities, assignees);
        }

        // 如果开启move-tags，移除标签
        const tags = metadata.tags || [];
        if (moveTags) {
          cleanedTitle = removeTagsFromTitle(cleanedTitle, tags);
        }

        const task: KanbanTask = {
          id: item.id,
          description: cleanedTitle,
          titleRaw: cleanedTitle,
          date: metadata.dateStr,
          time: metadata.timeStr,
          startTime: metadata.timeStr,
          endTime: undefined,
          tags: tags,
          priorities: priorities,
          assignees: assignees,
          completed: checked,
          source: filePath,
          linkedNote,
          listName
        };

        tasks.push(task);
      }
    });
  });

  return tasks;
}

/**
 * 从 Board 中提取所有列表名称
 */
function getListsFromBoard(boardData: Board): string[] {
  return boardData.children.map((lane: Lane) => lane.data.title);
}

export const BoardCalendarView = ({ boardData, stateManager, view }: BoardCalendarViewProps) => {
  const filePath = stateManager.file.path;

  // 获取看板配置
  const dateTrigger = stateManager.getSetting('date-trigger') || '@';
  const timeTrigger = stateManager.getSetting('time-trigger') || '@';
  const movePrioritiesAssignees = stateManager.getSetting('move-priorities-assignees') || false;
  const moveTags = stateManager.getSetting('move-tags') || false;
  const priorityOptions = (stateManager.getSetting('priority-options') || []) as LabelColorConfig[];
  const assigneeOptions = (stateManager.getSetting('assignee-options') || []) as LabelColorConfig[];

  // 获取 calendar 设置
  const calendarSettings = stateManager.getSetting('kanban-calendar') || {
    calendarView: 'month',
    hideWeekends: false,
    showCompletedTasks: true,
    taskColors: [
      { status: 'completed', color: '#4caf50' },
      { status: 'in-progress', color: '#2196f3' }
    ]
  };

  // 位置状态：'view' 表示在视图页内，'sidebar' 表示在侧边栏
  const [calendarLocation, setCalendarLocation] = useState<'view' | 'sidebar'>('view');

  // 转换 board 数据为 tasks
  const tasks = useMemo(() => {
    const allTasks = boardToTasks(boardData, filePath, dateTrigger, timeTrigger, movePrioritiesAssignees, moveTags);
    // 根据设置过滤已完成任务
    if (!calendarSettings.showCompletedTasks) {
      return allTasks.filter(t => !t.completed);
    }
    return allTasks;
  }, [boardData, filePath, calendarSettings.showCompletedTasks, dateTrigger, timeTrigger, movePrioritiesAssignees, moveTags]);

  // 获取列表名称
  const availableLists = useMemo(() => getListsFromBoard(boardData), [boardData]);

  // 自定义任务内容渲染函数 - 使用 MarkdownRenderer 渲染链接等
  const renderTaskContent = (task: KanbanTask): VNode => {
    return (
      <MarkdownRenderer
        entityId={task.id}
        className="kanban-calendar-item-markdown"
        markdownString={task.titleRaw}
      />
    );
  };

  // 处理任务点击
  const handleTaskClick = (task: KanbanTask) => {
    // 显示详情弹窗
  };

  // 处理打开文件
  const handleOpenFile = async (task: KanbanTask) => {
    // 在当前视图定位到对应卡片
    // 切换回 board 视图并滚动到对应项
    view.setView('board');
  };

  // 处理任务移动（拖拽改变日期）
  const handleTaskMove = async (task: KanbanTask, newDate: string) => {
    // 需要更新原始卡片的数据
    // 找到对应的 item 并更新其日期
    const lanes = boardData.children;
    for (const lane of lanes) {
      for (const item of lane.children) {
        if (item.id === task.id) {
          // 使用 stateManager 更新数据
          // 这需要实现日期更新逻辑
          break;
        }
      }
    }
  };

  // 处理任务更新
  const handleTaskUpdate = async (task: KanbanTask, updates: {
    description?: string;
    date?: string;
    time?: string;
    completed?: boolean
  }) => {
    // 更新任务数据
  };

  // 处理新建任务
  const handleTaskCreate = async (taskData: {
    description: string;
    date: string;
    listName: string;
    time?: string;
    tags: string[]
  }) => {
    // 在指定列表中创建新卡片
    // 添加新项到指定 lane
  };

  // 处理位置切换
  const handleLocationChange = (location: 'view' | 'sidebar') => {
    setCalendarLocation(location);
    if (location === 'sidebar') {
      // 打开侧边栏日历视图（强制在侧边栏打开）
      view.plugin.activateCalendarView('sidebar');
      // 切换回 board 视图
      view.setView('board');
      // 收起右侧侧边栏
      setTimeout(() => {
        view.app.workspace.rightSplit?.collapse();
      }, 100);
    }
  };

  return (
    <div className="kanban-calendar-board-view">
      <CalendarComponent
        tasks={tasks}
        taskColors={calendarSettings.taskColors}
        hideWeekends={calendarSettings.hideWeekends}
        availableLists={availableLists}
        onTaskClick={handleTaskClick}
        onOpenFile={handleOpenFile}
        onTaskMove={handleTaskMove}
        onTaskUpdate={handleTaskUpdate}
        onTaskCreate={handleTaskCreate}
        initialView={calendarSettings.calendarView}
        calendarLocation={calendarLocation}
        onLocationChange={handleLocationChange}
        renderTaskContent={renderTaskContent}
        movePrioritiesAssignees={movePrioritiesAssignees}
        moveTags={moveTags}
        priorityOptions={priorityOptions}
        assigneeOptions={assigneeOptions}
      />
    </div>
  );
};