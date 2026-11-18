import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { Plus, RotateCw } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { Delfin, PlantillaDeDelfin } from '../../../../../shared/delfines-types'
import { estadoDeDelfin, ordenarManada } from './delfines-formato'
import type { EstadoDeLaManada } from './use-manada'
import { TarjetaDeDelfin } from './TarjetaDeDelfin'
import { VacioDeDelfines } from './VacioDeDelfines'
import { BOTON_PRINCIPAL, BOTON_TONAL } from './VentanaDeDelfin'

export type AccionesDeLaVista = {
  onCrear: (caja: DOMRect, plantilla?: PlantillaDeDelfin) => void
  onHablar: (delfin: Delfin, caja: DOMRect) => void
  onLlevar: (delfin: Delfin, caja: DOMRect) => void
  onReintentar: () => void
}

/** Los delfines entran de a uno, con un desenfoque que se aclara: es lo único animado al llegar. */
function useEntrada(clave: string): React.RefObject<HTMLDivElement | null> {
  const lista = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const nodo = lista.current
    if (!nodo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const tween = gsap.from(nodo.querySelectorAll('[data-delfin]'), {
      opacity: 0,
      y: 12,
      filter: 'blur(8px)',
      duration: 0.5,
      ease: 'expo.out',
      stagger: 0.05,
      clearProps: 'filter'
    })
    return () => {
      tween.kill()
    }
  }, [clave])
  return lista
}

/** Una tira de puntos, uno por bot: lleno el que corre. Se lee antes que el número. */
function TiraDeLaManada({ delfines }: { delfines: readonly Delfin[] }): React.JSX.Element {
  const t = useTranslate()
  const corriendo = delfines.filter((d) => estadoDeDelfin(d) === 'corriendo').length
  return (
    <p className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex gap-1" aria-hidden="true">
        {delfines.slice(0, 24).map((d) => (
          <i
            key={d.id}
            className={cn(
              'size-2 rounded-full',
              estadoDeDelfin(d) === 'corriendo' ? 'bg-foreground' : 'bg-foreground/20'
            )}
          />
        ))}
      </span>
      {t('delfines.vista.corriendo', '{{corriendo}} of {{total}} running', {
        corriendo: String(corriendo),
        total: String(delfines.length)
      })}
    </p>
  )
}

function Esqueleto(): React.JSX.Element {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-72 flex-col gap-4 rounded-3xl bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-2xl bg-muted motion-safe:animate-pulse" />
            <span className="h-4 w-32 rounded-full bg-muted motion-safe:animate-pulse" />
          </div>
          <span className="h-7 w-24 rounded-full bg-muted motion-safe:animate-pulse" />
          <span className="h-1.5 w-full rounded-full bg-muted" />
          <span className="h-12 w-full rounded-2xl bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function FalloDeLectura({
  estado,
  onReintentar
}: {
  estado: Extract<EstadoDeLaManada, { tipo: 'error' }>
  onReintentar: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const titulo =
    estado.code === 'sin-nucleo'
      ? t('delfines.error.sinNucleo', 'Dolphin’s core is not where the app looks for it')
      : t('delfines.error.nucleo', 'Could not read your dolphins')
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
      role="alert"
    >
      <p className="font-display text-lg font-semibold tracking-tight">{titulo}</p>
      {estado.detail ? (
        <p className="max-w-full rounded-2xl bg-muted px-3 py-2 text-xs break-words text-muted-foreground">
          {estado.detail}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {estado.code === 'sin-nucleo'
          ? t(
              'delfines.error.sinNucleoQue',
              'Reinstall the app, or point DOLPHIN_APP_DIR at a copy of the core.'
            )
          : t(
              'delfines.error.nucleoQue',
              'Your bots are fine: this is only the reading. Try again.'
            )}
      </p>
      <button type="button" className={BOTON_TONAL} onClick={onReintentar}>
        <RotateCw className="size-4" aria-hidden="true" />
        {t('delfines.error.reintentar', 'Try again')}
      </button>
    </div>
  )
}

export function DelfinesVista({
  estado,
  ahora,
  acciones
}: {
  estado: EstadoDeLaManada
  ahora: number
  acciones: AccionesDeLaVista
}): React.JSX.Element {
  const t = useTranslate()
  const delfines = estado.tipo === 'listo' ? ordenarManada(estado.manada.bots) : []
  const lista = useEntrada(delfines.map((d) => d.id).join(','))
  return (
    <main className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto bg-background px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="font-display text-[28px] leading-none font-semibold tracking-tight">
              {t('delfines.vista.titulo', 'Dolphins')}
            </h1>
            {delfines.length > 0 ? <TiraDeLaManada delfines={delfines} /> : null}
          </div>
          {delfines.length > 0 ? (
            <button
              type="button"
              className={BOTON_PRINCIPAL}
              onClick={(evento) => acciones.onCrear(evento.currentTarget.getBoundingClientRect())}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('delfines.vista.nuevo', 'New dolphin')}
            </button>
          ) : null}
        </header>
        {estado.tipo === 'cargando' ? <Esqueleto /> : null}
        {estado.tipo === 'error' ? (
          <FalloDeLectura estado={estado} onReintentar={acciones.onReintentar} />
        ) : null}
        {estado.tipo === 'listo' && delfines.length === 0 ? (
          <VacioDeDelfines onCrear={(plantilla, caja) => acciones.onCrear(caja, plantilla)} />
        ) : null}
        {delfines.length > 0 ? (
          <div ref={lista} className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
            {delfines.map((delfin) => (
              <TarjetaDeDelfin
                key={delfin.id}
                delfin={delfin}
                ahora={ahora}
                onHablar={(caja) => acciones.onHablar(delfin, caja)}
                onLlevar={(caja) => acciones.onLlevar(delfin, caja)}
              />
            ))}
          </div>
        ) : null}
        {estado.tipo === 'listo' && estado.manada.rotos.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('delfines.vista.rotos', 'Could not read: {{ids}}', {
              ids: estado.manada.rotos.map((r) => r.id).join(', ')
            })}
          </p>
        ) : null}
      </div>
    </main>
  )
}
