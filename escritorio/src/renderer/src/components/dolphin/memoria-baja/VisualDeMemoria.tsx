import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { MemoryStick } from 'lucide-react'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { AvisoDeMemoriaBaja } from '../../../../../shared/modo-poca-ram'
import { formatearMemoria } from './formato-de-memoria'

type Tramo = { readonly clave: string; readonly bytes: number; readonly tono: string }

/**
 * Cómo se reparte la RAM, de izquierda a derecha: lo que más pesa, todo lo demás que está en uso y
 * lo libre. Tres tramos y no cuatro: el resto de Dolphin y los otros programas se leen igual desde
 * acá, y un tramo sin nombre en la leyenda sólo hacía preguntar qué era.
 *
 * Los números de Dolphin suman por proceso y pueden pasarse del total (las páginas compartidas se
 * cuentan dos veces), así que cada tramo se recorta contra lo que queda.
 */
export function tramosDeLaMemoria(aviso: AvisoDeMemoriaBaja): Tramo[] {
  const total = Math.max(0, aviso.total)
  const libre = Math.min(total, Math.max(0, aviso.disponible))
  const pesado = Math.min(total - libre, Math.max(0, aviso.masPesado.bytes))
  return [
    { clave: 'pesado', bytes: pesado, tono: 'bg-foreground' },
    { clave: 'resto', bytes: total - libre - pesado, tono: 'bg-foreground/[0.18]' },
    { clave: 'libre', bytes: libre, tono: 'bg-transparent' }
  ]
}

/** Que la barra se llene de izquierda a derecha al abrirse: es lo único que se mueve adentro. */
function useLlenado(): React.RefObject<HTMLDivElement | null> {
  const barra = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const nodo = barra.current
    if (!nodo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const tween = gsap.fromTo(
      nodo,
      { scaleX: 0 },
      { scaleX: 1, duration: 0.52, delay: 0.18, ease: 'expo.out', transformOrigin: '0% 50%' }
    )
    return () => {
      tween.kill()
    }
  }, [])
  return barra
}

/** El visual del cartel: el chip de memoria, lo libre bien grande y la barra que lo explica. */
export function VisualDeMemoria({
  aviso
}: {
  readonly aviso: AvisoDeMemoriaBaja
}): React.JSX.Element {
  const t = useTranslate()
  const locale = useIntlLocale()
  const barra = useLlenado()
  const tramos = tramosDeLaMemoria(aviso)
  const total = Math.max(1, aviso.total)
  const nombre =
    aviso.masPesado.tipo === 'espacio'
      ? aviso.masPesado.nombre
      : t('memoriaBaja.visual.dolphin', 'Dolphin')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <div className="flex size-14 items-center justify-center rounded-full bg-popover text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_6px_16px_rgb(0_0_0/0.06)]">
        <MemoryStick className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[32px] leading-none font-semibold tabular-nums text-foreground">
          {formatearMemoria(aviso.disponible, locale)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('memoriaBaja.visual.libresDe', 'free of {{total}}', {
            total: formatearMemoria(aviso.total, locale)
          })}
        </span>
      </div>
      <div className="flex w-full max-w-[22rem] flex-col gap-2">
        <div
          ref={barra}
          className="flex h-3 w-full overflow-hidden rounded-full bg-popover shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)]"
        >
          {tramos.map((tramo) =>
            tramo.bytes > 0 ? (
              <div
                key={tramo.clave}
                className={cn('h-full', tramo.tono)}
                style={{ width: `${(tramo.bytes / total) * 100}%` }}
              />
            ) : null
          )}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5" title={nombre}>
            <span className="size-2 shrink-0 rounded-full bg-foreground" />
            <span className="truncate">{nombre}</span>
            <span className="shrink-0 tabular-nums">
              {formatearMemoria(aviso.masPesado.bytes, locale)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="size-2 rounded-full bg-popover shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_30%,transparent)]" />
            {t('memoriaBaja.visual.libre', 'Free')}
          </span>
        </div>
      </div>
    </div>
  )
}
