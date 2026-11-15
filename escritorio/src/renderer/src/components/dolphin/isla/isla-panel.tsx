import { useLayoutEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import { IslaAgentes, type PedidoDeRespuesta } from './IslaAgentes'
import { IslaArmado } from './IslaArmado'
import { IslaBandeja } from './IslaBandeja'
import { IslaNotas } from './IslaNotas'
import { IslaEstudio } from './IslaEstudio'
import { BOTON_REDONDO, nombreDeSeccion } from './isla-piezas'
import type { ArmadoDeIsla, SeccionDeIsla } from './secciones-isla'
import type { EstadoDePreferencias } from './use-preferencias-isla'

/** Con las flechas, Inicio y Fin se pasa de pestaña, como pide el patrón de pestañas de ARIA. */
function pestanaPorTecla(
  tecla: string,
  visibles: readonly SeccionDeIsla[],
  actual: SeccionDeIsla
): SeccionDeIsla | null {
  const indice = visibles.indexOf(actual)
  const cuantas = visibles.length
  if (tecla === 'ArrowRight') {
    return visibles[(indice + 1) % cuantas]
  }
  if (tecla === 'ArrowLeft') {
    return visibles[(indice - 1 + cuantas) % cuantas]
  }
  if (tecla === 'Home') {
    return visibles[0]
  }
  return tecla === 'End' ? visibles[cuantas - 1] : null
}

/**
 * Las pestañas de las secciones, con la ficha de la elegida que se desliza de una a otra. Una sola
 * parada de Tab (la elegida); las demás se recorren con las flechas.
 */
function Pestanas({
  visibles,
  actual,
  onElegir
}: {
  visibles: readonly SeccionDeIsla[]
  actual: SeccionDeIsla
  onElegir: (seccion: SeccionDeIsla) => void
}): React.JSX.Element {
  const fila = useRef<HTMLDivElement>(null)
  const [ficha, setFicha] = useState<{ x: number; ancho: number } | null>(null)
  useLayoutEffect(() => {
    const boton = fila.current?.querySelector<HTMLElement>(`[data-seccion="${actual}"]`)
    setFicha(boton ? { x: boton.offsetLeft, ancho: boton.offsetWidth } : null)
  }, [actual, visibles])
  return (
    <div
      ref={fila}
      role="tablist"
      aria-label={translate('auto.components.dolphin.isla.sections', 'Island sections')}
      onKeyDown={(event) => {
        const destino = pestanaPorTecla(event.key, visibles, actual)
        if (!destino) {
          return
        }
        event.preventDefault()
        onElegir(destino)
        fila.current?.querySelector<HTMLElement>(`[data-seccion="${destino}"]`)?.focus()
      }}
      className="relative flex flex-1 gap-1"
    >
      {ficha ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-white/[0.12] transition-[transform,width] duration-200 ease-[cubic-bezier(.38,.49,0,1)] motion-reduce:transition-none"
          style={{ width: ficha.ancho, transform: `translateX(${ficha.x}px)` }}
        />
      ) : null}
      {visibles.map((seccion) => (
        <button
          key={seccion}
          id={`isla-pestana-${seccion}`}
          type="button"
          role="tab"
          data-seccion={seccion}
          tabIndex={actual === seccion ? 0 : -1}
          aria-selected={actual === seccion}
          aria-controls="isla-seccion"
          onClick={() => onElegir(seccion)}
          className={cn(
            'relative rounded-full px-3 py-1 text-xs font-medium transition-[color,transform] duration-150 ease-out active:scale-[.97] focus-visible:outline-2 focus-visible:outline-white/60',
            actual === seccion ? 'text-white' : 'text-white/55 hover:text-white'
          )}
        >
          {nombreDeSeccion(seccion)}
        </button>
      ))}
    </div>
  )
}

/** Lo de adentro de la isla abierta: las pestañas, el botón de armar y la sección elegida. */
export function PanelDeIsla({
  visibles,
  actual,
  onElegir,
  armando,
  onArmando,
  armado,
  onCambiarArmado,
  avisos,
  onCambiarAvisos,
  onVolverArriba,
  lista,
  onIr,
  responderA,
  onPedidoAtendido,
  notas,
  estadoDeNotas,
  onCambiarNotas,
  vez,
  tablero
}: {
  visibles: readonly SeccionDeIsla[]
  actual: SeccionDeIsla
  onElegir: (seccion: SeccionDeIsla) => void
  armando: boolean
  onArmando: (armando: boolean) => void
  armado: ArmadoDeIsla
  onCambiarArmado: (armado: ArmadoDeIsla) => void
  avisos: boolean
  onCambiarAvisos: (avisos: boolean) => void
  onVolverArriba: () => void
  lista: readonly DashboardCard[]
  onIr: () => void
  responderA: PedidoDeRespuesta | null
  onPedidoAtendido: () => void
  notas: string
  estadoDeNotas: EstadoDePreferencias
  onCambiarNotas: (notas: string) => void
  /** Cuántas veces se abrió: los agentes y la bandeja arrancan de cero en cada apertura. */
  vez: number
  tablero: number
}): React.JSX.Element {
  const armar = translate('auto.components.dolphin.isla.customize', 'Customize the island')
  return (
    <div className="px-2 pb-2">
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <Pestanas visibles={visibles} actual={actual} onElegir={onElegir} />
        <button
          id="isla-armar"
          type="button"
          aria-pressed={armando}
          aria-label={armar}
          title={armar}
          onClick={() => onArmando(!armando)}
          className={cn(BOTON_REDONDO, 'size-7', armando && 'bg-white/10 text-white')}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {/* El panel recibe el foco: una lista sin botones (la bandeja) también se scrollea con el
          teclado. */}
      <div
        id="isla-seccion"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={armando ? 'isla-armar' : `isla-pestana-${actual}`}
        className="scrollbar-sleek max-h-[360px] overflow-y-auto rounded-2xl focus-visible:outline-2 focus-visible:outline-white/40"
      >
        {armando ? (
          <IslaArmado
            armado={armado}
            onCambiar={onCambiarArmado}
            avisos={avisos}
            onCambiarAvisos={onCambiarAvisos}
            onVolverArriba={onVolverArriba}
            onListo={() => onArmando(false)}
          />
        ) : actual === 'agentes' ? (
          // Por apertura: una respuesta que quedó abierta de la vez anterior no reaparece sola (el
          // agente pudo haber cambiado); la que pide «Responder» llega en responderA.
          <IslaAgentes
            key={vez}
            lista={lista}
            onIr={onIr}
            responderA={responderA}
            onPedidoAtendido={onPedidoAtendido}
          />
        ) : actual === 'bandeja' ? (
          <IslaBandeja key={vez} />
        ) : actual === 'estudio' ? (
          <IslaEstudio cards={lista} tablero={tablero} onIr={onIr} />
        ) : (
          <IslaNotas notas={notas} estado={estadoDeNotas} onCambiar={onCambiarNotas} />
        )}
      </div>
    </div>
  )
}
