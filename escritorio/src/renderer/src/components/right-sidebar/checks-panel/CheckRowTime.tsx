import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { useTranslation } from 'react-i18next'
import { checkTiming } from '../../../../../shared/github/check-timing'
import type { PRCheckDetail } from '../../../../../shared/github/check-types'
import { textosDelTiempoDeCheck } from './check-timing-text'

/**
 * Cuánto tardó un check y hace cuánto terminó, al lado de su estado.
 *
 * Why existe: la lista decía «Failed» y nada más, así que una falla de hace tres horas se veía
 * igual que una de hace un minuto y no había forma de saber si la roja era de este push sin
 * abrirla.
 */
const CADA_CUANTO_SE_REFRESCA_MS = 30_000

/**
 * Why un reloj propio y no `Date.now()` en el render: «9m ago» tiene que pasar a «10m ago» sola,
 * y la lista sólo se vuelve a dibujar cuando cambian los checks. Medio minuto alcanza: la fila
 * nunca cuenta segundos.
 */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!activo) {
      return
    }
    // Why: con la ventana oculta nadie lee la edad; al volver a la vista se pone al día de una.
    return installWindowVisibilityInterval({
      run: () => setAhora(Date.now()),
      intervalMs: CADA_CUANTO_SE_REFRESCA_MS
    })
  }, [activo])
  return ahora
}

function horaExacta(valor: string | null | undefined, locale: string): string | null {
  if (!valor) {
    return null
  }
  const ms = Date.parse(valor)
  if (!Number.isFinite(ms)) {
    return null
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(ms)
}

export function CheckRowTime({ check }: { check: PRCheckDetail }): React.JSX.Element | null {
  // Why: sin esto la fila se queda con las unidades del idioma anterior hasta que algo más la
  // vuelva a dibujar, y cambiar de idioma no vuelve a dibujar la lista de checks.
  useTranslation()
  const locale = getIntlLocale()
  const hayTiempos = Boolean(check.startedAt || check.completedAt)
  const ahora = useAhora(hayTiempos)
  if (!hayTiempos) {
    // Sin tiempos no se dibuja nada, ni un guion: las filas de aprobación y los hosts que no
    // dan fechas se ven exactamente como antes.
    return null
  }
  const timing = checkTiming(check, ahora)
  if (!timing) {
    return null
  }
  const { duracion, edad } = textosDelTiempoDeCheck(timing, locale)
  if (!duracion && !edad) {
    return null
  }
  const inicio = horaExacta(check.startedAt, locale)
  const fin = horaExacta(check.completedAt, locale)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="hidden min-w-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums @[15rem]/checks:flex">
          {/* La duración se suelta primero cuando el panel se angosta: lo que dice si una fila
              roja importa es cuándo pasó, no cuánto tardó. */}
          {duracion ? (
            <span className="hidden truncate @[19rem]/checks:inline">{duracion}</span>
          ) : null}
          {duracion && edad ? (
            <span aria-hidden="true" className="hidden @[19rem]/checks:inline">
              ·
            </span>
          ) : null}
          {edad ? <span className="truncate">{edad}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={4}>
        <span className="flex flex-col gap-0.5">
          {inicio ? (
            <span>
              {translate('checksPanel.time.started', 'Started')} {inicio}
            </span>
          ) : null}
          {fin ? (
            <span>
              {translate('checksPanel.time.finished', 'Finished')} {fin}
            </span>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
