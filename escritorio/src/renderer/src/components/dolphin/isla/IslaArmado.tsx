import { useLayoutEffect, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { BOTON_REDONDO, nombreDeSeccion } from './isla-piezas'
import {
  alternarSeccion,
  moverSeccion,
  seccionesVisibles,
  type ArmadoDeIsla,
  type SeccionDeIsla
} from './secciones-isla'

type Movida = { seccion: SeccionDeIsla; accion: 'subir' | 'bajar' }

/**
 * Armar la isla a gusto: qué secciones se ven y en qué orden. Se guarda al tocar. Con el teclado, el
 * foco sigue a la sección que se movió (la fila cambia de lugar y el botón se perdía), y si llegó al
 * borde pasa al otro botón, porque el suyo queda deshabilitado.
 */
export function IslaArmado({
  armado,
  onCambiar,
  avisos,
  onCambiarAvisos,
  onVolverArriba,
  onListo
}: {
  armado: ArmadoDeIsla
  onCambiar: (armado: ArmadoDeIsla) => void
  avisos: boolean
  onCambiarAvisos: (avisos: boolean) => void
  onVolverArriba: () => void
  onListo: () => void
}): React.JSX.Element {
  const lista = useRef<HTMLUListElement>(null)
  const movida = useRef<Movida | null>(null)
  useLayoutEffect(() => {
    const pendiente = movida.current
    movida.current = null
    if (!pendiente) {
      return
    }
    const boton = (accion: Movida['accion']): HTMLButtonElement | null | undefined =>
      lista.current?.querySelector<HTMLButtonElement>(
        `[data-seccion="${pendiente.seccion}"][data-accion="${accion}"]`
      )
    const mismo = boton(pendiente.accion)
    const otro = boton(pendiente.accion === 'subir' ? 'bajar' : 'subir')
    ;(mismo && !mismo.disabled ? mismo : otro)?.focus()
  }, [armado])

  const mover = (seccion: SeccionDeIsla, accion: Movida['accion']): void => {
    movida.current = { seccion, accion }
    onCambiar(moverSeccion(armado, seccion, accion === 'subir' ? -1 : 1))
  }
  const ultima = armado.orden.length - 1
  const visibles = seccionesVisibles(armado)
  return (
    <div>
      <ul ref={lista} className="space-y-0.5">
        {armado.orden.map((seccion, indice) => {
          const visible = !armado.ocultas.includes(seccion)
          const fija = visible && visibles.length === 1
          const nombre = nombreDeSeccion(seccion)
          return (
            <li key={seccion} className="flex items-center gap-1 rounded-2xl py-1 pr-1.5 pl-3">
              <span
                className={cn(
                  'flex-1 text-[13px] transition-colors duration-150',
                  !visible && 'text-white/40'
                )}
              >
                {nombre}
              </span>
              <button
                type="button"
                data-seccion={seccion}
                data-accion="subir"
                disabled={indice === 0}
                onClick={() => mover(seccion, 'subir')}
                aria-label={translate('auto.components.dolphin.isla.moveUp', 'Move {{value0}} up', {
                  value0: nombre
                })}
                className={BOTON_REDONDO}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-seccion={seccion}
                data-accion="bajar"
                disabled={indice === ultima}
                onClick={() => mover(seccion, 'bajar')}
                aria-label={translate(
                  'auto.components.dolphin.isla.moveDown',
                  'Move {{value0}} down',
                  { value0: nombre }
                )}
                className={BOTON_REDONDO}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                // La última que se ve no se apaga: la isla abierta quedaría vacía. Se dice, no se calla.
                aria-disabled={fija || undefined}
                title={
                  fija
                    ? translate(
                        'auto.components.dolphin.isla.lastSection',
                        'At least one section stays visible'
                      )
                    : undefined
                }
                onClick={() => {
                  if (!fija) {
                    onCambiar(alternarSeccion(armado, seccion))
                  }
                }}
                aria-label={translate('auto.components.dolphin.isla.show', 'Show {{value0}}', {
                  value0: nombre
                })}
                className={cn(
                  'relative ml-1 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
                  visible ? 'bg-white' : 'bg-white/15',
                  fija && 'cursor-not-allowed opacity-60'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
                    visible ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white/70'
                  )}
                />
              </button>
            </li>
          )
        })}
      </ul>
      {/* Los avisos van aparte de las secciones: no son algo que se mira, sino algo que llega. */}
      <div className="mt-1 flex items-center gap-1 rounded-2xl bg-white/[0.04] py-2 pr-1.5 pl-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px]">
            {translate('auto.components.dolphin.isla.notices', 'Notices')}
          </span>
          <span className="block text-xs text-white/50">
            {translate(
              'auto.components.dolphin.isla.noticesHint',
              'When an agent finishes or needs you'
            )}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={avisos}
          onClick={() => onCambiarAvisos(!avisos)}
          aria-label={translate('auto.components.dolphin.isla.notices', 'Notices')}
          className={cn(
            'relative ml-1 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
            avisos ? 'bg-white' : 'bg-white/15'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-0.5 left-0.5 size-4 rounded-full transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
              avisos ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white/70'
            )}
          />
        </button>
      </div>
      <div className="flex justify-end px-1.5 pt-2 pb-1">
        <button
          type="button"
          onClick={onVolverArriba}
          className="mr-auto rounded-full px-3.5 py-1.5 text-xs text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
        >
          {translate('auto.components.dolphin.isla.resetPosition', 'Reset to top center')}
        </button>
        <button
          type="button"
          onClick={onListo}
          className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-transform duration-150 ease-out active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          {translate('auto.components.dolphin.isla.customizeDone', 'Done')}
        </button>
      </div>
    </div>
  )
}
