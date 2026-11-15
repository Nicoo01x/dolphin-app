import { useEffect } from 'react'
import { useAppStore } from '@/store'
import FileExplorer from '../right-sidebar/file-explorer/panel/FileExplorer'
import { claimExternalFileExplorerSurface } from '../right-sidebar/file-explorer-surfaces'
import type { PanelLod } from './canvas'

/**
 * Los archivos del proyecto en una ventana del lienzo.
 *
 * Es el MISMO explorador de la barra lateral del Dolphin de siempre, no una copia: lee el
 * worktree activo del store y trae con él la búsqueda, el filtro por nombre, el menú de cada
 * fila y el alta de archivos. Rehacerlo acá habría sido un árbol de mentira al lado de uno de
 * verdad, y la primera vez que alguien quisiera crear un archivo desde el plano la diferencia
 * se notaba.
 *
 * Comparte su estado con la barra lateral a propósito: lo que expandís acá queda expandido
 * allá. Son la misma herramienta mirada desde dos lugares, igual que la terminal porteada.
 *
 * Lejos se desmonta, y eso acá SÍ se puede: un árbol de archivos no tiene ningún proceso
 * corriendo que se pierda, al revés de la terminal, donde desmontar mata al agente.
 */
export function VentanaDeArchivos({
  zoom,
  detalle,
  titulo
}: {
  zoom: number
  detalle: PanelLod
  titulo: string
}): React.JSX.Element {
  const verArchivos = useAppStore((s) => s.setRightSidebarExplorerView)
  const worktreeId = useAppStore((s) => s.activeWorktreeId)

  // El árbol solo se carga mientras se lo ve, y «se lo ve» era hasta ahora «la barra lateral
  // está abierta». Acá la barra está cerrada y el árbol igual está a la vista, así que esta
  // ventana se anota como otra superficie: sin esto, el explorador se quedaba girando para
  // siempre adentro de la ventana (medido: spinner infinito con el worktree bien elegido).
  useEffect(() => claimExternalFileExplorerSurface(), [])

  // El explorador recuerda si lo dejaste en archivos o en búsqueda, y lo recuerda POR WORKTREE:
  // al elegir uno, el store repone la vista que tenía. Una ventana que se llama «Archivos» tiene
  // que mostrar archivos —si no, aparece el buscador vacío y parece que no cargó—, así que esto
  // se vuelve a pedir en cada cambio de worktree, que es cuando lo pisan. Se cambia solo la
  // vista: `showRightSidebarFiles` además abriría la barra lateral y la dejaría abierta al salir
  // del lienzo.
  useEffect(() => {
    verArchivos('files')
  }, [verArchivos, worktreeId])

  if (detalle !== 'live') {
    return (
      <div className="grid h-full place-items-center bg-muted/20 text-center text-muted-foreground">
        <span style={{ fontSize: Math.max(10, 13 * zoom) }}>{titulo}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-[13px]">
      <FileExplorer />
    </div>
  )
}
