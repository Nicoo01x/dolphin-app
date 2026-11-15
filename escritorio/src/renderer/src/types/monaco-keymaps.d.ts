/**
 * Los tipos de `monaco-vim` y `monaco-emacs`, que no los traen.
 *
 * Se declara sólo lo que usamos —montar el modo y soltarlo— y nada más: una declaración que
 * intenta describir todo el paquete envejece con él y empieza a mentir. Si algún día hace falta
 * otra cosa de estos módulos, se agrega acá con la firma que de verdad tenga.
 *
 * La forma sale de cómo se usan en `components/editor/keymap-del-editor.ts`.
 */

declare module 'monaco-vim' {
  import type { editor } from 'monaco-editor'

  export type VimMode = {
    dispose: () => void
  }

  /**
   * Prende el modo Vim sobre un editor. El segundo argumento es dónde escribe su línea de
   * estado (`-- INSERT --`); sin él, el modo anda igual pero no muestra nada.
   */
  export function initVimMode(
    editor: editor.IStandaloneCodeEditor,
    statusBar?: HTMLElement
  ): VimMode
}

declare module 'monaco-emacs' {
  import type { editor } from 'monaco-editor'

  export class EmacsExtension {
    constructor(editor: editor.IStandaloneCodeEditor)
    start(): void
    dispose(): void
  }
}
