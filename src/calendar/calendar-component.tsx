import { useState, useEffect } from 'preact/hooks';
import { h } from 'preact';
import { KanbanTask, TaskColorConfig } from './types';

interface CalendarComponentProps {
  tasks: KanbanTask[];
  taskColors?: TaskColorConfig[];
  hideWeekends?: boolean;
  availableLists?: string[];
  onTaskClick?: (task: KanbanTask) => void;
  onOpenFile?: (task: KanbanTask) => void;
  onOpenLinkedNote?: (noteName: string) => void;
  onTaskMove?: (task: KanbanTask, newDate: string) => void;
  onTaskUpdate?: (task: KanbanTask, updates: { description?: string; date?: string; time?: string; completed?: boolean }) => void;
  onTaskCreate?: (taskData: { description: string; date: string; listName: string; time?: string; tags: string[] }) => void;
  onDateChange?: (date: string) => void;
  initialView?: 'week' | 'month' | 'year';
  initialDate?: string;
  calendarLocation?: 'view' | 'sidebar';
  onLocationChange?: (location: 'view' | 'sidebar') => void;
}

export const CalendarComponent = ({
  tasks,
  taskColors = [],
  hideWeekends = false,
  availableLists = [],
  onTaskClick,
  onOpenFile,
  onOpenLinkedNote,
  onTaskMove,
  onTaskUpdate,
  onTaskCreate,
  onDateChange,
  initialView = 'month',
  initialDate = new Date().toISOString(),
  calendarLocation = 'view',
  onLocationChange
}: CalendarComponentProps) => {
  const [view, setView] = useState<'week' | 'month' | 'year'>(initialView);
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState<string>('');
  const [isEditingTask, setIsEditingTask] = useState(false);

  // Helper function to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to get task color based on configuration
  const getTaskColor = (task: KanbanTask): string | undefined => {
    const status = task.completed ? 'completed' : 'in-progress';

    // First, look for specific tag + status combinations
    for (const config of taskColors) {
      if (config.tag && config.status === status) {
        // Check if task has this specific tag
        const hasTag = task.tags.some(tag => {
          // Normalize both tag and config.tag for comparison
          const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
          const normalizedConfigTag = config.tag?.startsWith('#') ? config.tag : `#${config.tag}`;

          return normalizedTag === normalizedConfigTag ||
                 tag === config.tag ||
                 tag === config.tag?.replace('#', '') ||
                 `#${tag}` === config.tag;
        });

        if (hasTag) {
          return config.color;
        }
      }
    }

    // Then, look for general status-only configurations
    for (const config of taskColors) {
      if (!config.tag && config.status === status) {
        return config.color;
      }
    }

    return undefined;
  };

  // New Task Modal Component
  const NewTaskModal = () => {
    const [description, setDescription] = useState('');
    const [time, setTime] = useState('');
    const [tags, setTags] = useState('');
    const [listName, setListName] = useState(availableLists.length > 0 ? availableLists[0] : '');

    if (!showNewTaskModal) return null;

    const handleClose = () => {
      setShowNewTaskModal(false);
      setDescription('');
      setTime('');
      setTags('');
      setListName(availableLists.length > 0 ? availableLists[0] : '');
    };

    const handleSubmit = (e: Event) => {
      e.preventDefault();

      if (!description.trim() || !listName) return;

      const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

      if (onTaskCreate) {
        onTaskCreate({
          description: description.trim(),
          date: newTaskDate,
          listName: listName,
          time: time.trim() || undefined,
          tags: tagArray
        });
      }

      handleClose();
    };

    // If no lists available, show a message
    if (availableLists.length === 0) {
      return (
        <div className="kanban-calendar-modal-overlay" onClick={handleClose}>
          <div className="kanban-calendar-modal-content" onClick={e => e.stopPropagation()}>
            <div className="kanban-calendar-modal-header">
              <h3>无法创建任务</h3>
              <button className="kanban-calendar-modal-close" onClick={handleClose}>×</button>
            </div>
            <div className="kanban-calendar-modal-body">
              <p>当前文件不是 Kanban 格式，或未找到任何列表。</p>
              <p>请打开一个包含 Kanban 列表（## 标题）的文件。</p>
            </div>
            <div className="kanban-calendar-modal-footer">
              <button className="kanban-calendar-cancel-button" onClick={handleClose}>关闭</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="kanban-calendar-modal-overlay" onClick={handleClose}>
        <div className="kanban-calendar-modal-content" onClick={e => e.stopPropagation()}>
          <div className="kanban-calendar-modal-header">
            <h3>创建新任务</h3>
            <button className="kanban-calendar-modal-close" onClick={handleClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="kanban-calendar-modal-body">
              <div className="kanban-calendar-form-group">
                <label htmlFor="task-list"><strong>列表：</strong></label>
                <select
                  id="task-list"
                  value={listName}
                  onChange={(e) => setListName((e.target as HTMLSelectElement).value)}
                  required
                >
                  {availableLists.map(list => (
                    <option key={list} value={list}>{list}</option>
                  ))}
                </select>
              </div>

              <div className="kanban-calendar-form-group">
                <label htmlFor="task-description"><strong>描述：</strong></label>
                <input
                  id="task-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription((e.target as HTMLInputElement).value)}
                  placeholder="输入任务描述..."
                  autoFocus
                  required
                />
              </div>

              <div className="kanban-calendar-form-group">
                <label htmlFor="task-date"><strong>日期：</strong></label>
                <input
                  id="task-date"
                  type="date"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate((e.target as HTMLInputElement).value)}
                  required
                />
              </div>

              <div className="kanban-calendar-form-group">
                <label htmlFor="task-time"><strong>时间（可选）：</strong></label>
                <input
                  id="task-time"
                  type="text"
                  value={time}
                  onChange={(e) => setTime((e.target as HTMLInputElement).value)}
                  placeholder="例如：09:30 或 09:00-11:30"
                />
                <small>格式：09:30（单个时间）或 09:00-11:30（时间段）</small>
              </div>

              <div className="kanban-calendar-form-group">
                <label htmlFor="task-tags"><strong>标签（可选）：</strong></label>
                <input
                  id="task-tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags((e.target as HTMLInputElement).value)}
                  placeholder="例如：工作、重要（用逗号分隔）"
                />
              </div>
            </div>

            <div className="kanban-calendar-modal-footer">
              <button type="button" onClick={handleClose} className="kanban-calendar-cancel-button">
                取消
              </button>
              <button type="submit" className="kanban-calendar-open-file-button">
                创建任务
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Task Modal Component
  const TaskModal = () => {
    const [editDescription, setEditDescription] = useState('');
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editCompleted, setEditCompleted] = useState(false);

    if (!selectedTask || !showTaskModal) return null;

    // Initialize edit values when task is selected
    useEffect(() => {
      if (selectedTask) {
        setEditDescription(selectedTask.description);
        setEditDate(selectedTask.date);
        setEditTime(selectedTask.time || '');
        setEditCompleted(selectedTask.completed);
      }
    }, [selectedTask]);

    const handleClose = () => {
      setShowTaskModal(false);
      setSelectedTask(null);
      setIsEditingTask(false);
    };

    const handleSaveChanges = () => {
      if (!selectedTask || !onTaskUpdate) return;

      const updates: { description?: string; date?: string; time?: string; completed?: boolean } = {};

      if (editDescription !== selectedTask.description) {
        updates.description = editDescription;
      }
      if (editDate !== selectedTask.date) {
        updates.date = editDate;
      }
      if (editTime !== (selectedTask.time || '')) {
        updates.time = editTime || undefined;
      }
      if (editCompleted !== selectedTask.completed) {
        updates.completed = editCompleted;
      }

      if (Object.keys(updates).length > 0) {
        onTaskUpdate(selectedTask, updates);
      }

      setIsEditingTask(false);
    };

    // Generate tag colors based on tag name
    const getTagColor = (tag: string) => {
      const hash = tag.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
      }, 0);

      const hue = hash % 360;
      return `hsl(${hue}, 70%, 50%)`;
    };

    return (
      <div className="kanban-calendar-modal-overlay" onClick={handleClose}>
        <div className="kanban-calendar-modal-content" onClick={e => e.stopPropagation()}>
          <div className="kanban-calendar-modal-header">
            <h3>任务详情</h3>
            <button className="kanban-calendar-modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="kanban-calendar-modal-body">
            {!isEditingTask ? (
              <>
                <div className={`kanban-calendar-task-status ${selectedTask.completed ? 'completed' : ''}`}>
                  {selectedTask.completed ? '已完成' : '进行中'}
                </div>

                <div className="kanban-calendar-task-description">
                  {selectedTask.description}
                </div>

                <div className="kanban-calendar-task-meta">
                  <div><strong>日期：</strong> {selectedTask.date}</div>
                  {selectedTask.time && (
                    <div><strong>时间：</strong> {selectedTask.time}</div>
                  )}
                </div>

                {selectedTask.tags.length > 0 && (
                  <div className="kanban-calendar-task-tags">
                    <strong>标签：</strong>
                    <div className="kanban-calendar-tags-container">
                      {selectedTask.tags.map(tag => (
                        <span
                          key={tag}
                          className="kanban-calendar-tag"
                          style={{ backgroundColor: getTagColor(tag) }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="kanban-calendar-task-source">
                  <strong>来源：</strong> {selectedTask.source.split('/').pop()}
                </div>

                {selectedTask.listName && (
                  <div className="kanban-calendar-task-list">
                    <strong>看板列表：</strong> {selectedTask.listName}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="kanban-calendar-form-group">
                  <label><strong>描述：</strong></label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription((e.target as HTMLInputElement).value)}
                  />
                </div>

                <div className="kanban-calendar-form-group">
                  <label><strong>日期：</strong></label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate((e.target as HTMLInputElement).value)}
                  />
                </div>

                <div className="kanban-calendar-form-group">
                  <label><strong>时间：</strong></label>
                  <input
                    type="text"
                    value={editTime}
                    onChange={(e) => setEditTime((e.target as HTMLInputElement).value)}
                    placeholder="例如：09:30 或 09:00-11:30"
                  />
                </div>

                <div className="kanban-calendar-form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editCompleted}
                      onChange={(e) => setEditCompleted((e.target as HTMLInputElement).checked)}
                    />
                    <strong> 已完成</strong>
                  </label>
                </div>
              </>
            )}

            <div className="kanban-calendar-modal-footer">
              {!isEditingTask ? (
                <>
                  <button
                    className="kanban-calendar-cancel-button"
                    onClick={() => setIsEditingTask(true)}
                  >
                    编辑
                  </button>
                  {selectedTask.linkedNote && onOpenLinkedNote && (
                    <button
                      className="kanban-calendar-linked-note-button"
                      onClick={() => {
                        if (selectedTask.linkedNote && onOpenLinkedNote) {
                          onOpenLinkedNote(selectedTask.linkedNote);
                          handleClose();
                        }
                      }}
                      title={`打开笔记"${selectedTask.linkedNote}"`}
                    >
                      📝 打开笔记
                    </button>
                  )}
                  <button
                    className="kanban-calendar-open-file-button"
                    onClick={() => {
                      if (selectedTask && onOpenFile) {
                        onOpenFile(selectedTask);
                        handleClose();
                      }
                    }}
                  >
                    在看板中打开
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="kanban-calendar-cancel-button"
                    onClick={() => setIsEditingTask(false)}
                  >
                    取消
                  </button>
                  <button
                    className="kanban-calendar-open-file-button"
                    onClick={handleSaveChanges}
                  >
                    保存更改
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Task Item Component
  const TaskItem = ({ task, compact = false }: { task: KanbanTask; compact?: boolean }) => {
    const handleDragStart = (e: DragEvent) => {
      (e.dataTransfer as DataTransfer).setData("text/plain", JSON.stringify(task));
      (e.dataTransfer as DataTransfer).effectAllowed = "move";
    };

    const handleDragEnd = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleTaskClick = (e: MouseEvent) => {
      // Prevent click when dragging
      if (e.defaultPrevented) return;

      setSelectedTask(task);
      setShowTaskModal(true);
      onTaskClick?.(task);
    };

    // Get custom color for this task
    const customColor = getTaskColor(task);
    const taskStyle = customColor ? {
      backgroundColor: customColor,
      color: 'white' // Ensure text is readable on custom backgrounds
    } : {};

    if (compact) {
      return (
        <div
          className={`kanban-calendar-task-compact ${task.completed ? 'completed' : ''}`}
          style={taskStyle}
          title={`${task.time ? task.time + ' - ' : ''}${task.description}`}
          onClick={handleTaskClick}
          draggable={true}
          onDragStart={handleDragStart as any}
          onDragEnd={handleDragEnd as any}
        >
          {task.time && <span className="kanban-calendar-task-time">{task.time}</span>}
          <span>{task.description.length > 20
            ? task.description.substring(0, 20) + '...'
            : task.description}
          </span>
        </div>
      );
    }

    return (
      <div
        className={`kanban-calendar-task ${task.completed ? 'completed' : ''}`}
        style={taskStyle}
        onClick={handleTaskClick}
        draggable={true}
        onDragStart={handleDragStart as any}
        onDragEnd={handleDragEnd as any}
      >
        {task.time && <div className="kanban-calendar-task-time">{task.time}</div>}
        <div className="kanban-calendar-task-description">{task.description}</div>
        <div className="kanban-calendar-task-tags">
          {task.tags.map(tag => (
            <span key={tag} className="kanban-calendar-tag">{tag}</span>
          ))}
        </div>
      </div>
    );
  };

  // Calendar Header Component
  const CalendarHeader = () => {
    const date = new Date(currentDate);

    const navigatePrevious = () => {
      const newDate = new Date(date);
      switch (view) {
        case 'week':
          newDate.setDate(date.getDate() - 7);
          break;
        case 'month':
          newDate.setMonth(date.getMonth() - 1);
          break;
        case 'year':
          newDate.setFullYear(date.getFullYear() - 1);
          break;
      }
      const newDateString = newDate.toISOString();
      setCurrentDate(newDateString);
      onDateChange?.(newDateString);
    };

    const navigateNext = () => {
      const newDate = new Date(date);
      switch (view) {
        case 'week':
          newDate.setDate(date.getDate() + 7);
          break;
        case 'month':
          newDate.setMonth(date.getMonth() + 1);
          break;
        case 'year':
          newDate.setFullYear(date.getFullYear() + 1);
          break;
      }
      const newDateString = newDate.toISOString();
      setCurrentDate(newDateString);
      onDateChange?.(newDateString);
    };

    const navigateToday = () => {
      const newDateString = new Date().toISOString();
      setCurrentDate(newDateString);
      onDateChange?.(newDateString);
    };

    const getHeaderTitle = () => {
      switch (view) {
        case 'week': {
          const weekStart = new Date(date);
          const day = weekStart.getDay();
          const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
          weekStart.setDate(diff);

          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          return `${weekStart.toLocaleDateString('zh-CN')} - ${weekEnd.toLocaleDateString('zh-CN')}`;
        }
        case 'month':
          return date.toLocaleDateString('zh-CN', { month: 'long', year: 'numeric' });
        case 'year':
          return date.getFullYear().toString();
        default:
          return '';
      }
    };

    return (
      <div className="kanban-calendar-header">
        <div className="kanban-calendar-navigation">
          <button onClick={navigatePrevious}>←</button>
          <button onClick={navigateToday}>今天</button>
          <button onClick={navigateNext}>→</button>
        </div>
        <div className="kanban-calendar-title">{getHeaderTitle()}</div>
        <div className="kanban-calendar-controls">
          {onLocationChange && (
            <div className="kanban-calendar-location-toggle">
              <button
                className={calendarLocation === 'view' ? 'active' : ''}
                onClick={() => onLocationChange('view')}
                title="在当前视图页显示"
              >
                视图页
              </button>
              <button
                className={calendarLocation === 'sidebar' ? 'active' : ''}
                onClick={() => onLocationChange('sidebar')}
                title="在侧边栏显示"
              >
                侧边栏
              </button>
            </div>
          )}
          <div className="kanban-calendar-view-selector">
            <button
              className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}
            >
              周
            </button>
            <button
              className={view === 'month' ? 'active' : ''}
              onClick={() => setView('month')}
            >
              月
            </button>
            <button
              className={view === 'year' ? 'active' : ''}
              onClick={() => setView('year')}
            >
              年
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Week View Component
  const WeekView = () => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);

    const startOfWeek = new Date(date);
    startOfWeek.setDate(diff);

    // Generate days for the week, optionally filtering out weekends
    const allDays = Array(7).fill(null).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });

    const days = hideWeekends
      ? allDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6) // Filter out Sunday (0) and Saturday (6)
      : allDays;

    return (
      <div className="kanban-calendar-week-view">
        {days.map(day => {
          const formattedDate = formatDate(day);
          const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            try {
              const taskData = JSON.parse((e.dataTransfer as DataTransfer).getData("text/plain"));
              if (taskData && onTaskMove) {
                onTaskMove(taskData, formattedDate);
              }
            } catch {
              // Ignore invalid drop data
            }
          };

          const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
          };
          const dayTasks = tasks.filter(task => task.date === formattedDate);

          return (
            <div key={formattedDate} className="kanban-calendar-day-column"
              onDrop={handleDrop as any}
              onDragOver={handleDragOver as any}>
              <div className="kanban-calendar-day-header">
                <div>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</div>
                <div className="kanban-calendar-day-number">{day.getDate()}</div>
              </div>
              <div className="kanban-calendar-day-tasks">
                <button
                  className="kanban-calendar-add-task-button"
                  onClick={() => {
                    setNewTaskDate(formattedDate);
                    setShowNewTaskModal(true);
                  }}
                  title="添加新任务"
                >
                  +
                </button>
                {dayTasks.length === 0 ? (
                  <div className="kanban-calendar-no-tasks">无任务</div>
                ) : (
                  dayTasks.map(task => (
                    <TaskItem key={task.id} task={task} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Month View Component
  const MonthView = () => {
    const date = new Date(currentDate);
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const daysToShow: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    if (hideWeekends) {
      // For 5-day week view (Monday to Friday only)
      // Calculate how many workdays before the first day of month
      // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
      const firstDayWeekday = firstDayOfMonth.getDay();

      // Calculate position in 5-day grid (Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4)
      let startPos = 0;
      if (firstDayWeekday >= 1 && firstDayWeekday <= 5) {
        startPos = firstDayWeekday - 1; // Monday=0, ..., Friday=4
      } else if (firstDayWeekday === 6) {
        // Saturday - first day of month is weekend, so it's hidden, start from next Monday (position 0)
        startPos = 0;
      } else if (firstDayWeekday === 0) {
        // Sunday - first day is weekend, hidden, start from next Monday (position 0)
        startPos = 0;
      }

      // Fill preceding workdays from previous month
      let workdaysNeeded = startPos;
      let prevMonthDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
      while (workdaysNeeded > 0) {
        const d = new Date(date.getFullYear(), date.getMonth() - 1, prevMonthDay);
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          daysToShow.unshift({ date: d, isCurrentMonth: false });
          workdaysNeeded--;
        }
        prevMonthDay--;
      }

      // Add all workdays from current month
      for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        const d = new Date(date.getFullYear(), date.getMonth(), i);
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          daysToShow.push({ date: d, isCurrentMonth: true });
        }
      }

      // Fill remaining workdays from next month to complete grid (multiple of 5)
      const remaining = 5 - (daysToShow.length % 5);
      if (remaining < 5) {
        let nextDay = 1;
        let filled = 0;
        while (filled < remaining) {
          const d = new Date(date.getFullYear(), date.getMonth() + 1, nextDay);
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            daysToShow.push({ date: d, isCurrentMonth: false });
            filled++;
          }
          nextDay++;
        }
      }
    } else {
      // Original 7-day week logic
      let startDay = firstDayOfMonth.getDay() - 1;
      if (startDay === -1) startDay = 6;

      const prevMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
      for (let i = startDay; i > 0; i--) {
        const d = new Date(date.getFullYear(), date.getMonth() - 1, prevMonthLastDay - i + 1);
        daysToShow.push({ date: d, isCurrentMonth: false });
      }

      for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
        const d = new Date(date.getFullYear(), date.getMonth(), i);
        daysToShow.push({ date: d, isCurrentMonth: true });
      }

      const remainingDays = 42 - daysToShow.length;
      for (let i = 1; i <= remainingDays; i++) {
        const d = new Date(date.getFullYear(), date.getMonth() + 1, i);
        daysToShow.push({ date: d, isCurrentMonth: false });
      }
    }

    const weekdayHeaders = hideWeekends
      ? ['周一', '周二', '周三', '周四', '周五']
      : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    return (
      <div className="kanban-calendar-month-view">
        <div className="kanban-calendar-weekday-headers">
          {weekdayHeaders.map(day => (
            <div key={day} className="kanban-calendar-weekday-header">{day}</div>
          ))}
        </div>
        <div className={`kanban-calendar-month-grid ${hideWeekends ? 'hide-weekends' : ''}`}>
          {daysToShow.map(({ date, isCurrentMonth }) => {
            const formattedDate = formatDate(date);
            const handleDrop = (e: DragEvent) => {
              e.preventDefault();
              try {
                const taskData = JSON.parse((e.dataTransfer as DataTransfer).getData("text/plain"));
                if (taskData && onTaskMove) {
                  onTaskMove(taskData, formattedDate);
                }
              } catch (error) {
                console.error("Error handling drop:", error);
              }
            };

            const handleDragOver = (e: DragEvent) => {
              e.preventDefault();
            };
            const dayTasks = tasks.filter(task => task.date === formattedDate);
            const isToday = formatDate(new Date()) === formattedDate;

            return (
              <div
                key={formattedDate}
                className={`kanban-calendar-day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                onDrop={handleDrop as any}
                onDragOver={handleDragOver as any}
              >
                <div className="kanban-calendar-day-number">
                  {date.getDate()}
                  <button
                    className="kanban-calendar-add-task-button-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewTaskDate(formattedDate);
                      setShowNewTaskModal(true);
                    }}
                    title="添加新任务"
                  >
                    +
                  </button>
                </div>
                <div className="kanban-calendar-day-cell-tasks">
                  {dayTasks.slice(0, 3).map(task => (
                    <TaskItem key={task.id} task={task} compact={true} />
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="kanban-calendar-more-tasks">还有{dayTasks.length - 3}项</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Year View Component
  const YearView = () => {
    const date = new Date(currentDate);
    const year = date.getFullYear();

    const months = Array(12).fill(null).map((_, i) => {
      return new Date(year, i, 1);
    });

    return (
      <div className="kanban-calendar-year-view">
        {months.map(month => {
          const monthTasks = tasks.filter(task => {
            const taskDate = new Date(task.date);
            return taskDate.getFullYear() === year && taskDate.getMonth() === month.getMonth();
          });

          return (
            <div
              key={month.toISOString()}
              className="kanban-calendar-month-cell"
              onClick={() => {
                const newDateString = month.toISOString();
                setCurrentDate(newDateString);
                setView('month');
                onDateChange?.(newDateString);
              }}
            >
              <div className="kanban-calendar-month-header">
                {month.toLocaleDateString('zh-CN', { month: 'long' })}
              </div>
              <div className="kanban-calendar-month-summary">
                {monthTasks.length > 0 ? (
                  <div className="kanban-calendar-task-count">{monthTasks.length}项任务</div>
                ) : (
                  <div className="kanban-calendar-no-tasks">无任务</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render the appropriate view
  const renderView = () => {
    switch (view) {
      case 'week': return <WeekView />;
      case 'month': return <MonthView />;
      case 'year': return <YearView />;
      default: return <MonthView />;
    }
  };

  return (
    <div className="kanban-calendar-container">
      <CalendarHeader />
      {renderView()}
      <TaskModal />
      <NewTaskModal />
    </div>
  );
};