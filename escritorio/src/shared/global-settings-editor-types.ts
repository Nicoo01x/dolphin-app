/**
 * The code editor's own settings.
 *
 * Split out of `global-settings-types.ts`, which had grown to exactly the 300-line ceiling: the
 * next setting anyone added was going to break the lint, and the honest fix for a type that big
 * is a seam, not a disable directive. These six belong together because they all describe the
 * file editor and nothing else.
 */
export type GlobalSettingsEditor = {
  editorAutoSave: boolean
  editorAutoSaveDelayMs: number
  editorMinimapEnabled: boolean
  /** Opt-in code-editor font; empty (the default) keeps following `terminalFontFamily`. */
  editorFontFamily?: string
  /** Defaults on for profiles saved before file-editor wrapping became configurable. */
  editorWordWrap?: boolean
  /**
   * Run the repo's formatter command on save (the base app's save pipeline,
   * `editor/save/transforms/editor-format-on-save.ts`). Off by default.
   */
  editorFormatOnSave?: boolean
  /**
   * Which keymap the editor obeys. Absent means the VS Code one, which is Monaco's own and what
   * every profile had before this setting existed.
   *
   * Why it is here and not a plugin: someone who types in Vim types in Vim everywhere, and an
   * editor that ignores that is an editor they will not use. It is the single most requested
   * editor feature upstream that neither side had.
   */
  editorKeymap?: 'vscode' | 'vim' | 'emacs'
}
