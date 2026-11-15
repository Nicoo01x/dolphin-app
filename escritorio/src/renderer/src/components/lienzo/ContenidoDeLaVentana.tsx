import { translate } from '@/i18n/i18n'
import { panelLod, type Rect, type ViewportTransform } from './canvas'
import { cuerpoEnElPlano } from './PanelFlotante'
import { VentanaDeArchivos } from './VentanaDeArchivos'
import { urlDeLaConsola, VentanaDeConsola } from './VentanaDeConsola'
import { VentanaDeNavegador } from './VentanaDeNavegador'
import { VentanaDeTerminal } from './VentanaDeTerminal'
import type { PanelDelLienzo } from './lienzo-paneles'

/**
 * Qué va adentro de una ventana del lienzo, según lo que sea.
 *
 * Vive aparte de `LienzoPage` nada más que por tamaño: la página ya lleva el plano, la cámara,
 * el imán y la disposición, y elegir contenido es una decisión suelta que no necesita nada de
 * eso. El nivel de detalle se calcula acá, con el mismo `panelLod` para los tres, así una
 * ventana no puede quedar «viva» en un tipo y «foto» en otro con el mismo zoom.
 */
export function ContenidoDeLaVentana({
  panel,
  vista,
  aLaVista,
  worktreeId,
  base,
  falla,
  repoPath,
  oscuro,
  alFrente,
  alCerrar
}: {
  panel: PanelDelLienzo
  vista: ViewportTransform
  /** Qué pedazo del plano se está viendo: con eso se decide si la ventana se dibuja viva. */
  aLaVista: Rect
  worktreeId: string | null
  /** La URL de la consola del proyecto, cuando ya levantó. */
  base: string | null
  falla: string | null
  repoPath: string | null
  oscuro: boolean
  alFrente: boolean
  alCerrar: () => void
}): React.JSX.Element {
  const detalle = panelLod(panel.rect, aLaVista, vista.zoom)

  if (panel.tipo === 'terminal') {
    return (
      <VentanaDeTerminal
        worktreeId={worktreeId}
        zoom={vista.zoom}
        enElPlano={cuerpoEnElPlano(panel.rect)}
        detalle={detalle}
        titulo={panel.titulo}
        alFrente={alFrente}
        alCerrar={alCerrar}
      />
    )
  }

  if (panel.tipo === 'navegador') {
    return <VentanaDeNavegador zoom={vista.zoom} detalle={detalle} titulo={panel.titulo} />
  }

  if (panel.tipo === 'archivos') {
    return <VentanaDeArchivos zoom={vista.zoom} detalle={detalle} titulo={panel.titulo} />
  }

  if (!base) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-[13px] text-muted-foreground">
        {falla ??
          (repoPath
            ? translate('canvas.consoleStarting', 'Starting the console…')
            : translate(
                'canvas.pickProjectWindow',
                'Pick a project in the left bar and this window fills itself.'
              ))}
      </div>
    )
  }

  return (
    <VentanaDeConsola
      url={urlDeLaConsola(base, panel.subtitulo ?? 'tablero', oscuro)}
      vista={panel.subtitulo ?? 'tablero'}
      zoom={vista.zoom}
      detalle={detalle}
      titulo={panel.titulo}
    />
  )
}
