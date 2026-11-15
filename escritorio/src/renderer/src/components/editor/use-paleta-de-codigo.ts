import { useEffect } from 'react'
import * as monaco from 'monaco-editor'
import { useAppStore } from '@/store'
import { definirTemasDeDolphin, temaDeDolphin } from './tema-dolphin-monaco'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'

/**
 * Mantiene los temas de Monaco al día con la paleta que la persona eligió.
 *
 * `defineTheme` es global y pisa la definición anterior con el mismo nombre, así que redefinir el
 * tema repinta TODOS los editores abiertos de una. Por eso esto vive en un solo lugar alto y no en
 * cada editor: con un hook por pestaña, cambiar un color redefinía el tema una vez por pestaña y
 * el orden de aplicación dependía de cuál se montó última.
 *
 * El `setTheme` del final es el que fuerza el repintado: redefinir el tema activo no siempre lo
 * dispara solo, y sin eso el color nuevo aparecía recién al tocar una tecla.
 */
export function usePaletaDeCodigo(): void {
  const oscuro = useDocumentDarkTheme()
  const oscura = useAppStore((s) => s.settings?.paletaDeCodigoOscura)
  const clara = useAppStore((s) => s.settings?.paletaDeCodigoClara)

  useEffect(() => {
    definirTemasDeDolphin(monaco.editor, { oscura, clara })
    monaco.editor.setTheme(temaDeDolphin(oscuro))
  }, [oscura, clara, oscuro])
}
