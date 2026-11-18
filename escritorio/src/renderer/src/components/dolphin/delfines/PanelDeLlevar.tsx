import { useId } from 'react'
import { Bot as IconoAgente, CircleCheck, Loader2, Plug, RotateCw, Server } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type {
  EtapaDeLlevar,
  MotorDeDelfin,
  RevisionDelServidor,
  ServidorParaDelfines
} from '../../../../../shared/delfines-types'
import { Comando, PasosDelServidor, PistaDeEtapas } from './PasosDelServidor'
import { BOTON_PRINCIPAL, BOTON_TONAL, CAMPO } from './VentanaDeDelfin'

/**
 * Lo que se ve en «Correr en tu servidor», sin llamadas: el contenedor (`LlevarAlServidor`) decide
 * el estado y esto lo dibuja. Así las fixtures muestran cada caso sin un servidor de verdad.
 */
export type EstadoDeLlevar =
  | { tipo: 'sin-servidor' }
  | { tipo: 'revisando' }
  | { tipo: 'revision'; revision: RevisionDelServidor; carpeta: string }
  | { tipo: 'llevando'; etapa: EtapaDeLlevar }
  | { tipo: 'listo'; linger: boolean; comandoLinger?: string }
  | { tipo: 'fallo'; etapa: EtapaDeLlevar; detail: string }

export type AccionesDeLlevar = {
  onConectar: () => void
  onAgente: () => void
  onElegirServidor: (servidor: ServidorParaDelfines) => void
  onCarpeta: (carpeta: string) => void
  onLlevar: () => void
  onRevisar: () => void
  onCerrar: () => void
}

function SinServidor({ acciones }: { acciones: AccionesDeLlevar }): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-muted">
        <Server className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-base font-semibold tracking-tight">
          {t('delfines.servidor.sinServidor', 'No server connected')}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t(
            'delfines.servidor.sinServidorQue',
            'Connect a VPS by SSH and the bot keeps working there 24/7, even with this computer off.'
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={BOTON_PRINCIPAL} onClick={acciones.onConectar}>
          <Plug className="size-4" aria-hidden="true" />
          {t('delfines.servidor.conectar', 'Connect a server')}
        </button>
        <button type="button" className={BOTON_TONAL} onClick={acciones.onAgente}>
          <IconoAgente className="size-4" aria-hidden="true" />
          {t('delfines.servidor.conAgente', 'Let an agent connect it')}
        </button>
      </div>
    </div>
  )
}

function Revision({
  estado,
  motor,
  servidores,
  acciones
}: {
  estado: Extract<EstadoDeLlevar, { tipo: 'revision' }>
  motor: MotorDeDelfin
  servidores: readonly ServidorParaDelfines[]
  acciones: AccionesDeLlevar
}): React.JSX.Element {
  const t = useTranslate()
  const idCarpeta = useId()
  const { revision } = estado
  return (
    <div className="flex flex-col gap-4">
      {servidores.length > 1 ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label={t('delfines.servidor.cual', 'Which server')}
        >
          {servidores.map((servidor) => (
            <button
              key={servidor.hostId}
              type="button"
              role="radio"
              aria-checked={servidor.hostId === revision.hostId}
              onClick={() => acciones.onElegirServidor(servidor)}
              className={cn(
                'max-w-48 truncate rounded-xl px-3 py-1.5 text-xs transition-[transform,background-color] duration-150 active:scale-95',
                servidor.hostId === revision.hostId
                  ? 'bg-foreground text-background'
                  : 'bg-muted hover:bg-accent'
              )}
            >
              {servidor.nombre}
            </button>
          ))}
        </div>
      ) : null}
      <PasosDelServidor pasos={revision.pasos} motor={motor} />
      {revision.listo ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCarpeta} className="text-[13px] font-medium">
            {t('delfines.servidor.carpeta', 'Where it works on {{servidor}}', {
              servidor: revision.nombre
            })}
          </label>
          <input
            id={idCarpeta}
            className={CAMPO}
            value={estado.carpeta}
            spellCheck={false}
            autoComplete="off"
            onChange={(evento) => acciones.onCarpeta(evento.target.value)}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Mientras falta algo no hay botón de llevar apagado: lo que se puede hacer es arreglarlo. */}
        {revision.listo ? (
          <button type="button" className={BOTON_PRINCIPAL} onClick={acciones.onLlevar}>
            <Server className="size-4" aria-hidden="true" />
            <span className="max-w-56 truncate">
              {t('delfines.servidor.llevar', 'Run it on {{servidor}}', {
                servidor: revision.nombre
              })}
            </span>
          </button>
        ) : (
          <>
            <button type="button" className={BOTON_TONAL} onClick={acciones.onRevisar}>
              <RotateCw className="size-4" aria-hidden="true" />
              {t('delfines.servidor.revisar', 'Check again')}
            </button>
            <button type="button" className={BOTON_PRINCIPAL} onClick={acciones.onAgente}>
              <IconoAgente className="size-4" aria-hidden="true" />
              {t('delfines.servidor.agente', 'Fix it with an agent')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function PanelDeLlevar({
  estado,
  motor,
  servidores,
  acciones
}: {
  estado: EstadoDeLlevar
  motor: MotorDeDelfin
  servidores: readonly ServidorParaDelfines[]
  acciones: AccionesDeLlevar
}): React.JSX.Element {
  const t = useTranslate()
  switch (estado.tipo) {
    case 'sin-servidor':
      return <SinServidor acciones={acciones} />
    case 'revisando':
      return (
        <p
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('delfines.servidor.revisando', 'Checking what the server has…')}
        </p>
      )
    case 'revision':
      return <Revision estado={estado} motor={motor} servidores={servidores} acciones={acciones} />
    case 'llevando':
      return <PistaDeEtapas etapa={estado.etapa} />
    case 'listo':
      return (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <CircleCheck className="size-5" aria-hidden="true" />
            {t('delfines.servidor.listo', 'It is running on your server')}
          </p>
          <p className="text-sm text-muted-foreground">
            {estado.linger
              ? t(
                  'delfines.servidor.listoQue',
                  'It keeps working with this computer off. The one here stopped and was kept aside.'
                )
              : t(
                  'delfines.servidor.listoSinLinger',
                  'It is running, but it stops when the SSH session closes. Turn on linger once, with sudo:'
                )}
          </p>
          {!estado.linger && estado.comandoLinger ? (
            <Comando comando={estado.comandoLinger} />
          ) : null}
          <div className="flex justify-end">
            <button type="button" className={BOTON_PRINCIPAL} onClick={acciones.onCerrar}>
              {t('delfines.servidor.cerrar', 'Done')}
            </button>
          </div>
        </div>
      )
    case 'fallo':
      return (
        <div className="flex flex-col gap-3" role="alert">
          <PistaDeEtapas etapa={estado.etapa} />
          <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs break-words text-destructive">
            {estado.etapa === 'apartar'
              ? t(
                  'delfines.servidor.falloApartar',
                  'It is running on the server, but the one here could not be stopped: {{detalle}}. Stop it with «dolphin bots apartar».',
                  { detalle: estado.detail }
                )
              : estado.detail}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={BOTON_TONAL} onClick={acciones.onRevisar}>
              <RotateCw className="size-4" aria-hidden="true" />
              {t('delfines.servidor.reintentar', 'Try again')}
            </button>
            <button type="button" className={BOTON_PRINCIPAL} onClick={acciones.onAgente}>
              <IconoAgente className="size-4" aria-hidden="true" />
              {t('delfines.servidor.agente', 'Fix it with an agent')}
            </button>
          </div>
        </div>
      )
  }
}
