import { useEffect } from 'react'
import * as monaco from 'monaco-editor'
import { useAppStore } from '@/store'
import { definirTemasDeDolphin, temaDeDolphin } from './tema-dolphin-monaco'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { temaDeCodigo } from '../../../../shared/tema-de-codigo'
import { fijarTemaDeResaltado } from '@/lib/syntax-highlighting/syntax-highlighter'
import { usePaisajeActivo } from '../dolphin/paisaje/paisaje-activo'
import './tema-noche.css'

/**
 * Mantiene los temas de Monaco al día con el tema y la paleta que la persona eligió.
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
  const tema = temaDeCodigo(useAppStore((s) => s.settings?.temaDeCodigo))
  // Con paisaje y paneles de vidrio, el lienzo del editor va sin fondo (`sobreElVidrio`).
  const vidrio = usePaisajeActivo((s) => s.activo && s.vidrio)

  useEffect(() => {
    definirTemasDeDolphin(monaco.editor, { oscura, clara }, tema, vidrio)
    monaco.editor.setTheme(temaDeDolphin(oscuro))
  }, [oscura, clara, oscuro, tema, vidrio])

  // El chat colorea con shiki, no con Monaco: lo mismo, del otro lado. Y la marca en <html> es lo
  // que deja a las hojas pintar lo que ningún tema sabe (la barra del diff, los diffs del chat).
  useEffect(() => {
    fijarTemaDeResaltado(tema)
    document.documentElement.dataset.temaDeCodigo = tema
  }, [tema])
}
