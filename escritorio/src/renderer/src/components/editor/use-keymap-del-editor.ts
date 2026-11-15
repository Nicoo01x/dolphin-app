import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '@/store'
import { keymapDe, montarKeymap, type Soltar } from './keymap-del-editor'

/**
 * Engancha el teclado elegido —el de VS Code, Vim o Emacs— a un editor montado.
 *
 * Sigue la forma de `useBordeDeGit`, su vecino: recibe el editor ya montado y se encarga de poner
 * y sacar lo suyo. Acá lo que se pone es un modo que captura teclas, así que sacarlo bien importa
 * más que en otros lados: dos modos montados a la vez se pelean por la misma tecla y el editor
 * queda inservible hasta recargar.
 *
 * Why una generación y no un booleano: entre que se pide el modo y el paquete termina de bajar
 * pueden pasar varios cambios —se cierra el archivo, se elige otro teclado—. La generación dice
 * si lo que terminó de cargar sigue siendo lo que alguien quiere; si no, se descarta sin tocar el
 * editor.
 */
export function useKeymapDelEditor(args: {
  readonly editor: editor.IStandaloneCodeEditor | null
  /** Dónde Vim escribe su línea de estado. Sin ella anda igual, pero no se ve el modo. */
  readonly barra: HTMLElement | null
}): void {
  const guardado = useAppStore((s) => s.settings?.editorKeymap)
  const keymap = keymapDe(guardado)
  const generacion = useRef(0)

  useEffect(() => {
    const montado = args.editor
    if (!montado || keymap === 'vscode') {
      return
    }
    generacion.current += 1
    const mia = generacion.current
    let soltar: Soltar | null = null
    let cancelado = false

    void montarKeymap({
      editor: montado,
      keymap,
      barra: args.barra,
      vigente: () => !cancelado && generacion.current === mia
    }).then((quitar) => {
      if (cancelado || generacion.current !== mia) {
        quitar()
        return
      }
      soltar = quitar
    })

    return () => {
      cancelado = true
      soltar?.()
    }
  }, [args.editor, args.barra, keymap])
}
