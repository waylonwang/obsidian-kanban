import { insertBlankLine } from '@codemirror/commands';
import { EditorSelection, Extension, Prec } from '@codemirror/state';
import { EditorView, ViewUpdate, keymap, placeholder as placeholderExt } from '@codemirror/view';
import classcat from 'classcat';
import { EditorPosition, Editor as ObsidianEditor, Platform, TFile, getLinkpath } from 'obsidian';
import { MutableRefObject, useContext, useEffect, useRef } from 'preact/compat';
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import { KanbanContext } from '../context';
import { c, noop } from '../helpers';
import { EditState, isEditing } from '../types';
import { datePlugins, stateManagerField } from './dateWidget';
import { matchDateTrigger, matchTimeTrigger } from './suggest';

interface MarkdownEditorProps {
  editorRef?: MutableRefObject<EditorView>;
  editState?: EditState;
  onEnter: (cm: EditorView, mod: boolean, shift: boolean) => boolean;
  onEscape: (cm: EditorView) => void;
  onSubmit: (cm: EditorView) => void;
  onPaste?: (e: ClipboardEvent, cm: EditorView) => void;
  onChange?: (update: ViewUpdate) => void;
  value?: string;
  className: string;
  placeholder?: string;
}

export function allowNewLine(stateManager: StateManager, mod: boolean, shift: boolean) {
  if (Platform.isMobile) return !(mod || shift);
  return stateManager.getSetting('new-line-trigger') === 'enter' ? !(mod || shift) : mod || shift;
}

function isCursorInsideWikilink(cm: EditorView): boolean {
  const pos = cm.state.selection.main.head;
  const line = cm.state.doc.lineAt(pos);
  const lineText = line.text;

  // Count unclosed [[ before cursor position
  const beforeCursor = lineText.slice(0, pos - line.from);
  let depth = 0;
  for (let i = 0; i < beforeCursor.length - 1; i++) {
    if (beforeCursor[i] === '[' && beforeCursor[i + 1] === '[') {
      depth++;
      i++; // skip second [
    }
  }
  // Count ]] before cursor
  for (let i = 0; i < beforeCursor.length - 1; i++) {
    if (beforeCursor[i] === ']' && beforeCursor[i + 1] === ']') {
      depth--;
      i++; // skip second ]
    }
  }
  return depth > 0;
}

// Extract link path from [[path#heading|^blockid format
function extractLinkPath(linkText: string): { path: string; heading?: string; blockId?: string } {
  const text = linkText.trim();

  // Check for block reference #^blockid
  const blockMatch = text.match(/([^#]+)#\^([a-zA-Z0-9-]+)$/);
  if (blockMatch) {
    return { path: blockMatch[1], blockId: blockMatch[2] };
  }

  // Check for heading #heading
  const headingMatch = text.match(/([^#]+)#([^#|]+)$/);
  if (headingMatch) {
    return { path: headingMatch[1], heading: headingMatch[2] };
  }

  // Simple file link
  return { path: text };
}

// Get first N characters of visible text, stripping Kanban markers and markdown
function getFirstNChars(content: string, n: number): string {
  let cleaned = content;

  // Remove Kanban markers: #tag, !priority, @assignee, %{date}, @{date}
  cleaned = cleaned
    .replace(/#[\w一-龥]+/g, '')  // #tags (Chinese supported)
    .replace(/![\w一-龥]+/g, '')  // !priorities
    .replace(/@[\w一-龥]+/g, '')  // @assignees (excluding email @)
    .replace(/%\{[^}]+\}/g, '')  // %{date}
    .replace(/@\{[^}]+\}/g, '');  // @{date}

  // Remove wikilinks, keep alias if present: [[path|alias]] → alias, [[path]] → empty
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    const parts = inner.split('|');
    return parts.length > 1 ? parts[1].trim() : '';
  });

  // Remove common markdown syntax
  cleaned = cleaned
    .replace(/^#+\s*/gm, '')  // headings
    .replace(/^[-*+]\s+\[(?:[ xX])\]\s*/gm, '')  // task list: - [ ] or - [x]
    .replace(/^[-*+]\s+/gm, '')  // plain list markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
    .replace(/\*([^*]+)\*/g, '$1')  // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // markdown links
    .replace(/`[^`]+`/g, '')  // inline code
    .replace(/\^[\w-]+/g, '')  // block references ^blockid
    .replace(/\n+/g, ' ')  // newlines to space
    .replace(/\s+/g, ' ')  // multiple spaces
    .trim();

  return cleaned.slice(0, n);
}

// Get block content by blockId
function getBlockContent(cache: any, fileContent: string, blockId: string): string | null {
  if (!cache?.blocks?.[blockId]) return null;

  const block = cache.blocks[blockId];
  const lines = fileContent.split('\n');
  const startLine = block.position?.start?.line ?? 0;
  const endLine = block.position?.end?.line ?? startLine;

  const content = lines.slice(startLine, endLine + 1).join('\n');
  return content.replace(/\s*\^([a-zA-Z0-9-]+)\s*$/, '').trim();  // remove block id reference
}

// Get heading content
function getHeadingContent(cache: any, fileContent: string, heading: string): string | null {
  if (!cache?.headings) return null;

  const targetHeading = cache.headings.find((h: any) => h.heading === heading);
  if (!targetHeading) return null;

  const lines = fileContent.split('\n');
  const startLine = targetHeading.position?.start?.line ?? 0;

  // Find next heading or end of file
  let endLine = lines.length - 1;
  for (let i = startLine + 1; i < cache.headings.length; i++) {
    if (cache.headings[i].level <= targetHeading.level) {
      const headingLine = cache.headings[i].position?.start?.line;
      endLine = headingLine != null ? headingLine - 1 : endLine;
      break;
    }
  }

  const content = lines.slice(startLine + 1, endLine + 1).join('\n');
  return content.trim();
}

function getEditorAppProxy(view: KanbanView) {
  return new Proxy(view.app, {
    get(target, prop, reveiver) {
      if (prop === 'vault') {
        return new Proxy(view.app.vault, {
          get(target, prop, reveiver) {
            if (prop === 'config') {
              return new Proxy((view.app.vault as any).config, {
                get(target, prop, reveiver) {
                  if (['showLineNumber', 'foldHeading', 'foldIndent'].includes(prop as string)) {
                    return false;
                  }
                  return Reflect.get(target, prop, reveiver);
                },
              });
            }
            return Reflect.get(target, prop, reveiver);
          },
        });
      }
      return Reflect.get(target, prop, reveiver);
    },
  });
}

function getMarkdownController(
  view: KanbanView,
  getEditor: () => ObsidianEditor
): Record<any, any> {
  return {
    app: view.app,
    showSearch: noop,
    toggleMode: noop,
    onMarkdownScroll: noop,
    getMode: () => 'source',
    scroll: 0,
    editMode: null,
    get editor() {
      return getEditor();
    },
    get file() {
      return view.file;
    },
    get path() {
      return view.file.path;
    },
  };
}

function setInsertMode(cm: EditorView) {
  const vim = getVimPlugin(cm);
  if (vim) {
    (window as any).CodeMirrorAdapter?.Vim?.enterInsertMode(vim);
  }
}

function getVimPlugin(cm: EditorView): string {
  return (cm as any)?.plugins?.find((p: any) => {
    if (!p?.value) return false;
    return 'useNextTextInput' in p.value && 'waitForCopy' in p.value;
  })?.value?.cm;
}

export function MarkdownEditor({
  editorRef,
  onEnter,
  onEscape,
  onChange,
  onPaste,
  className,
  onSubmit,
  editState,
  value,
  placeholder,
}: MarkdownEditorProps) {
  const { view, stateManager } = useContext(KanbanContext);
  const elRef = useRef<HTMLDivElement>();
  const internalRef = useRef<EditorView>();

  useEffect(() => {
    class Editor extends view.plugin.MarkdownEditor {
      isKanbanEditor = true;

      showTasksPluginAutoSuggest(
        cursor: EditorPosition,
        editor: ObsidianEditor,
        lineHasGlobalFilter: boolean
      ) {
        if (matchTimeTrigger(stateManager.getSetting('time-trigger'), editor, cursor)) return false;
        if (matchDateTrigger(stateManager.getSetting('date-trigger'), editor, cursor)) return false;
        if (lineHasGlobalFilter && cursor.line === 0) return true;
        return undefined;
      }

      updateBottomPadding() {}
      onUpdate(update: ViewUpdate, changed: boolean) {
        super.onUpdate(update, changed);
        onChange && onChange(update);
      }
      buildLocalExtensions(): Extension[] {
        const extensions = super.buildLocalExtensions();

        // Fix: after Obsidian link suggest inserts [[...]], move cursor back before ]]
        // Also: auto-insert alias when | is typed inside [[...]]
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || !update.selectionSet) return;

            for (const tr of update.transactions) {
              // Handle link autocomplete: move cursor back before ]]
              if (tr.isUserEvent('input.autocomplete')) {
                const sel = update.state.selection.main;
                const pos = sel.head;
                const textBefore = update.state.doc.sliceString(pos - 2, pos);

                if (textBefore === ']]') {
                  update.view.dispatch({
                    selection: EditorSelection.cursor(pos - 2),
                    userEvent: 'select.pointer',
                  });
                  return;
                }
              }

              // Handle | typed inside [[...]]: auto-insert alias from target content
              if (tr.isUserEvent('input.type')) {
                tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                  const insertedText = inserted.sliceString(0);
                  if (insertedText !== '|') return;

                  const pos = fromB + 1; // position after |
                  const doc = update.state.doc;
                  const line = doc.lineAt(pos);
                  const lineText = line.text;
                  const linePos = pos - line.from;

                  // Find [[ before cursor
                  const beforePipe = lineText.slice(0, linePos - 1);  // exclude |
                  const openIdx = beforePipe.lastIndexOf('[[');
                  if (openIdx === -1) return;

                  // Check ]] after cursor doesn't exist yet or is after |
                  const afterPipe = lineText.slice(linePos);
                  if (!afterPipe.startsWith(']]')) return;

                  // Extract link path between [[ and |
                  const linkPath = beforePipe.slice(openIdx + 2);
                  if (!linkPath) return;

                  const parsed = extractLinkPath(linkPath);
                  const normalizedPath = getLinkpath(parsed.path);

                  const targetFile = this.app.metadataCache.getFirstLinkpathDest(
                    normalizedPath,
                    view.file.path
                  );

                  if (!targetFile) return;

                  // Async: read file content and insert alias
                  (async () => {
                    try {
                      const content = await this.app.vault.read(targetFile);
                      const cache = this.app.metadataCache.getFileCache(targetFile);

                      let snippet = '';

                      if (parsed.blockId) {
                        const blockContent = getBlockContent(cache, content, parsed.blockId);
                        if (blockContent) snippet = getFirstNChars(blockContent, 20);
                      } else if (parsed.heading) {
                        const headingContent = getHeadingContent(cache, content, parsed.heading);
                        if (headingContent) snippet = getFirstNChars(headingContent, 20);
                      } else {
                        // Use file content, skip frontmatter
                        let body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
                        snippet = getFirstNChars(body, 20);
                      }

                      if (!snippet) return;

                      // Insert alias text after |
                      const cm = update.view;
                      // Re-find position in case doc changed
                      const currentPos = cm.state.selection.main.head;
                      const insertPos = currentPos;
                      cm.dispatch({
                        changes: { from: insertPos, insert: snippet },
                        selection: EditorSelection.cursor(insertPos + snippet.length),
                      });
                    } catch (e) {
                      // Silently fail if file can't be read
                    }
                  })();
                });
              }
            }
          })
        );

        extensions.push(stateManagerField.init(() => stateManager));
        extensions.push(datePlugins);
        extensions.push(
          Prec.highest(
            EditorView.domEventHandlers({
              focus: (evt) => {
                view.activeEditor = this.owner;
                if (Platform.isMobile) {
                  view.contentEl.addClass('is-mobile-editing');
                }

                evt.win.setTimeout(() => {
                  this.app.workspace.activeEditor = this.owner;
                  if (Platform.isMobile) {
                    this.app.mobileToolbar.update();
                  }
                });
                return true;
              },
              blur: () => {
                if (Platform.isMobile) {
                  view.contentEl.removeClass('is-mobile-editing');
                  this.app.mobileToolbar.update();
                }
                return true;
              },
            })
          )
        );

        if (placeholder) extensions.push(placeholderExt(placeholder));
        if (onPaste) {
          extensions.push(
            Prec.high(
              EditorView.domEventHandlers({
                paste: onPaste,
              })
            )
          );
        }

        const makeEnterHandler = (mod: boolean, shift: boolean) => (cm: EditorView) => {
          // If cursor is inside wikilink and no mod/shift, insert newline instead of submitting
          if (!mod && !shift && isCursorInsideWikilink(cm)) {
            cm.dispatch({
              changes: { from: cm.state.selection.main.head, insert: '\n' },
              selection: EditorSelection.cursor(cm.state.selection.main.head + 1),
            });
            return true;
          }

          const didRun = onEnter(cm, mod, shift);
          if (didRun) return true;
          if (this.app.vault.getConfig('smartIndentList')) {
            this.editor.newlineAndIndentContinueMarkdownList();
          } else {
            insertBlankLine(cm as any);
          }
          return true;
        };

        extensions.push(
          Prec.highest(
            keymap.of([
              {
                key: 'Enter',
                run: makeEnterHandler(false, false),
                shift: makeEnterHandler(false, true),
                preventDefault: true,
              },
              {
                key: 'Mod-Enter',
                run: makeEnterHandler(true, false),
                shift: makeEnterHandler(true, true),
                preventDefault: true,
              },
              {
                key: 'Escape',
                run: (cm) => {
                  onEscape(cm);
                  return false;
                },
                preventDefault: true,
              },
            ])
          )
        );

        return extensions;
      }
    }

    const controller = getMarkdownController(view, () => editor.editor);
    const app = getEditorAppProxy(view);
    const editor = view.plugin.addChild(new (Editor as any)(app, elRef.current, controller));
    const cm: EditorView = editor.cm;

    internalRef.current = cm;
    if (editorRef) editorRef.current = cm;

    controller.editMode = editor;
    editor.set(value || '');
    if (isEditing(editState)) {
      cm.dispatch({
        userEvent: 'select.pointer',
        selection: EditorSelection.single(cm.posAtCoords(editState, false)),
      });

      cm.dom.win.setTimeout(() => {
        setInsertMode(cm);
      });
    }

    const onShow = () => {
      elRef.current.scrollIntoView({ block: 'end' });
    };

    if (Platform.isMobile) {
      cm.dom.win.addEventListener('keyboardDidShow', onShow);
    }

    return () => {
      if (Platform.isMobile) {
        cm.dom.win.removeEventListener('keyboardDidShow', onShow);

        if (view.activeEditor === controller) {
          view.activeEditor = null;
        }

        if (app.workspace.activeEditor === controller) {
          app.workspace.activeEditor = null;
          (app as any).mobileToolbar.update();
          view.contentEl.removeClass('is-mobile-editing');
        }
      }
      view.plugin.removeChild(editor);
      internalRef.current = null;
      if (editorRef) editorRef.current = null;
    };
  }, []);

  const cls = ['cm-table-widget'];
  if (className) cls.push(className);

  return (
    <>
      <div className={classcat(cls)} ref={elRef}></div>
      {Platform.isMobile && (
        <button
          onClick={() => onSubmit(internalRef.current)}
          className={classcat([c('item-submit-button'), 'mod-cta'])}
        >
          {t('Submit')}
        </button>
      )}
    </>
  );
}
