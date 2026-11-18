import { useTranslate } from '@/i18n/use-translate'
import type { PlantillaDeDelfin } from '../../../../../shared/delfines-types'
import { DolphinMark } from '../DolphinMark'
import { ORDEN_DE_PLANTILLAS } from './delfines-formato'
import { ICONO_DE_PLANTILLA, nombreDePlantilla, queHacePlantilla } from './plantillas-de-delfin'

/**
 * Sin bots: qué son, en una línea, y las cuatro plantillas listas para tocar. La oferta es el
 * contenido; no hay un botón «crear» suelto que obligue a elegir después.
 */
export function VacioDeDelfines({
  onCrear
}: {
  onCrear: (plantilla: PlantillaDeDelfin, caja: DOMRect) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-2 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex size-28 items-center justify-center rounded-full bg-card">
          <DolphinMark className="size-14 text-foreground" />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl leading-tight font-semibold tracking-tight">
            {t('delfines.vacio.titulo', 'No dolphins yet')}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t(
              'delfines.vacio.que',
              'Bots that work on their own: they watch, report and write on a schedule, and only speak up when it matters.'
            )}
          </p>
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2" data-delfines-plantillas="">
        {ORDEN_DE_PLANTILLAS.map((plantilla) => {
          const Icono = ICONO_DE_PLANTILLA[plantilla]
          return (
            <li key={plantilla}>
              <button
                type="button"
                onClick={(evento) =>
                  onCrear(plantilla, evento.currentTarget.getBoundingClientRect())
                }
                className="flex w-full items-center gap-4 rounded-3xl bg-card p-4 text-left transition-[transform,background-color] duration-150 ease-[cubic-bezier(.34,1.56,.64,1)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.98]"
              >
                <Icono className="size-6 shrink-0 text-foreground/70" aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display text-base font-semibold tracking-tight">
                    {nombreDePlantilla(plantilla)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {queHacePlantilla(plantilla)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
