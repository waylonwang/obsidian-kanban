import { EditorView } from '@codemirror/view';
import { memo } from 'preact/compat';
import {
  Dispatch,
  StateUpdater,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'preact/hooks';
import { StateManager } from 'src/StateManager';
import { useNestedEntityPath } from 'src/dnd/components/Droppable';
import { Path } from 'src/dnd/types';
import { getTaskStatusDone, toggleTaskString } from 'src/parsers/helpers/inlineMetadata';

import { MarkdownEditor, allowNewLine } from '../Editor/MarkdownEditor';
import {
  MarkdownClonedPreviewRenderer,
  MarkdownRenderer,
} from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext, SearchContext } from '../context';
import { c, useGetDateColorFn, useGetTagColorFn } from '../helpers';
import { EditState, EditingState, Item, isEditing } from '../types';
import { DateAndTime, RelativeDate } from './DateAndTime';
import { InlineMetadata } from './InlineMetadata';
import {
  constructDatePicker,
  constructMenuDatePickerOnChange,
  constructMenuTimePickerOnChange,
  constructTimePicker,
} from './helpers';

export function useDatePickers(item: Item, explicitPath?: Path) {
  const { stateManager, boardModifiers } = useContext(KanbanContext);
  const path = explicitPath || useNestedEntityPath();

  return useMemo(() => {
    const onEditDate = (e: MouseEvent) => {
      constructDatePicker(
        e.view,
        stateManager,
        { x: e.clientX, y: e.clientY },
        constructMenuDatePickerOnChange({
          stateManager,
          boardModifiers,
          item,
          hasDate: true,
          path,
        }),
        item.data.metadata.date?.toDate()
      );
    };

    const onEditTime = (e: MouseEvent) => {
      constructTimePicker(
        e.view, // Preact uses real events, so this is safe
        stateManager,
        { x: e.clientX, y: e.clientY },
        constructMenuTimePickerOnChange({
          stateManager,
          boardModifiers,
          item,
          hasTime: true,
          path,
        }),
        item.data.metadata.time
      );
    };

    return {
      onEditDate,
      onEditTime,
    };
  }, [boardModifiers, path, item, stateManager]);
}

export interface ItemContentProps {
  item: Item;
  setEditState: Dispatch<StateUpdater<EditState>>;
  searchQuery?: string;
  showMetadata?: boolean;
  editState: EditState;
  isStatic: boolean;
}

function checkCheckbox(stateManager: StateManager, title: string, checkboxIndex: number) {
  let count = 0;

  const lines = title.split(/\n\r?/g);
  const results: string[] = [];

  lines.forEach((line) => {
    if (count > checkboxIndex) {
      results.push(line);
      return;
    }

    const match = line.match(/^(\s*>)*(\s*[-+*]\s+?\[)([^\]])(\]\s+)/);

    if (match) {
      if (count === checkboxIndex) {
        const updates = toggleTaskString(line, stateManager.file);
        if (updates) {
          results.push(updates);
        } else {
          const check = match[3] === ' ' ? getTaskStatusDone() : ' ';
          const m1 = match[1] ?? '';
          const m2 = match[2] ?? '';
          const m4 = match[4] ?? '';
          results.push(m1 + m2 + check + m4 + line.slice(match[0].length));
        }
      } else {
        results.push(line);
      }
      count++;
      return;
    }

    results.push(line);
  });

  return results.join('\n');
}

export function Tags({
  tags,
  searchQuery,
  alwaysShow,
}: {
  tags?: string[];
  searchQuery?: string;
  alwaysShow?: boolean;
}) {
  const { stateManager } = useContext(KanbanContext);
  const getTagColor = useGetTagColorFn(stateManager);
  const search = useContext(SearchContext);
  const shouldShow = stateManager.useSetting('move-tags') || alwaysShow;

  if (!tags.length || !shouldShow) return null;

  return (
    <div className={c('item-tags')}>
      {tags.map((tag, i) => {
        const tagColor = getTagColor(tag);

        return (
          <a
            href={tag}
            onClick={(e) => {
              e.preventDefault();

              const tagAction = stateManager.getSetting('tag-action');
              if (search && tagAction === 'kanban') {
                search.search(tag, true);
                return;
              }

              (stateManager.app as any).internalPlugins
                .getPluginById('global-search')
                .instance.openGlobalSearch(`tag:${tag}`);
            }}
            key={i}
            className={`tag ${c('item-tag')} ${
              searchQuery && tag.toLocaleLowerCase().contains(searchQuery) ? 'is-search-match' : ''
            }`}
            style={
              tagColor && {
                '--tag-color': tagColor.color,
                '--tag-background': tagColor.backgroundColor,
              }
            }
          >
            <span>{tag[0]}</span>
            {tag.slice(1)}
          </a>
        );
      })}
    </div>
  );
}

// Helper to get color for priority/assignee
function useGetLabelColorFn(stateManager: StateManager, settingKey: 'priority-options' | 'assignee-options') {
  return useCallback(
    (label: string) => {
      const options = stateManager.getSetting(settingKey) as { label: string; color?: string; backgroundColor?: string }[] | undefined;
      if (!options) return null;
      const option = options.find(o => o.label === label);
      return option ? { color: option.color, backgroundColor: option.backgroundColor } : null;
    },
    [stateManager, settingKey]
  );
}

export function Priorities({
  priorities,
  searchQuery,
}: {
  priorities?: string[];
  searchQuery?: string;
}) {
  const { stateManager } = useContext(KanbanContext);
  const search = useContext(SearchContext);
  const getPriorityColor = useGetLabelColorFn(stateManager, 'priority-options');
  const shouldShow = stateManager.useSetting('move-tags'); // Share move-tags setting

  if (!priorities?.length || !shouldShow) return null;

  return (
    <div className={c('item-priorities')}>
      {priorities.map((priority, i) => {
        const colorInfo = getPriorityColor(priority);

        return (
          <a
            key={i}
            className={`tag ${c('item-tag')} ${c('item-priority')} ${
              searchQuery && priority.toLocaleLowerCase().contains(searchQuery) ? 'is-search-match' : ''
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const tagAction = stateManager.getSetting('tag-action');
              if (search && tagAction === 'kanban') {
                search.search('!' + priority, true);
                return;
              }
              const searchPlugin = (stateManager.app as any).internalPlugins.getPluginById('global-search');
              if (searchPlugin && searchPlugin.instance) {
                searchPlugin.instance.openGlobalSearch();
                // 直接设置搜索查询
                setTimeout(() => {
                  const searchInput = document.querySelector('.search-input-container input');
                  if (searchInput) {
                    (searchInput as HTMLInputElement).value = `!${priority}`;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 50);
              }
            }}
            style={
              colorInfo && {
                '--tag-color': colorInfo.color || '',
                '--tag-background': colorInfo.backgroundColor || '',
              }
            }
          >
            <svg class={c('item-priority-icon')} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
              <path d="M7 21h10" />
              <path d="M12 3v18" />
              <path d="M3 7h1c3 0 6-2 6-5" />
              <path d="M20 7h-1c-3 0-6-2-6-5" />
            </svg>
            {priority}
          </a>
        );
      })}
    </div>
  );
}

export function Assignees({
  assignees,
  searchQuery,
}: {
  assignees?: string[];
  searchQuery?: string;
}) {
  const { stateManager } = useContext(KanbanContext);
  const search = useContext(SearchContext);
  const getAssigneeColor = useGetLabelColorFn(stateManager, 'assignee-options');
  const shouldShow = stateManager.useSetting('move-tags'); // Share move-tags setting

  if (!assignees?.length || !shouldShow) return null;

  return (
    <div className={c('item-assignees')}>
      {assignees.map((assignee, i) => {
        const colorInfo = getAssigneeColor(assignee);

        return (
          <a
            key={i}
            className={`tag ${c('item-tag')} ${c('item-assignee')} ${
              searchQuery && assignee.toLocaleLowerCase().contains(searchQuery) ? 'is-search-match' : ''
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const tagAction = stateManager.getSetting('tag-action');
              if (search && tagAction === 'kanban') {
                search.search('@' + assignee, true);
                return;
              }
              const searchPlugin = (stateManager.app as any).internalPlugins.getPluginById('global-search');
              if (searchPlugin && searchPlugin.instance) {
                searchPlugin.instance.openGlobalSearch();
                // 直接设置搜索查询
                setTimeout(() => {
                  const searchInput = document.querySelector('.search-input-container input');
                  if (searchInput) {
                    (searchInput as HTMLInputElement).value = `@${assignee}`;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 50);
              }
            }}
            style={
              colorInfo && {
                '--tag-color': colorInfo.color || '',
                '--tag-background': colorInfo.backgroundColor || '',
              }
            }
          >
            <svg class={c('item-assignee-icon')} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {assignee}
          </a>
        );
      })}
    </div>
  );
}

export const ItemContent = memo(function ItemContent({
  item,
  editState,
  setEditState,
  searchQuery,
  showMetadata = true,
  isStatic,
}: ItemContentProps) {
  const { stateManager, filePath, boardModifiers } = useContext(KanbanContext);
  const getDateColor = useGetDateColorFn(stateManager);
  const titleRef = useRef<string | null>(null);

  useEffect(() => {
    if (editState === EditingState.complete) {
      if (titleRef.current !== null) {
        boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRef.current));
      }
      titleRef.current = null;
    } else if (editState === EditingState.cancel) {
      titleRef.current = null;
    }
  }, [editState, stateManager, item]);

  const path = useNestedEntityPath();
  const { onEditDate, onEditTime } = useDatePickers(item);
  const onEnter = useCallback(
    (cm: EditorView, mod: boolean, shift: boolean) => {
      if (!allowNewLine(stateManager, mod, shift)) {
        setEditState(EditingState.complete);
        return true;
      }
    },
    [stateManager]
  );

  const onWrapperClick = useCallback(
    (e: MouseEvent) => {
      if (e.targetNode.instanceOf(HTMLElement)) {
        if (e.targetNode.hasClass(c('item-metadata-date'))) {
          onEditDate(e);
        } else if (e.targetNode.hasClass(c('item-metadata-time'))) {
          onEditTime(e);
        }
      }
    },
    [onEditDate, onEditTime]
  );

  const onSubmit = useCallback(() => setEditState(EditingState.complete), []);

  const onEscape = useCallback(() => {
    setEditState(EditingState.cancel);
    return true;
  }, [item]);

  const onCheckboxContainerClick = useCallback(
    (e: PointerEvent) => {
      const target = e.target as HTMLElement;

      if (target.hasClass('task-list-item-checkbox')) {
        if (target.dataset.src) {
          return;
        }

        const checkboxIndex = parseInt(target.dataset.checkboxIndex, 10);
        const checked = checkCheckbox(stateManager, item.data.titleRaw, checkboxIndex);
        const updated = stateManager.updateItemContent(item, checked);

        boardModifiers.updateItem(path, updated);
      }
    },
    [path, boardModifiers, stateManager, item]
  );

  if (!isStatic && isEditing(editState)) {
    return (
      <div className={c('item-input-wrapper')}>
        <MarkdownEditor
          editState={editState}
          className={c('item-input')}
          onEnter={onEnter}
          onEscape={onEscape}
          onSubmit={onSubmit}
          value={item.data.titleRaw}
          onChange={(update) => {
            if (update.docChanged) {
              titleRef.current = update.state.doc.toString().trim();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div onClick={onWrapperClick} className={c('item-title')}>
      {isStatic ? (
        <MarkdownClonedPreviewRenderer
          entityId={item.id}
          className={c('item-markdown')}
          markdownString={item.data.title}
          searchQuery={searchQuery}
          onPointerUp={onCheckboxContainerClick}
        />
      ) : (
        <MarkdownRenderer
          entityId={item.id}
          className={c('item-markdown')}
          markdownString={item.data.title}
          searchQuery={searchQuery}
          onPointerUp={onCheckboxContainerClick}
        />
      )}
      {showMetadata && (
        <div className={c('item-metadata')}>
          <Priorities priorities={item.data.metadata.priorities} searchQuery={searchQuery} />
          <Assignees assignees={item.data.metadata.assignees} searchQuery={searchQuery} />
          <RelativeDate item={item} stateManager={stateManager} />
          <DateAndTime
            item={item}
            stateManager={stateManager}
            filePath={filePath}
            getDateColor={getDateColor}
          />
          <InlineMetadata item={item} stateManager={stateManager} />
          <Tags tags={item.data.metadata.tags} searchQuery={searchQuery} />
        </div>
      )}
    </div>
  );
});
