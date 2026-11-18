import { useState } from 'react'
import { Check, Copy, TriangleAlert, X } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import {
  ETAPAS_DE_LLEVAR,
  type EstadoDePaso,
  type EtapaDeLlevar,
  type MotorDeDelfin
} from '../../../../../shared/delfines-types'

/** Un comando para copiar: lo que sólo puede correr la persona (o un agente) en el servidor. */
export function Comando({ comando }: { comando: string }): React.JSX.Element {
  const t = useTranslate()
  const [copiado, setCopiado] = useState(false)
  return (
    <span className="mt-1.5 flex min-w-0 items-center gap-1 rounded-xl bg-background/60 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={comando}>
        {comando}
      </code>
      <button
        type="button"
        aria-label={t('delfines.servidor.copiar', 'Copy the command')}
        onClick={() => {
          void navigator.clipboard?.writeText(comando).then(() => setCopiado(true))
        }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-90"
      >
        {copiado ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  )
}

function useTextosDePaso(
  motor: MotorDeDelfin
): (paso: EstadoDePaso) => { titulo: string; que?: string } {
  const t = useTranslate()
  const nombreDelMotor = motor === 'codex' ? 'Codex' : 'Claude Code'
  return (paso) => {
    switch (paso.paso) {
      case 'sistema':
        return {
          titulo: t('delfines.servidor.paso.sistema', 'Linux with systemd'),
          ...(paso.estado === 'falta'
            ? {
                que: t(
                  'delfines.servidor.paso.sistemaFalta',
                  'This server runs {{que}}: a bot on its own needs Linux.',
                  { que: paso.detalle ?? '' }
                )
              }
            : {})
        }
      case 'node':
        return {
          titulo: t('delfines.servidor.paso.node', 'Node 22.12 or newer'),
          ...(paso.estado === 'falta'
            ? {
                que: t(
                  'delfines.servidor.paso.nodeFalta',
                  'Install it, or connect the server as a Dolphin server: that one brings its own.'
                )
              }
            : {})
        }
      case 'motor':
        return {
          titulo: t('delfines.servidor.paso.motor', '{{motor}}, signed in on the server', {
            motor: nombreDelMotor
          }),
          ...(paso.estado === 'falta'
            ? {
                que:
                  paso.detalle === 'sin-instalar'
                    ? t(
                        'delfines.servidor.paso.motorInstalar',
                        'It is not installed there. Install it in a terminal on the server:'
                      )
                    : t(
                        'delfines.servidor.paso.motorSesion',
                        'It is installed but not signed in. Sign in once, in a terminal on the server:'
                      )
              }
            : {})
        }
      case 'systemd':
        return {
          titulo: t('delfines.servidor.paso.systemd', 'User services (systemd)'),
          ...(paso.estado === 'falta'
            ? {
                que: t(
                  'delfines.servidor.paso.systemdFalta',
                  'They do not answer over SSH. Turn on linger and reconnect:'
                )
              }
            : {})
        }
      case 'linger':
        return {
          titulo: t('delfines.servidor.paso.linger', 'Keeps running with no session open'),
          ...(paso.estado === 'aviso'
            ? {
                que: t(
                  'delfines.servidor.paso.lingerAviso',
                  'Without linger it stops when you close SSH. Needs sudo, once:'
                )
              }
            : {})
        }
    }
  }
}

/** La lista de lo que el servidor necesita, con forma: tilde, cruz o aviso. */
export function PasosDelServidor({
  pasos,
  motor
}: {
  pasos: readonly EstadoDePaso[]
  motor: MotorDeDelfin
}): React.JSX.Element {
  const textos = useTextosDePaso(motor)
  return (
    <ul className="flex flex-col gap-1.5">
      {pasos.map((paso) => {
        const { titulo, que } = textos(paso)
        return (
          <li
            key={paso.paso}
            className={cn(
              'flex gap-3 rounded-2xl px-3 py-2.5',
              paso.estado === 'ok' ? 'bg-transparent' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                paso.estado === 'ok' && 'bg-foreground text-background',
                paso.estado === 'falta' && 'bg-destructive/15 text-destructive',
                paso.estado === 'aviso' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              )}
              aria-hidden="true"
            >
              {paso.estado === 'ok' ? <Check className="size-3" /> : null}
              {paso.estado === 'falta' ? <X className="size-3" /> : null}
              {paso.estado === 'aviso' ? <TriangleAlert className="size-3" /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">
                {titulo}
                {paso.estado === 'ok' && paso.detalle && paso.paso === 'node' ? (
                  <span className="text-muted-foreground"> · {paso.detalle}</span>
                ) : null}
              </span>
              {que ? <span className="text-xs text-muted-foreground">{que}</span> : null}
              {paso.estado !== 'ok' && paso.comando ? <Comando comando={paso.comando} /> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Las etapas de llevarlo, como una pista que se va llenando. */
export function PistaDeEtapas({ etapa }: { etapa: EtapaDeLlevar }): React.JSX.Element {
  const t = useTranslate()
  const actual = ETAPAS_DE_LLEVAR.indexOf(etapa)
  const nombres: Record<EtapaDeLlevar, string> = {
    revisar: t('delfines.servidor.etapa.revisar', 'Checking the server'),
    nucleo: t('delfines.servidor.etapa.nucleo', 'Bringing Dolphin’s core'),
    bot: t('delfines.servidor.etapa.bot', 'Copying the bot'),
    instalar: t('delfines.servidor.etapa.instalar', 'Installing it as a service'),
    verificar: t('delfines.servidor.etapa.verificar', 'Waiting for it to start'),
    apartar: t('delfines.servidor.etapa.apartar', 'Stopping the one here')
  }
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {ETAPAS_DE_LLEVAR.map((cual, indice) => (
          <span
            key={cual}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              indice < actual && 'bg-foreground',
              indice === actual && 'bg-foreground/60 motion-safe:animate-pulse',
              indice > actual && 'bg-foreground/10'
            )}
          />
        ))}
      </div>
      <p className="text-sm">{nombres[etapa]}…</p>
    </div>
  )
}
