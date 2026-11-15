import { translate } from '@/i18n/i18n'
import { useRef, useState } from 'react'
import { Map as Mapa } from 'lucide-react'
import { visibleWorldRect, type Rect, type Size, type ViewportTransform } from './canvas'
import { alMinimapa, desdeElMinimapa, loQueEntra, proyeccionDelMinimapa } from './mapa-del-plano'
import type { PanelDelLienzo } from './lienzo-paneles'

/**
 * El mapa del plano, abajo a la derecha: dónde están las ventanas y dónde estás vos.
 *
 * Es la pieza que hace navegable un plano más grande que la pantalla. Sin esto, una ventana que
 * quedó a 400 px arriba del borde no existe hasta que te acordás de que estaba —me pasó
 * midiendo esto— y el único rescate es «ver todo», que te saca de donde estabas.
 *
 * Medido sobre Deska 1.29.0 con CDP (01/11), y la cuenta viene de su código (`chrome/Dock.tsx`):
 * 142×88 abierto, radio 10, retícula de puntos cada 11 px, sombra `0 12px 36px` al 45 %. Cerrado
 * es una pastilla de 52×32 con el mapa adentro a escala 0,3667; al pasarle el puntero se abre
 * solo (con 180 ms de demora, para que cruzar por encima no lo despliegue) y al salir se cierra
 * con 120 ms. Sin ventanas es un botón de 36×30 y nada más: un mapa de la nada no se muestra.
 */

const ABIERTO = { width: 142, height: 88 }
const CERRADO = { width: 52, height: 32 }
const VACIO = { width: 36, height: 30 }
/** Lo que mide el mapa adentro de la pastilla cerrada: 52/142 ≈ 0,3667, el valor de Deska. */
const ESCALA_CERRADO = 0.3667

export function Minimapa({
  paneles,
  vista,
  medida,
  activo,
  alIr
}: {
  paneles: readonly PanelDelLienzo[]
  vista: ViewportTransform
  /** El tamaño del plano en pantalla: con eso se sabe qué pedazo se está viendo. */
  medida: Size
  /** Cuál está al frente, que en el mapa va más marcada. */
  activo: string | null
  /** Llevar la vista a un punto del plano. */
  alIr: (punto: { x: number; y: number }) => void
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  const vacio = paneles.length === 0
  const aLaVista = visibleWorldRect(vista, medida)
  const mundo = loQueEntra(
    paneles.map((p) => p.rect),
    aLaVista
  )
  const proyeccion = proyeccionDelMinimapa(mundo, ABIERTO)
  const marco = alMinimapa(aLaVista, proyeccion)

  const tamano = vacio ? VACIO : abierto ? ABIERTO : CERRADO

  const irADonde = (evento: React.MouseEvent): void => {
    const donde = caja.current?.getBoundingClientRect()
    if (!donde || vacio || !abierto) {
      return
    }
    alIr(
      desdeElMinimapa({ x: evento.clientX - donde.left, y: evento.clientY - donde.top }, proyeccion)
    )
  }

  return (
    <div
      ref={caja}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onClick={irADonde}
      className="pointer-events-auto relative overflow-hidden rounded-[10px] shadow-[0_12px_36px_rgba(0,0,0,0.45)] transition-[width,height] duration-300 ease-[var(--lienzo-ease)]"
      style={{
        width: tamano.width,
        height: tamano.height,
        // La retícula de puntos del propio mapa: la misma idea que el piso del lienzo, a 11 px.
        backgroundImage: 'radial-gradient(var(--lienzo-hairline) 0.8px, transparent 0.8px)',
        backgroundSize: '11px 11px',
        backgroundColor: 'var(--color-lienzo-vidrio)',
        backdropFilter: 'var(--lienzo-vidrio-desenfoque)',
        boxShadow: 'var(--lienzo-vidrio-borde), 0 12px 36px rgba(0,0,0,0.45)',
        transitionDelay: abierto ? '180ms' : '120ms'
      }}
    >
      {/* El escenario: el mapa siempre se dibuja del tamaño abierto y se achica entero. Dibujarlo
          chico sería recalcular la proyección en cada hover y que las ventanas salten. */}
      <div
        aria-hidden={vacio || undefined}
        className="absolute right-0 bottom-0 origin-bottom-right transition-transform duration-300 ease-[var(--lienzo-ease)]"
        style={{
          width: ABIERTO.width,
          height: ABIERTO.height,
          transform: abierto ? 'scale(1)' : `scale(${ESCALA_CERRADO})`,
          transitionDelay: abierto ? '180ms' : '120ms',
          opacity: vacio ? 0 : 1
        }}
      >
        {paneles.map((panel) => (
          <NodoDelMapa
            key={panel.id}
            rect={alMinimapa(panel.rect, proyeccion)}
            alFrente={panel.id === activo}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute z-[2] rounded-[6px] border-[1.2px] transition-opacity duration-300"
          style={{
            left: marco.x,
            top: marco.y,
            width: marco.width,
            height: marco.height,
            borderColor: 'color-mix(in srgb, var(--color-lienzo-acento) 65%, transparent)',
            opacity: abierto ? 1 : 0
          }}
        />
      </div>

      <button
        type="button"
        aria-label={
          abierto
            ? translate('canvas.minimap', 'Canvas map')
            : translate('canvas.minimapShow', 'Show the canvas map')
        }
        title={translate('canvas.minimap', 'Canvas map')}
        onClick={() => setAbierto((a) => !a)}
        className="absolute right-0 bottom-0 z-[3] grid size-9 place-items-center text-muted-foreground transition-colors duration-[120ms] hover:text-foreground"
        style={vacio || !abierto ? { inset: 0, width: '100%', height: '100%' } : undefined}
      >
        <Mapa
          aria-hidden="true"
          className="size-[13px] transition-opacity duration-[120ms]"
          style={{ opacity: abierto && !vacio ? 0 : vacio ? 1 : 0.7 }}
        />
      </button>
    </div>
  )
}

/**
 * Una ventana en el mapa.
 *
 * La del frente va más marcada que las otras: con seis ventanas, el mapa sin eso es un montón de
 * rectángulos iguales y no dice cuál estás usando.
 */
function NodoDelMapa({ rect, alFrente }: { rect: Rect; alFrente: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="absolute rounded-[3px]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: `color-mix(in srgb, #eef1f5 ${alFrente ? 30 : 20}%, transparent)`,
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #eef1f5 16%, transparent)'
      }}
    />
  )
}
