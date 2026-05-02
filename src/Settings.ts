import update, { Spec } from 'immutability-helper';
import {
  App,
  DropdownComponent,
  Modal,
  PluginSettingTab,
  Setting,
  ToggleComponent,
} from 'obsidian';

import { KanbanView } from './KanbanView';
import {
  c,
  generateInstanceId,
  getDefaultDateFormat,
  getDefaultTimeFormat,
} from './components/helpers';
import {
  DataKey,
  DateColor,
  DateColorSetting,
  DateColorSettingTemplate,
  MetadataSetting,
  MetadataSettingTemplate,
  TagColor,
  TagColorSetting,
  TagColorSettingTemplate,
  TagSort,
  TagSortSetting,
  TagSortSettingTemplate,
  PriorityOption,
  PriorityOptionSetting,
  PriorityOptionSettingTemplate,
  AssigneeOption,
  AssigneeOptionSetting,
  AssigneeOptionSettingTemplate,
} from './components/types';
import { getParentWindow } from './dnd/util/getWindow';
import { t } from './lang/helpers';
import KanbanPlugin from './main';
import { frontmatterKey } from './parsers/common';
import {
  createSearchSelect,
  defaultDateTrigger,
  defaultMetadataPosition,
  defaultTimeTrigger,
  getListOptions,
} from './settingHelpers';
import { cleanUpDateSettings, renderDateSettings } from './settings/DateColorSettings';
import { cleanupMetadataSettings, renderMetadataSettings } from './settings/MetadataSettings';
import { cleanUpTagSettings, renderTagSettings } from './settings/TagColorSettings';
import { cleanUpTagSortSettings, renderTagSortSettings } from './settings/TagSortSettings';
import { cleanUpLabelColorSettings, renderLabelColorSettings } from './settings/LabelColorSettings';
import { KanbanCalendarSettings, DEFAULT_KANBAN_CALENDAR_SETTINGS } from './calendar/types';
import { KanbanParser } from './calendar/kanban-parser';

const numberRegEx = /^\d+(?:\.\d+)?$/;

export type KanbanFormat = 'basic' | 'board' | 'table' | 'list' | 'waterfall' | 'calendar';

export interface KanbanSettings {
  [frontmatterKey]?: KanbanFormat;
  'append-archive-date'?: boolean;
  'archive-date-format'?: string;
  'archive-date-separator'?: string;
  'archive-with-date'?: boolean;
  'date-colors'?: DateColor[];
  'date-display-format'?: string;
  'date-format'?: string;
  'date-picker-week-start'?: number;
  'date-time-display-format'?: string;
  'date-trigger'?: string;
  'full-list-lane-width'?: boolean;
  'hide-card-count'?: boolean;
  'inline-metadata-position'?: 'body' | 'footer' | 'metadata-table';
  'lane-width'?: number;
  'link-date-to-daily-note'?: boolean;
  'list-collapse'?: boolean[];
  'max-archive-size'?: number;
  'metadata-keys'?: DataKey[];
  'move-dates'?: boolean;
  'move-tags'?: boolean;
  'move-priorities-assignees'?: boolean;
  'move-task-metadata'?: boolean;
  'new-card-insertion-method'?: 'prepend' | 'prepend-compact' | 'append';
  'new-line-trigger'?: 'enter' | 'shift-enter';
  'new-note-folder'?: string;
  'new-note-template'?: string;
  'show-add-list'?: boolean;
  'show-archive-all'?: boolean;
  'show-board-settings'?: boolean;
  'show-checkboxes'?: boolean;
  'show-clone-template'?: boolean;
  'show-relative-date'?: boolean;
  'show-search'?: boolean;
  'show-set-view'?: boolean;
  'show-view-as-markdown'?: boolean;
  'table-sizing'?: Record<string, number>;
  'tag-action'?: 'kanban' | 'obsidian';
  'tag-colors'?: TagColor[];
  'tag-sort'?: TagSort[];
  'time-format'?: string;
  'time-trigger'?: string;
  'priority-options'?: PriorityOption[];
  'assignee-options'?: AssigneeOption[];
  'kanban-calendar'?: KanbanCalendarSettings;
}

export interface KanbanViewSettings {
  [frontmatterKey]?: KanbanFormat;
  'list-collapse'?: boolean[];
}

export const settingKeyLookup: Set<keyof KanbanSettings> = new Set([
  frontmatterKey,
  'append-archive-date',
  'archive-date-format',
  'archive-date-separator',
  'archive-with-date',
  'date-colors',
  'date-display-format',
  'date-format',
  'date-picker-week-start',
  'date-time-display-format',
  'date-trigger',
  'full-list-lane-width',
  'hide-card-count',
  'inline-metadata-position',
  'lane-width',
  'link-date-to-daily-note',
  'list-collapse',
  'max-archive-size',
  'metadata-keys',
  'move-dates',
  'move-tags',
  'move-priorities-assignees',
  'move-task-metadata',
  'new-card-insertion-method',
  'new-line-trigger',
  'new-note-folder',
  'new-note-template',
  'show-add-list',
  'show-archive-all',
  'show-board-settings',
  'show-checkboxes',
  'show-clone-template',
  'show-relative-date',
  'show-search',
  'show-set-view',
  'show-view-as-markdown',
  'table-sizing',
  'tag-action',
  'tag-colors',
  'tag-sort',
  'time-format',
  'time-trigger',
  'priority-options',
  'assignee-options',
]);

export type SettingRetriever = <K extends keyof KanbanSettings>(
  key: K,
  supplied?: KanbanSettings
) => KanbanSettings[K];

export interface SettingRetrievers {
  getGlobalSettings: () => KanbanSettings;
  getGlobalSetting: SettingRetriever;
  getSetting: SettingRetriever;
}

export interface SettingsManagerConfig {
  onSettingsChange: (newSettings: KanbanSettings) => void;
}

export class SettingsManager {
  win: Window;
  app: App;
  plugin: KanbanPlugin;
  config: SettingsManagerConfig;
  settings: KanbanSettings;
  cleanupFns: Array<() => void> = [];
  applyDebounceTimer: number = 0;

  constructor(plugin: KanbanPlugin, config: SettingsManagerConfig, settings: KanbanSettings) {
    this.app = plugin.app;
    this.plugin = plugin;
    this.config = config;
    this.settings = settings;
  }

  applySettingsUpdate(spec: Spec<KanbanSettings>) {
    this.win.clearTimeout(this.applyDebounceTimer);

    this.applyDebounceTimer = this.win.setTimeout(() => {
      this.settings = update(this.settings, spec);
      this.config.onSettingsChange(this.settings);
    }, 1000);
  }

  getSetting(key: keyof KanbanSettings, local: boolean) {
    if (local) {
      return [this.settings[key], this.plugin.settings[key]];
    }

    return [this.settings[key], null];
  }

  constructUI(contentEl: HTMLElement, heading: string, local: boolean) {
    this.win = contentEl.win;

    const { templateFiles, vaultFolders, templateWarning } = getListOptions(this.app);

    contentEl.createEl('h3', { text: heading });

    if (local) {
      contentEl.createEl('p', {
        text: t('These settings will take precedence over the default Kanban board settings.'),
      });
    } else {
      contentEl.createEl('p', {
        text: t(
          'Set the default Kanban board settings. Settings can be overridden on a board-by-board basis.'
        ),
      });
    }

    new Setting(contentEl)
      .setName(t('Display card checkbox'))
      .setDesc(t('When toggled, a checkbox will be displayed with each card'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('show-checkboxes', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'show-checkboxes': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('show-checkboxes', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['show-checkboxes'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('New line trigger'))
      .setDesc(
        t(
          'Select whether Enter or Shift+Enter creates a new line. The opposite of what you choose will create and complete editing of cards and lists.'
        )
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('shift-enter', t('Shift + Enter'));
        dropdown.addOption('enter', t('Enter'));

        const [value, globalValue] = this.getSetting('new-line-trigger', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'shift-enter');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'new-line-trigger': {
              $set: value as 'enter' | 'shift-enter',
            },
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Prepend / append new cards'))
      .setDesc(
        t('This setting controls whether new cards are added to the beginning or end of the list.')
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('prepend', t('Prepend'));
        dropdown.addOption('prepend-compact', t('Prepend (compact)'));
        dropdown.addOption('append', t('Append'));

        const [value, globalValue] = this.getSetting('new-card-insertion-method', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'append');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'new-card-insertion-method': {
              $set: value as 'prepend' | 'append',
            },
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Hide card counts in list titles'))
      .setDesc(t('When toggled, card counts are hidden from the list title'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('hide-card-count', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'hide-card-count': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('hide-card-count', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['hide-card-count'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('List width'))
      .setDesc(t('Enter a number to set the list width in pixels.'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('lane-width', local);

        text.inputEl.setAttr('type', 'number');
        text.inputEl.placeholder = `${globalValue ? globalValue : '272'} (default)`;
        text.inputEl.value = value ? value.toString() : '';

        text.onChange((val) => {
          if (val && numberRegEx.test(val)) {
            text.inputEl.removeClass('error');

            this.applySettingsUpdate({
              'lane-width': {
                $set: parseInt(val),
              },
            });

            return;
          }

          if (val) {
            text.inputEl.addClass('error');
          }

          this.applySettingsUpdate({
            $unset: ['lane-width'],
          });
        });
      });

    new Setting(contentEl).setName(t('Expand lists to full width in list view')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('full-list-lane-width', local);

          if (value !== undefined) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined) {
            toggle.setValue(globalValue as boolean);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'full-list-lane-width': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('full-list-lane-width', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['full-list-lane-width'],
              });
            });
        });
    });

    new Setting(contentEl)
      .setName(t('Maximum number of archived cards'))
      .setDesc(
        t(
          "Archived cards can be viewed in markdown mode. This setting will begin removing old cards once the limit is reached. Setting this value to -1 will allow a board's archive to grow infinitely."
        )
      )
      .addText((text) => {
        const [value, globalValue] = this.getSetting('max-archive-size', local);

        text.inputEl.setAttr('type', 'number');
        text.inputEl.placeholder = `${globalValue ? globalValue : '-1'} (default)`;
        text.inputEl.value = value ? value.toString() : '';

        text.onChange((val) => {
          if (val && numberRegEx.test(val)) {
            text.inputEl.removeClass('error');

            this.applySettingsUpdate({
              'max-archive-size': {
                $set: parseInt(val),
              },
            });

            return;
          }

          if (val) {
            text.inputEl.addClass('error');
          }

          this.applySettingsUpdate({
            $unset: ['max-archive-size'],
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Note template'))
      .setDesc(t('This template will be used when creating new notes from Kanban cards.'))
      .then(
        createSearchSelect({
          choices: templateFiles,
          key: 'new-note-template',
          warningText: templateWarning,
          local,
          placeHolderStr: t('No template'),
          manager: this,
        })
      );

    new Setting(contentEl)
      .setName(t('Note folder'))
      .setDesc(
        t(
          'Notes created from Kanban cards will be placed in this folder. If blank, they will be placed in the default location for this vault.'
        )
      )
      .then(
        createSearchSelect({
          choices: vaultFolders,
          key: 'new-note-folder',
          local,
          placeHolderStr: t('Default folder'),
          manager: this,
        })
      );

    contentEl.createEl('h4', { text: t('Tags') });

    new Setting(contentEl)
      .setName(t('Move tags to card footer'))
      .setDesc(
        t("When toggled, tags will be displayed in the card's footer instead of the card's body.")
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-tags', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-tags': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-tags', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['move-tags'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Tag click action'))
      .setDesc(
        t(
          'This setting controls whether clicking the tags displayed below the card title opens the Obsidian search or the Kanban board search.'
        )
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('kanban', t('Search Kanban Board'));
        dropdown.addOption('obsidian', t('Search Obsidian Vault'));

        const [value, globalValue] = this.getSetting('tag-action', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'obsidian');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'tag-action': {
              $set: value as 'kanban' | 'obsidian',
            },
          });
        });
      });

    new Setting(contentEl).then((setting) => {
      const [value, globalValue] = this.getSetting('tag-sort', local);

      const keys: TagSortSetting[] = ((value || globalValue || []) as TagSort[]).map((k) => {
        return {
          ...TagSortSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderTagSortSettings(setting.settingEl, contentEl, keys, (keys: TagSortSetting[]) =>
        this.applySettingsUpdate({
          'tag-sort': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpTagSortSettings(setting.settingEl);
        }
      });
    });

    new Setting(contentEl).then((setting) => {
      const [value] = this.getSetting('tag-colors', local);

      const keys: TagColorSetting[] = ((value || []) as TagColor[]).map((k) => {
        return {
          ...TagColorSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderTagSettings(setting.settingEl, keys, (keys: TagColorSetting[]) =>
        this.applySettingsUpdate({
          'tag-colors': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpTagSettings(setting.settingEl);
        }
      });
    });

    // Priority and Assignee settings
    contentEl.createEl('h4', { text: t('Priority & Assignee') });

    new Setting(contentEl)
      .setName(t('Move priorities and assignees to card footer'))
      .setDesc(
        t("When toggled, priorities and assignees will be displayed in the card's footer instead of the card's body.")
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-priorities-assignees', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-priorities-assignees': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-priorities-assignees', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['move-priorities-assignees'],
                });
              });
          });
      });

    new Setting(contentEl).then((setting) => {
      const [value, globalValue] = this.getSetting('priority-options', local);

      const keys: PriorityOptionSetting[] = ((value || globalValue || []) as PriorityOption[]).map((k) => {
        return {
          ...PriorityOptionSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderLabelColorSettings(
        setting.settingEl,
        keys,
        (keys: PriorityOptionSetting[]) =>
          this.applySettingsUpdate({
            'priority-options': {
              $set: keys.map((k) => k.data),
            },
          }),
        t('Priority options'),
        t('Set colors for priority options displayed in cards.'),
        t('Add priority'),
        '高',
        '!'
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpLabelColorSettings(setting.settingEl);
        }
      });
    });

    new Setting(contentEl).then((setting) => {
      const [value, globalValue] = this.getSetting('assignee-options', local);

      const keys: AssigneeOptionSetting[] = ((value || globalValue || []) as AssigneeOption[]).map((k) => {
        return {
          ...AssigneeOptionSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderLabelColorSettings(
        setting.settingEl,
        keys,
        (keys: AssigneeOptionSetting[]) =>
          this.applySettingsUpdate({
            'assignee-options': {
              $set: keys.map((k) => k.data),
            },
          }),
        t('Assignee options'),
        t('Set colors for assignee options displayed in cards.'),
        t('Add assignee'),
        '张三',
        '@'
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpLabelColorSettings(setting.settingEl);
        }
      });
    });

    contentEl.createEl('h4', { text: t('Date & Time') });

    new Setting(contentEl)
      .setName(t('Move dates to card footer'))
      .setDesc(
        t("When toggled, dates will be displayed in the card's footer instead of the card's body.")
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-dates', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-dates': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-dates', local);
                toggleComponent.setValue((globalValue as boolean) ?? true);

                this.applySettingsUpdate({
                  $unset: ['move-dates'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Date trigger'))
      .setDesc(t('When this is typed, it will trigger the date selector'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('date-trigger', local);

        if (value || globalValue) {
          text.setValue((value || globalValue) as string);
        }

        text.setPlaceholder((globalValue as string) || defaultDateTrigger);

        text.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-trigger': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-trigger'],
            });
          }
        });
      });

    new Setting(contentEl)
      .setName(t('Time trigger'))
      .setDesc(t('When this is typed, it will trigger the time selector'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('time-trigger', local);

        if (value || globalValue) {
          text.setValue((value || globalValue) as string);
        }

        text.setPlaceholder((globalValue as string) || defaultTimeTrigger);

        text.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'time-trigger': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['time-trigger'],
            });
          }
        });
      });

    new Setting(contentEl).setName(t('Date format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('This format will be used when saving dates in markdown.'));
            frag.createEl('br');
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('date-format', local);
        const defaultFormat = getDefaultDateFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl).setName(t('Time format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('time-format', local);
        const defaultFormat = getDefaultTimeFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'time-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['time-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl).setName(t('Date display format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('This format will be used when displaying dates in Kanban cards.'));
            frag.createEl('br');
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('date-display-format', local);
        const defaultFormat = getDefaultDateFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-display-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-display-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl)
      .setName(t('Show relative date'))
      .setDesc(
        t(
          "When toggled, cards will display the distance between today and the card's date. eg. 'In 3 days', 'A month ago'. Relative dates will not be shown for dates from the Tasks and Dataview plugins."
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('show-relative-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'show-relative-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('show-relative-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['show-relative-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Link dates to daily notes'))
      .setDesc(t('When toggled, dates will link to daily notes. Eg. [[2021-04-26]]'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('link-date-to-daily-note', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'link-date-to-daily-note': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('link-date-to-daily-note', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['link-date-to-daily-note'],
                });
              });
          });
      });

    new Setting(contentEl).then((setting) => {
      const [value] = this.getSetting('date-colors', local);

      const keys: DateColorSetting[] = ((value || []) as DateColor[]).map((k) => {
        return {
          ...DateColorSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderDateSettings(
        setting.settingEl,
        keys,
        (keys: DateColorSetting[]) =>
          this.applySettingsUpdate({
            'date-colors': {
              $set: keys.map((k) => k.data),
            },
          }),
        () => {
          const [value, globalValue] = this.getSetting('date-display-format', local);
          const defaultFormat = getDefaultDateFormat(this.app);
          return value || globalValue || defaultFormat;
        },
        () => {
          const [value, globalValue] = this.getSetting('time-format', local);
          const defaultFormat = getDefaultTimeFormat(this.app);
          return value || globalValue || defaultFormat;
        }
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpDateSettings(setting.settingEl);
        }
      });
    });

    new Setting(contentEl)
      .setName(t('Add date and time to archived cards'))
      .setDesc(
        t(
          'When toggled, the current date and time will be added to the card title when it is archived. Eg. - [ ] 2021-05-14 10:00am My card title'
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('archive-with-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'archive-with-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('archive-with-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['archive-with-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Add archive date/time after card title'))
      .setDesc(
        t(
          'When toggled, the archived date/time will be added after the card title, e.g.- [ ] My card title 2021-05-14 10:00am. By default, it is inserted before the title.'
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('append-archive-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'append-archive-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('append-archive-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['append-archive-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Archive date/time separator'))
      .setDesc(t('This will be used to separate the archived date/time from the title'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('archive-date-separator', local);

        text.inputEl.placeholder = globalValue ? `${globalValue} (default)` : '';
        text.inputEl.value = value ? (value as string) : '';

        text.onChange((val) => {
          if (val) {
            this.applySettingsUpdate({
              'archive-date-separator': {
                $set: val,
              },
            });

            return;
          }

          this.applySettingsUpdate({
            $unset: ['archive-date-separator'],
          });
        });
      });

    new Setting(contentEl).setName(t('Archive date/time format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('archive-date-format', local);

        const [dateFmt, globalDateFmt] = this.getSetting('date-format', local);
        const defaultDateFmt = dateFmt || globalDateFmt || getDefaultDateFormat(this.app);
        const [timeFmt, globalTimeFmt] = this.getSetting('time-format', local);
        const defaultTimeFmt = timeFmt || globalTimeFmt || getDefaultTimeFormat(this.app);

        const defaultFormat = `${defaultDateFmt} ${defaultTimeFmt}`;

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'archive-date-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['archive-date-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl)
      .setName(t('Calendar: first day of week'))
      .setDesc(t('Override which day is used as the start of the week'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('default'));
        dropdown.addOption('0', t('Sunday'));
        dropdown.addOption('1', t('Monday'));
        dropdown.addOption('2', t('Tuesday'));
        dropdown.addOption('3', t('Wednesday'));
        dropdown.addOption('4', t('Thursday'));
        dropdown.addOption('5', t('Friday'));
        dropdown.addOption('6', t('Saturday'));

        const [value, globalValue] = this.getSetting('date-picker-week-start', local);

        dropdown.setValue(value?.toString() || globalValue?.toString() || '');
        dropdown.onChange((value) => {
          if (value) {
            this.applySettingsUpdate({
              'date-picker-week-start': {
                $set: Number(value),
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-picker-week-start'],
            });
          }
        });
      });

    contentEl.createEl('br');
    contentEl.createEl('h4', { text: t('Inline Metadata') });

    new Setting(contentEl)
      .setName(t('Inline metadata position'))
      .setDesc(
        t('Controls where the inline metadata (from the Dataview plugin) will be displayed.')
      )
      .then((s) => {
        let input: DropdownComponent;

        s.addDropdown((dropdown) => {
          input = dropdown;

          dropdown.addOption('body', t('Card body'));
          dropdown.addOption('footer', t('Card footer'));
          dropdown.addOption('metadata-table', t('Merge with linked page metadata'));

          const [value, globalValue] = this.getSetting('inline-metadata-position', local);

          dropdown.setValue(
            value?.toString() || globalValue?.toString() || defaultMetadataPosition
          );
          dropdown.onChange((value: 'body' | 'footer' | 'metadata-table') => {
            if (value) {
              this.applySettingsUpdate({
                'inline-metadata-position': {
                  $set: value,
                },
              });
            } else {
              this.applySettingsUpdate({
                $unset: ['inline-metadata-position'],
              });
            }
          });
        }).addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('inline-metadata-position', local);
              input.setValue((globalValue as string) || defaultMetadataPosition);

              this.applySettingsUpdate({
                $unset: ['inline-metadata-position'],
              });
            });
        });
      });

    new Setting(contentEl)
      .setName(t('Move task data to card footer'))
      .setDesc(
        t(
          "When toggled, task data (from the Tasks plugin) will be displayed in the card's footer instead of the card's body."
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-task-metadata', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-task-metadata': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-task-metadata', local);
                toggleComponent.setValue((globalValue as boolean) ?? true);

                this.applySettingsUpdate({
                  $unset: ['move-task-metadata'],
                });
              });
          });
      });

    contentEl.createEl('br');
    contentEl.createEl('h4', { text: t('Linked Page Metadata') });
    contentEl.createEl('p', {
      cls: c('metadata-setting-desc'),
      text: t(
        'Display metadata for the first note linked within a card. Specify which metadata keys to display below. An optional label can be provided, and labels can be hidden altogether.'
      ),
    });

    new Setting(contentEl).then((setting) => {
      setting.settingEl.addClass(c('draggable-setting-container'));

      const [value] = this.getSetting('metadata-keys', local);

      const keys: MetadataSetting[] = ((value as DataKey[]) || ([] as DataKey[])).map((k) => {
        return {
          ...MetadataSettingTemplate,
          id: generateInstanceId(),
          data: k,
          win: getParentWindow(contentEl),
        };
      });

      renderMetadataSettings(setting.settingEl, contentEl, keys, (keys: MetadataSetting[]) =>
        this.applySettingsUpdate({
          'metadata-keys': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanupMetadataSettings(setting.settingEl);
        }
      });
    });

    contentEl.createEl('h4', { text: t('Board Header Buttons') });

    new Setting(contentEl).setName(t('Add a list')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-add-list', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-add-list': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-add-list', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-add-list'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Archive completed cards')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-archive-all', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-archive-all': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-archive-all', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-archive-all'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Open as markdown')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-view-as-markdown', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-view-as-markdown': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-view-as-markdown', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-view-as-markdown'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Open board settings')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-board-settings', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-board-settings': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-board-settings', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-board-settings'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Clone template')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-clone-template', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-clone-template': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-clone-template', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-clone-template'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Search...')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-search', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-search': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-search', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-search'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Board view')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-set-view', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-set-view': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-set-view', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-set-view'],
              });
            });
        });
    });
  }

  cleanUp() {
    this.win = null;
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }
}

export class SettingsModal extends Modal {
  view: KanbanView;
  settingsManager: SettingsManager;

  constructor(view: KanbanView, config: SettingsManagerConfig, settings: KanbanSettings) {
    super(view.app);

    this.view = view;
    this.settingsManager = new SettingsManager(view.plugin, config, settings);
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    modalEl.addClass(c('board-settings-modal'));

    this.settingsManager.constructUI(contentEl, this.view.file.basename, true);
  }

  onClose() {
    const { contentEl } = this;

    this.settingsManager.cleanUp();
    contentEl.empty();
  }
}

export class KanbanSettingsTab extends PluginSettingTab {
  plugin: KanbanPlugin;
  settingsManager: SettingsManager;

  constructor(plugin: KanbanPlugin, config: SettingsManagerConfig) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.settingsManager = new SettingsManager(plugin, config, plugin.settings);
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.addClass(c('board-settings-modal'));

    this.settingsManager.constructUI(containerEl, t('Kanban Plugin'), false);

    // Calendar settings section
    this.renderCalendarSettings(containerEl);
  }

  private renderCalendarSettings(containerEl: HTMLElement) {
    containerEl.createEl('h2', { text: '看板日历设置' });

    const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;

    new Setting(containerEl)
      .setName('使用当前文件')
      .setDesc('启用后，仅从当前打开的文件加载任务，新增/修改操作也针对当前文件')
      .addToggle(toggle => toggle
        .setValue(calendarSettings.useCurrentFile)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].useCurrentFile = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        }));

    new Setting(containerEl)
      .setName('默认看板')
      .setDesc('默认看板文件路径（留空则扫描所有文件）')
      .addText(text => text
        .setPlaceholder('path/to/kanban-board.md')
        .setValue(calendarSettings.defaultKanbanBoard)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].defaultKanbanBoard = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('默认日历视图')
      .setDesc('选择打开日历时的默认视图')
      .addDropdown(dropdown => dropdown
        .addOption('week', '周')
        .addOption('month', '月')
        .addOption('year', '年')
        .setValue(calendarSettings.calendarView)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].calendarView = value as 'week' | 'month' | 'year';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('显示已完成任务')
      .setDesc('是否在日历中显示已完成的任务')
      .addToggle(toggle => toggle
        .setValue(calendarSettings.showCompletedTasks)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].showCompletedTasks = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        }));

    new Setting(containerEl)
      .setName('隐藏周末')
      .setDesc('在日历中隐藏周六和周日')
      .addToggle(toggle => toggle
        .setValue(calendarSettings.hideWeekends)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].hideWeekends = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCalendarViews();
        }));

    new Setting(containerEl)
      .setName('打开位置')
      .setDesc('选择看板日历的打开位置')
      .addDropdown(dropdown => dropdown
        .addOption('sidebar', '侧边栏（右侧）')
        .addOption('tab', '新标签页')
        .setValue(calendarSettings.openLocation)
        .onChange(async (value) => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].openLocation = value as 'sidebar' | 'tab';
          await this.plugin.saveSettings();
        }));

    // List Filter Section
    containerEl.createEl('h3', { text: '列表过滤' });
    containerEl.createEl('p', {
      text: '选择要在日历中显示的看板列表。',
      cls: 'setting-item-description'
    });

    // Load available lists button
    new Setting(containerEl)
      .setName('加载可用列表')
      .setDesc('从看板文件加载所有可用列表')
      .addButton(button => button
        .setButtonText('加载列表')
        .onClick(async () => {
          await this.loadAndDisplayAvailableLists(containerEl);
        }));

    // Display current filter settings
    this.displayListFilterSettings(containerEl, calendarSettings);

    // Task Colors Section
    containerEl.createEl('h3', { text: '任务颜色' });
    containerEl.createEl('p', {
      text: '根据标签和状态配置任务颜色。',
      cls: 'setting-item-description'
    });

    // Add color configuration for each existing config
    calendarSettings.taskColors.forEach((colorConfig, index) => {
      this.createColorConfigSetting(containerEl, colorConfig, index);
    });

    // Add new color config button
    new Setting(containerEl)
      .setName('添加新颜色配置')
      .setDesc('添加新的任务颜色规则')
      .addButton(button => button
        .setButtonText('添加')
        .onClick(async () => {
          if (!this.plugin.settings['kanban-calendar']) {
            this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
          }
          this.plugin.settings['kanban-calendar'].taskColors.push({
            status: 'in-progress',
            color: '#2196f3'
          });
          await this.plugin.saveSettings();
          this.display(); // Refresh the settings display
        }));
  }

  private async loadAndDisplayAvailableLists(containerEl: HTMLElement): Promise<void> {
    try {
      const parser = new KanbanParser(this.plugin.app.vault);
      const calendarSettings = this.plugin.settings['kanban-calendar'] || DEFAULT_KANBAN_CALENDAR_SETTINGS;

      const availableLists = await parser.getAllAvailableLists(
        calendarSettings.defaultKanbanBoard || undefined
      );

      // Find or create the lists container
      let listsContainer = containerEl.querySelector('.calendar-available-lists-container') as HTMLElement;
      if (!listsContainer) {
        listsContainer = containerEl.createDiv('calendar-available-lists-container');
      } else {
        listsContainer.empty();
      }

      if (availableLists.length === 0) {
        listsContainer.createEl('p', { text: '未找到列表。请确保你的看板文件包含 ## 标题。' });
        return;
      }

      listsContainer.createEl('h4', { text: '可用列表：' });

      availableLists.forEach(listName => {
        const listSetting = new Setting(listsContainer)
          .setName(listName)
          .setDesc('选择是否在日历中显示此列表');

        // Include checkbox
        listSetting.addToggle(toggle => {
          const isIncluded = calendarSettings.includedLists.includes(listName);
          const isExcluded = calendarSettings.excludedLists.includes(listName);

          // If neither included nor excluded, default to included
          const shouldBeChecked = isIncluded || (!isIncluded && !isExcluded);

          toggle
            .setValue(shouldBeChecked)
            .onChange(async (value) => {
              if (!this.plugin.settings['kanban-calendar']) {
                this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
              }
              if (value) {
                // Include this list
                if (!this.plugin.settings['kanban-calendar'].includedLists.includes(listName)) {
                  this.plugin.settings['kanban-calendar'].includedLists.push(listName);
                }
                // Remove from excluded if it was there
                const excludedIndex = this.plugin.settings['kanban-calendar'].excludedLists.indexOf(listName);
                if (excludedIndex > -1) {
                  this.plugin.settings['kanban-calendar'].excludedLists.splice(excludedIndex, 1);
                }
              } else {
                // Exclude this list
                if (!this.plugin.settings['kanban-calendar'].excludedLists.includes(listName)) {
                  this.plugin.settings['kanban-calendar'].excludedLists.push(listName);
                }
                // Remove from included if it was there
                const includedIndex = this.plugin.settings['kanban-calendar'].includedLists.indexOf(listName);
                if (includedIndex > -1) {
                  this.plugin.settings['kanban-calendar'].includedLists.splice(includedIndex, 1);
                }
              }
              await this.plugin.saveSettings();
              this.plugin.refreshCalendarViews();
            });
        });
      });

    } catch (error) {
      console.error('Error loading available lists:', error);
      const errorContainer = containerEl.createDiv();
      errorContainer.createEl('p', { text: '加载列表失败。请查看控制台了解详情。' });
    }
  }

  private displayListFilterSettings(containerEl: HTMLElement, calendarSettings: KanbanCalendarSettings): void {
    const { includedLists, excludedLists } = calendarSettings;

    if (includedLists.length > 0 || excludedLists.length > 0) {
      const filterContainer = containerEl.createDiv('calendar-list-filter-summary');
      filterContainer.createEl('h4', { text: '当前过滤设置：' });

      if (includedLists.length > 0) {
        const includedEl = filterContainer.createEl('p');
        includedEl.createEl('strong', { text: '包含列表：' });
        includedEl.createSpan({ text: includedLists.join(', ') });
      }

      if (excludedLists.length > 0) {
        const excludedEl = filterContainer.createEl('p');
        excludedEl.createEl('strong', { text: '排除列表：' });
        excludedEl.createSpan({ text: excludedLists.join(', ') });
      }

      // Clear filters button
      new Setting(filterContainer)
        .setName('重置过滤')
        .setDesc('清除所有列表过滤')
        .addButton(button => button
          .setButtonText('重置')
          .onClick(async () => {
            if (!this.plugin.settings['kanban-calendar']) {
              this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
            }
            this.plugin.settings['kanban-calendar'].includedLists = [];
            this.plugin.settings['kanban-calendar'].excludedLists = [];
            await this.plugin.saveSettings();
            this.plugin.refreshCalendarViews();
            this.display(); // Refresh the settings display
          }));
    }
  }

  private createColorConfigSetting(containerEl: HTMLElement, colorConfig: any, index: number): void {
    const setting = new Setting(containerEl)
      .setName(`颜色配置 ${index + 1}`)
      .setDesc('标签（可选）、状态和颜色');

    // Tag input (optional)
    setting.addText(text => text
      .setPlaceholder('标签（可选，如 #工作）')
      .setValue(colorConfig.tag || '')
      .onChange(async (value) => {
        if (!this.plugin.settings['kanban-calendar']) {
          this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
        }
        if (value.trim()) {
          this.plugin.settings['kanban-calendar'].taskColors[index].tag = value.trim();
        } else {
          delete this.plugin.settings['kanban-calendar'].taskColors[index].tag;
        }
        await this.plugin.saveSettings();
        this.plugin.refreshCalendarViews();
      }));

    // Status dropdown
    setting.addDropdown(dropdown => dropdown
      .addOption('in-progress', '进行中')
      .addOption('completed', '已完成')
      .setValue(colorConfig.status)
      .onChange(async (value) => {
        if (!this.plugin.settings['kanban-calendar']) {
          this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
        }
        this.plugin.settings['kanban-calendar'].taskColors[index].status = value as 'completed' | 'in-progress';
        await this.plugin.saveSettings();
        this.plugin.refreshCalendarViews();
      }));

    // Color input
    setting.addColorPicker(colorPicker => colorPicker
      .setValue(colorConfig.color)
      .onChange(async (value) => {
        if (!this.plugin.settings['kanban-calendar']) {
          this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
        }
        this.plugin.settings['kanban-calendar'].taskColors[index].color = value;
        await this.plugin.saveSettings();
        this.plugin.refreshCalendarViews();
      }));

    // Delete button
    setting.addButton(button => button
      .setButtonText('删除')
      .setWarning()
      .onClick(async () => {
        if (!this.plugin.settings['kanban-calendar']) {
          this.plugin.settings['kanban-calendar'] = { ...DEFAULT_KANBAN_CALENDAR_SETTINGS };
        }
        this.plugin.settings['kanban-calendar'].taskColors.splice(index, 1);
        await this.plugin.saveSettings();
        this.plugin.refreshCalendarViews();
        this.display(); // Refresh the settings display
      }));
  }
}
