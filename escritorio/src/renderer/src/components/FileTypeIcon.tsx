import { createElement, type CSSProperties } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import { getFileTypeBadge } from '@/lib/file-type-badge'
import {
  ATRIBUTO_LOGO,
  ATRIBUTO_LOGO_CLARO,
  instalarLogosDeArchivo,
  logoDeArchivo
} from '@/lib/file-icons/material-file-icons'
import {
  getFileTypeIcon,
  getPluginFileTypeIconIndex,
  getPluginFolderIconIndex
} from '@/lib/file-icons/file-type-icons'
import {
  PLUGIN_ICON_ATTRIBUTE,
  useActivePluginIconTheme
} from '@/store/plugins/appearance/plugin-icon-themes'

type IconProps = { className?: string; style?: CSSProperties }

function PluginIcon({ index, className, style }: IconProps & { index: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      {...{ [PLUGIN_ICON_ATTRIBUTE]: index }}
      className={className}
      style={style}
    />
  )
}

/**
 * The icon for a file path; one component so icon sources can change in one place.
 *
 * Desde el 25/11/2026 un archivo se dibuja con el LOGO real de su lenguaje (Material Icon Theme,
 * `lib/file-icons/material-file-icons.ts`). Lo de abajo es lo que queda para lo que ese set no
 * conoce: la extensión sobre el color de la marca, como en cualquier editor. Los glifos grises de antes decían «esto es un archivo» y nada más, y
 * en una lista de veinte un `.ts` y un `.png` se veían casi igual. El color hace el trabajo a la
 * distancia y la extensión resuelve el empate de cerca.
 *
 * El SVG mide lo que diga su `className` (`size-3.5` y compañía) porque no fija ancho ni alto:
 * así entra en las siete listas que ya usaban este componente sin tocar ninguna.
 *
 * Lo que no tiene extensión —un README a secas— se queda con el glifo de Lucide: una ficha
 * vacía no diría nada.
 */
export function FileTypeIcon({
  filePath,
  className,
  style
}: IconProps & { filePath: string | null | undefined }): React.JSX.Element {
  const index = getPluginFileTypeIconIndex(
    useActivePluginIconTheme((s) => s.theme),
    filePath
  )
  // Why el tema primero: quien instaló un tema de íconos lo hizo para ver SUS íconos. El badge
  // de la extensión y el glífico de Lucide siguen siendo lo que se ve sin tema, y lo que se ve
  // para un archivo que el tema no nombra.
  if (index !== null) {
    return <PluginIcon index={index} className={className} style={style} />
  }
  // El logo real del lenguaje (Material Icon Theme). La ficha con letras queda para lo que ese
  // set no conoce, y el glifo de Lucide para lo que no tiene ni nombre conocido ni extensión.
  const logo = logoDeArchivo(filePath)
  if (logo) {
    instalarLogosDeArchivo()
    return (
      <span
        aria-hidden="true"
        {...{ [ATRIBUTO_LOGO]: logo.oscuro, [ATRIBUTO_LOGO_CLARO]: logo.claro }}
        className={className}
        style={style}
      />
    )
  }
  const badge = getFileTypeBadge(filePath)
  if (!badge) {
    return createElement(getFileTypeIcon(filePath), { 'aria-hidden': true, className, style })
  }
  const letters = badge.label.toUpperCase()
  // En unidades del viewBox: cuatro letras en 14 px sólo entran si la tipografía achica.
  const fontSize = letters.length <= 2 ? 7.6 : letters.length === 3 ? 5.8 : 4.6
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="16" height="16" rx="4" fill={badge.color} />
      <text
        x="8"
        y="8.7"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing={letters.length > 2 ? -0.2 : 0}
        fill={badge.darkText ? '#15181c' : '#ffffff'}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
      >
        {letters}
      </text>
    </svg>
  )
}

/** A folder's icon; `folderPath` lets an icon theme pick one for its name, such as `src`. */
export function FolderIcon({
  folderPath,
  open,
  className,
  style
}: IconProps & { folderPath?: string; open: boolean }): React.JSX.Element {
  const index = getPluginFolderIconIndex(
    useActivePluginIconTheme((s) => s.theme),
    folderPath,
    open
  )
  return index === null ? (
    createElement(open ? FolderOpen : Folder, { 'aria-hidden': true, className, style })
  ) : (
    <PluginIcon index={index} className={className} style={style} />
  )
}
