import { cn } from '@/lib/class-names'
import './tira.css'

/** Los tonos de estado de la tira; `hueso` es lo que todavía no pasó. */
export type TonoDeSegmento = 'verde' | 'violeta' | 'rojo' | 'gris' | 'ambar' | 'hueso'

export type SegmentoDeTira = {
  tono: TonoDeSegmento
  /** Cuánto ancho ocupa respecto de los demás (por defecto, uno). */
  peso?: number
  /** A media tinta: lo que se salteó o lo que espera. */
  atenuado?: boolean
  /** Para el puntero: qué es este segmento. */
  titulo?: string
}

/**
 * La tira de segmentos de estado. Es decorativa (`aria-hidden`): quien la usa pone al lado el mismo
 * dato en texto, para el lector de pantalla y para el puntero.
 */
export function TiraDeSegmentos({
  segmentos,
  className,
  crece = true
}: {
  segmentos: readonly SegmentoDeTira[]
  className?: string
  /** Revelarla de izquierda a derecha al entrar; no en una tira que se va llenando sola. */
  crece?: boolean
}): React.JSX.Element | null {
  if (segmentos.length === 0) {
    return null
  }
  // Un span y no un div: la tira también va adentro de un botón (una tarjeta del tablero).
  return (
    <span
      aria-hidden
      className={cn(
        'dolphin-tira flex h-1.5 gap-0.5 overflow-hidden rounded-full',
        crece && 'dolphin-tira-crece',
        className
      )}
    >
      {segmentos.map((segmento, indice) => (
        <span
          key={indice}
          data-tono={segmento.tono}
          title={segmento.titulo}
          className="dolphin-tira-segmento h-full min-w-0.5 rounded-full bg-(--tono)"
          style={{ flexGrow: segmento.peso ?? 1, opacity: segmento.atenuado ? 0.5 : 1 }}
        />
      ))}
    </span>
  )
}
