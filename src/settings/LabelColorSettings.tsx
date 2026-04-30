import classcat from 'classcat';
import update from 'immutability-helper';
import {
  JSX,
  render,
  unmountComponentAtNode,
  useMemo,
  useState,
  createPortal,
  useContext,
  useEffect,
  useRef,
} from 'preact/compat';

import { Icon } from '../components/Icon/Icon';
import { c, generateInstanceId, noop } from '../components/helpers';
import { DataTypes, LabelColorSetting, LabelColorSettingTemplate } from '../components/types';
import { DndContext } from '../dnd/components/DndContext';
import { DragOverlay } from '../dnd/components/DragOverlay';
import { Droppable } from '../dnd/components/Droppable';
import { DndScope } from '../dnd/components/Scope';
import { SortPlaceholder } from '../dnd/components/SortPlaceholder';
import { Sortable } from '../dnd/components/Sortable';
import { DndManagerContext } from '../dnd/components/context';
import { useDragHandle } from '../dnd/managers/DragManager';
import { Entity } from '../dnd/types';
import { getParentBodyElement, getParentWindow } from '../dnd/util/getWindow';
import { t } from '../lang/helpers';
import { ColorPickerInput } from './TagColorSettings';

export interface LabelColorItem {
  label: string;
  color: string;
  backgroundColor: string;
}

interface ItemProps {
  defaultColors: { color: string; backgroundColor: string };
  deleteKey: () => void;
  itemKey: LabelColorItem;
  updateKey: (label: string, color: string, backgroundColor: string) => void;
  labelPlaceholder: string;
  prefixChar: string;
  itemIndex: number;
  isStatic?: boolean;
  itemId: string;
}

function Item({ itemKey, deleteKey, updateKey, defaultColors, labelPlaceholder, prefixChar, itemIndex, isStatic, itemId }: ItemProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const bindHandle = useDragHandle(measureRef, dragHandleRef);

  const body = (
    <div className={`${c('setting-controls-wrapper')} ${c('tag-color-input')}`}>
      <div className={c('setting-input-wrapper')}>
        <div>
          <div className={c('setting-item-label')}>{t('Label')}</div>
          <input
            type="text"
            placeholder={labelPlaceholder}
            value={itemKey.label}
            onChange={(e) => {
              const val = e.currentTarget.value;
              updateKey(val, itemKey.color, itemKey.backgroundColor);
            }}
          />
        </div>
        <div>
          <div className={c('setting-item-label')}>{t('Background color')}</div>
          <ColorPickerInput
            color={itemKey.backgroundColor}
            setColor={(color) => {
              updateKey(itemKey.label, itemKey.color, color);
            }}
            defaultColor={defaultColors.backgroundColor}
          />
        </div>
        <div>
          <div className={c('setting-item-label')}>{t('Text color')}</div>
          <ColorPickerInput
            color={itemKey.color}
            setColor={(color) => {
              updateKey(itemKey.label, color, itemKey.backgroundColor);
            }}
            defaultColor={defaultColors.color}
          />
        </div>
      </div>
      <div className={c('setting-toggle-wrapper')}>
        <div>
          <div className={c('item-tags')}>
            <a className={`tag ${c('item-tag')}`}>{prefixChar}示例1</a>
            <a
              className={`tag ${c('item-tag')}`}
              style={{
                '--tag-color': itemKey.color,
                '--tag-background': itemKey.backgroundColor,
              }}
            >
              {prefixChar}{itemKey.label || labelPlaceholder}
            </a>
            <a className={`tag ${c('item-tag')}`}>{prefixChar}示例2</a>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={measureRef} className={c('setting-item-wrapper')}>
      <div ref={elementRef} className={c('setting-item')}>
        {isStatic ? (
          body
        ) : (
          <Droppable
            elementRef={elementRef}
            measureRef={measureRef}
            id={itemId}
            index={itemIndex}
            data={{
              id: itemId,
              type: DataTypes.LabelColorSetting,
              accepts: [DataTypes.LabelColorSetting],
              children: [],
              data: itemKey,
            }}
          >
            {body}
          </Droppable>
        )}
        <div className={c('setting-button-wrapper')}>
          <div className="clickable-icon" onClick={deleteKey} aria-label={t('Delete')}>
            <Icon name="lucide-trash-2" />
          </div>
          <div
            className="mobile-option-setting-drag-icon clickable-icon"
            aria-label={t('Drag to rearrange')}
            ref={bindHandle}
          >
            <Icon name="lucide-grip-horizontal" />
          </div>
        </div>
      </div>
    </div>
  );
}

const accepts = [DataTypes.LabelColorSetting];

interface OverlayProps {
  keys: LabelColorSetting[];
  portalContainer: HTMLElement;
  defaultColors: { color: string; backgroundColor: string };
  labelPlaceholder: string;
  prefixChar: string;
}

function Overlay({ keys, portalContainer, defaultColors, labelPlaceholder, prefixChar }: OverlayProps) {
  return createPortal(
    <DragOverlay>
      {(entity, styles) => {
        const path = entity.getPath();
        const index = path[0];
        const item = keys[index];

        return (
          <div
            className={classcat([c('drag-container'), c('label-color-input-wrapper')])}
            style={styles}
          >
            <Item
              itemKey={item.data}
              itemIndex={index}
              itemId={item.id}
              updateKey={noop}
              deleteKey={noop}
              defaultColors={defaultColors}
              labelPlaceholder={labelPlaceholder}
              prefixChar={prefixChar}
              isStatic={true}
            />
          </div>
        );
      }}
    </DragOverlay>,
    portalContainer
  );
}

function RespondToScroll({ scrollEl }: { scrollEl: HTMLElement }): JSX.Element | null {
  const dndManager = useContext(DndManagerContext);

  useEffect(() => {
    let debounce = 0;

    const onScroll = () => {
      scrollEl.win.clearTimeout(debounce);
      debounce = scrollEl.win.setTimeout(() => {
        dndManager?.hitboxEntities.forEach((entity) => {
          entity.recalcInitial();
        });
      }, 100);
    };

    scrollEl.addEventListener('scroll', onScroll, {
      passive: true,
      capture: false,
    });

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
    };
  }, [scrollEl, dndManager]);

  return null;
}

interface LabelSettingsProps {
  dataKeys: LabelColorSetting[];
  onChange: (settings: LabelColorSetting[]) => void;
  title: string;
  description: string;
  addButtonText: string;
  labelPlaceholder: string;
  prefixChar: string;
  scrollEl: HTMLElement;
}

function LabelSettings({ dataKeys, onChange, title, description, addButtonText, labelPlaceholder, prefixChar, scrollEl }: LabelSettingsProps) {
  const [keys, setKeys] = useState(dataKeys);
  const win = getParentWindow(scrollEl);
  const defaultColors = useMemo(() => {
    const wrapper = createDiv(c('item-tags'));
    const tag = wrapper.createEl('a', c('item-tag'));

    wrapper.style.position = 'absolute';
    wrapper.style.visibility = 'hidden';

    activeDocument.body.append(wrapper);

    const props = activeWindow.getComputedStyle(tag);
    const color = props.getPropertyValue('color').trim();
    const backgroundColor = props.getPropertyValue('background-color').trim();

    wrapper.remove();

    return {
      color,
      backgroundColor,
    };
  }, []);

  const updateKeys = (keys: LabelColorSetting[]) => {
    onChange(keys);
    setKeys(keys);
  };

  const newKey = () => {
    updateKeys(
      update(keys, {
        $push: [
          {
            ...LabelColorSettingTemplate,
            id: generateInstanceId(),
            data: {
              label: '',
              color: '',
              backgroundColor: '',
            },
          },
        ],
      })
    );
  };

  const deleteKey = (i: number) => {
    updateKeys(
      update(keys, {
        $splice: [[i, 1]],
      })
    );
  };

  const updateItemColor =
    (i: number) => (label: string, color: string, backgroundColor: string) => {
      updateKeys(
        update(keys, {
          [i]: {
            data: {
              label: {
                $set: label,
              },
              color: {
                $set: color,
              },
              backgroundColor: {
                $set: backgroundColor,
              },
            },
          },
        })
      );
    };

  const moveKey = (drag: Entity, drop: Entity) => {
    const dragPath = drag.getPath();
    const dropPath = drop.getPath();

    const dragIndex = dragPath[dragPath.length - 1];
    const dropIndex = dropPath[dropPath.length - 1];

    if (dragIndex === dropIndex) {
      return;
    }

    const clone = keys.slice();
    const [removed] = clone.splice(dragIndex, 1);
    clone.splice(dropIndex, 0, removed);

    updateKeys(clone);
  };

  return (
    <div className={c('label-color-input-wrapper')}>
      <div className="setting-item-info">
        <div className="setting-item-name">{title}</div>
        <div className="setting-item-description">{description}</div>
      </div>
      <div>
        <DndContext win={win} onDrop={moveKey}>
          <RespondToScroll scrollEl={scrollEl} />
          <DndScope>
            <Sortable axis="vertical">
              {keys.map((key, index) => {
                return (
                  <Item
                    key={key.id}
                    itemKey={key.data}
                    itemIndex={index}
                    itemId={key.id}
                    deleteKey={() => deleteKey(index)}
                    updateKey={updateItemColor(index)}
                    defaultColors={defaultColors}
                    labelPlaceholder={labelPlaceholder}
                    prefixChar={prefixChar}
                  />
                );
              })}
              <SortPlaceholder accepts={accepts} index={keys.length} />
            </Sortable>
          </DndScope>
          <Overlay keys={keys} portalContainer={getParentBodyElement(scrollEl)} defaultColors={defaultColors} labelPlaceholder={labelPlaceholder} prefixChar={prefixChar} />
        </DndContext>
      </div>
      <button
        className={c('add-tag-color-button')}
        onClick={() => {
          newKey();
        }}
      >
        {addButtonText}
      </button>
    </div>
  );
}

export function renderLabelColorSettings(
  containerEl: HTMLElement,
  keys: LabelColorSetting[],
  onChange: (key: LabelColorSetting[]) => void,
  title: string,
  description: string,
  addButtonText: string,
  labelPlaceholder: string,
  prefixChar: string
) {
  render(
    <LabelSettings
      dataKeys={keys}
      onChange={onChange}
      title={title}
      description={description}
      addButtonText={addButtonText}
      labelPlaceholder={labelPlaceholder}
      prefixChar={prefixChar}
      scrollEl={containerEl}
    />,
    containerEl
  );
}

export function cleanUpLabelColorSettings(containerEl: HTMLElement) {
  unmountComponentAtNode(containerEl);
}