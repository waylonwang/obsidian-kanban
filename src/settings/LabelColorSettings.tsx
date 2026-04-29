import update from 'immutability-helper';
import {
  render,
  unmountComponentAtNode,
  useMemo,
  useState,
} from 'preact/compat';

import { Icon } from '../components/Icon/Icon';
import { c, generateInstanceId } from '../components/helpers';
import { t } from '../lang/helpers';
import { ColorPickerInput } from './TagColorSettings';

export interface LabelColorItem {
  label: string;
  color: string;
  backgroundColor: string;
}

export interface LabelColorSetting {
  id: string;
  type: string;
  accepts: string[];
  children: any[];
  data: LabelColorItem;
}

export const LabelColorSettingTemplate = {
  accepts: [] as string[],
  type: 'label-color',
  children: [] as any[],
};

interface ItemProps {
  defaultColors: { color: string; backgroundColor: string };
  deleteKey: () => void;
  itemKey: LabelColorItem;
  updateKey: (label: string, color: string, backgroundColor: string) => void;
  labelPlaceholder: string;
  prefixChar: string;
}

function Item({ itemKey, deleteKey, updateKey, defaultColors, labelPlaceholder, prefixChar }: ItemProps) {
  return (
    <div className={c('setting-item-wrapper')}>
      <div className={c('setting-item')}>
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
        <div className={c('setting-button-wrapper')}>
          <div className="clickable-icon" onClick={deleteKey} aria-label={t('Delete')}>
            <Icon name="lucide-trash-2" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface LabelSettingsProps {
  dataKeys: LabelColorSetting[];
  onChange: (settings: LabelColorSetting[]) => void;
  title: string;
  description: string;
  addButtonText: string;
  labelPlaceholder: string;
  prefixChar: string;
}

function LabelSettings({ dataKeys, onChange, title, description, addButtonText, labelPlaceholder, prefixChar }: LabelSettingsProps) {
  const [keys, setKeys] = useState(dataKeys);
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

  return (
    <div className={c('tag-color-input-wrapper')}>
      <div className="setting-item-info">
        <div className="setting-item-name">{title}</div>
        <div className="setting-item-description">{description}</div>
      </div>
      <div>
        {keys.map((key, index) => (
          <Item
            key={key.id}
            itemKey={key.data}
            deleteKey={() => deleteKey(index)}
            updateKey={updateItemColor(index)}
            defaultColors={defaultColors}
            labelPlaceholder={labelPlaceholder}
            prefixChar={prefixChar}
          />
        ))}
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
    />,
    containerEl
  );
}

export function cleanUpLabelColorSettings(containerEl: HTMLElement) {
  unmountComponentAtNode(containerEl);
}