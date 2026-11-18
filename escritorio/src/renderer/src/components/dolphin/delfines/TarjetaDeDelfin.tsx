import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { Bot, MessageCircle, Server, ServerOff } from 'lucide-react'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { Delfin } from '../../../../../shared/delfines-types'
import {
  estadoDeDelfin,
  horaRelativa,
  plantillaDe,
  presupuestoDe,
  type EstadoDeDelfin
} from './delfines-formato'
import { ICONO_DE_PLANTILLA } from './plantillas-de-delfin'
import { BOTON_TONAL } from './VentanaDeDelfin'

/**
 * Un delfín: quién es, si está vivo, cuándo sale su próxima rutina, cuánto gastó del mes y lo
 * último que dijo. El estado se lee por forma y movimiento, no por color: el que corre late; el
 * semántico (ámbar) queda sólo para lo que te espera a vos.
 */

function useEstadoTexto(): (estado: EstadoDeDelfin, donde: Delfin['donde']) => string {
  const t = useTranslate()
  return (estado, donde) => {
    switch (estado) {
      case 'corriendo':
        return t('delfines.estado.corriendo', 'Running')
      case 'parado':
        return t('delfines.estado.parado', 'Stopped')
      case 'pausado':
        return t('delfines.estado.pausado', 'Paused by its budget')
      case 'espera':
        return t('delfines.estado.espera', 'Waiting for your OK')
      case 'sin-respuesta':
        return t('delfines.estado.sinRespuesta', '{{servidor}} is not answering', {
          servidor: donde.tipo === 'servidor' ? donde.nombre : ''
        })
    }
  }
}

/** El punto del estado: lleno y latiendo si corre, hueco si no, ámbar si te espera. */
function Pulso({ estado }: { estado: EstadoDeDelfin }): React.JSX.Element {
  const espera = estado === 'espera' || estado === 'pausado'
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden="true">
      {estado === 'corriendo' ? (
        <span className="absolute inset-0 rounded-full bg-foreground/40 motion-safe:animate-ping" />
      ) : null}
      <span
        className={cn(
          'relative inline-flex size-2.5 rounded-full',
          estado === 'corriendo' && 'bg-foreground',
          espera && 'bg-amber-500',
          (estado === 'parado' || estado === 'sin-respuesta') &&
            'ring-[1.5px] ring-foreground/35 ring-inset'
        )}
      />
    </span>
  )
}

/** La barra del mes contra el tope; se llena al aparecer, de izquierda a derecha. */
function BarraDelMes({ delfin }: { delfin: Delfin }): React.JSX.Element {
  const t = useTranslate()
  const locale = useIntlLocale()
  const relleno = useRef<HTMLDivElement>(null)
  const presupuesto = presupuestoDe(delfin)
  const lleno = presupuesto.fraccion !== null && presupuesto.fraccion >= 1
  useLayoutEffect(() => {
    const nodo = relleno.current
    if (!nodo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const tween = gsap.fromTo(
      nodo,
      { scaleX: 0 },
      { scaleX: 1, duration: 0.6, delay: 0.15, ease: 'expo.out', transformOrigin: '0% 50%' }
    )
    return () => {
      tween.kill()
    }
  }, [])
  const dinero = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
  const usado =
    presupuesto.unidad === 'usd'
      ? dinero.format(presupuesto.usado)
      : t('delfines.tarjeta.corridas', '{{n}} runs', { n: String(presupuesto.usado) })
  const tope =
    presupuesto.tope === null
      ? null
      : presupuesto.unidad === 'usd'
        ? dinero.format(presupuesto.tope)
        : String(presupuesto.tope)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{t('delfines.tarjeta.mes', 'This month')}</span>
        <span className="tabular-nums text-foreground">
          {usado}
          {tope ? <span className="text-muted-foreground"> / {tope}</span> : null}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
        {presupuesto.fraccion !== null ? (
          <div
            ref={relleno}
            className={cn('h-full rounded-full', lleno ? 'bg-amber-500' : 'bg-foreground/70')}
            style={{ width: `${Math.max(2, presupuesto.fraccion * 100)}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

export function TarjetaDeDelfin({
  delfin,
  ahora,
  onHablar,
  onLlevar
}: {
  delfin: Delfin
  ahora: number
  onHablar: (caja: DOMRect) => void
  onLlevar: (caja: DOMRect) => void
}): React.JSX.Element {
  const t = useTranslate()
  const locale = useIntlLocale()
  const textoDeEstado = useEstadoTexto()
  const estado = estadoDeDelfin(delfin)
  const plantilla = plantillaDe(delfin)
  const Icono = plantilla ? ICONO_DE_PLANTILLA[plantilla] : Bot
  const enServidor = delfin.donde.tipo === 'servidor'
  return (
    <article
      data-delfin=""
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-5',
        estado === 'sin-respuesta' && 'opacity-70'
      )}
    >
      <header className="flex min-w-0 items-start gap-3">
        {/* El ícono suelto, sin cajita: en Dolphin la cajita alrededor del ícono es ruido (taste log 12/10). */}
        <Icono className="mt-0.5 size-5 shrink-0 text-foreground/70" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3
            className="truncate font-display text-base leading-tight font-semibold tracking-tight"
            title={delfin.nombre}
          >
            {delfin.nombre}
          </h3>
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Pulso estado={estado} />
            <span className="truncate">{textoDeEstado(estado, delfin.donde)}</span>
          </p>
        </div>
        {enServidor ? (
          <span
            className="inline-flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-xl bg-muted px-2.5 py-1 text-xs"
            title={delfin.donde.tipo === 'servidor' ? delfin.donde.nombre : undefined}
          >
            {estado === 'sin-respuesta' ? (
              <ServerOff className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Server className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {delfin.donde.tipo === 'servidor' ? delfin.donde.nombre : ''}
            </span>
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-0.5">
        <span className="font-display text-2xl leading-none font-semibold tabular-nums tracking-tight">
          {delfin.proxima
            ? horaRelativa(delfin.proxima.cuando, ahora, locale)
            : t('delfines.tarjeta.sinRutina', 'When you write')}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={delfin.proxima?.tarea}>
          {delfin.proxima
            ? delfin.proxima.tarea
            : t('delfines.tarjeta.sinRutinaDetalle', 'No routine: it answers when you talk to it')}
        </span>
      </div>

      <BarraDelMes delfin={delfin} />

      {delfin.pendiente ? (
        <p className="line-clamp-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {t('delfines.tarjeta.pide', 'Wants to: {{que}}', { que: delfin.pendiente })}
        </p>
      ) : delfin.ultimo ? (
        <p className="line-clamp-2 min-h-[2lh] rounded-2xl bg-muted px-3 py-2 text-xs text-foreground/80">
          {delfin.ultimo.texto}
        </p>
      ) : (
        <p className="min-h-[2lh] rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t('delfines.tarjeta.sinAvisos', 'Nothing to report yet.')}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(BOTON_TONAL, 'h-9')}
          disabled={estado === 'sin-respuesta'}
          onClick={(evento) => onHablar(evento.currentTarget.getBoundingClientRect())}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {t('delfines.tarjeta.hablar', 'Talk to it')}
        </button>
        {enServidor ? null : (
          <button
            type="button"
            className={cn(BOTON_TONAL, 'h-9 bg-transparent hover:bg-accent')}
            onClick={(evento) => onLlevar(evento.currentTarget.getBoundingClientRect())}
          >
            <Server className="size-4" aria-hidden="true" />
            {t('delfines.tarjeta.llevar', 'Run on your server')}
          </button>
        )}
      </footer>
    </article>
  )
}
