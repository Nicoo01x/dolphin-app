import { useRef, type ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { useMargenParaElFlotante } from './lugar-para-el-flotante'

/**
 * El lugar del compositor mientras el inicio carga: la caja vacía, del mismo alto. La franja del
 * mundo se queda con el alto que sobra, así que sin esto arrancaba más alta y, al aparecer el
 * compositor, se achicaba de golpe. No se monta el compositor de verdad por adelantado: tiene
 * `autoFocus` y un borrador compartido, y montarlo antes de tiempo cambiaría cómo arranca.
 *
 * Repite la estructura de LandingStartComposer con sus mismas clases (si cambian allá, cambian
 * acá): la caja con `p-2` y borde; el cuadro de texto, que se mide con su contenido
 * (`field-sizing`), así que va el mismo, con el mismo texto de ejemplo y sin verse, para que mida
 * lo mismo a cualquier ancho; la fila del botón de enviar y el renglón del aviso.
 */
function HuecoDelCompositor(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="w-full space-y-1.5" data-dolphin-hueco-compositor="">
      <div className="rounded-2xl border border-chat-composer-border bg-popover p-2">
        <textarea
          disabled
          tabIndex={-1}
          value=""
          readOnly
          placeholder={translate(
            'components.landing.start.promptPlaceholder',
            'Describe what you want done. Dolphin opens a workspace and starts an agent on it.'
          )}
          className={cn(
            'invisible min-h-12 w-full resize-none bg-transparent px-2 py-1 text-sm pointer-coarse:min-h-14',
            'max-h-[calc(8lh+0.5rem)] overflow-hidden [field-sizing:content]'
          )}
        />
        <div className="flex w-full items-center pt-0.5">
          <div className="ml-auto size-8 pointer-coarse:size-10" />
        </div>
      </div>
      <p className="min-h-4 px-1 text-[11px]" />
    </div>
  )
}

/**
 * El compositor fijo abajo del inicio, fuera del scroll. Mientras carga se reserva su lugar (lo
 * normal es que haya proyectos); listo, va el compositor, salvo en un perfil nuevo, donde no podría
 * hacer nada y ese alto lo aprovecha el tablero de ejemplo.
 */
export function RanuraDelCompositor({
  listo,
  perfilNuevo,
  compositor
}: {
  listo: boolean
  perfilNuevo: boolean
  compositor?: ReactNode
}): React.JSX.Element | null {
  if (!compositor || (listo && perfilNuevo)) {
    return null
  }
  return <Ranura>{listo ? compositor : <HuecoDelCompositor />}</Ranura>
}

/** La ranura en sí: le deja lugar al botón flotante de la base cuando lo pisaría (ver lugar-para-el-flotante). */
function Ranura({ children }: { children: ReactNode }): React.JSX.Element {
  const ranura = useRef<HTMLDivElement>(null)
  const margenDerecho = useMargenParaElFlotante(ranura)
  return (
    <div
      ref={ranura}
      className="relative shrink-0 px-6 pb-2 pt-3"
      style={margenDerecho === null ? undefined : { paddingRight: margenDerecho }}
      data-dolphin-ranura-compositor=""
    >
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  )
}
