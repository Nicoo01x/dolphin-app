import { Check, Loader2, Minus, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { dolphinFailureMessage } from '../dolphin-failure'
import type {
  DolphinPortonRevision,
  DolphinPortonRun
} from '../../../../../shared/dolphin-console-types'
import { portonFailure, portonSkippedReason, portonVerdict } from './studio-summary'
import { useDolphinPorton } from './use-dolphin-porton'

type Phase = DolphinPortonRun['fases'][number]

/** Una fase como chip: el color dice cómo le fue, nada más. Las que quedaron sin correr, tenues. */
function PhaseChip({ phase, finished }: { phase: Phase; finished: boolean }): React.JSX.Element {
  // Una pasada cortada a mitad deja su fase «corriendo»: no corre más, no gira.
  const notRun = finished && (phase.estado === 'esperando' || phase.estado === 'corriendo')
  const running = phase.estado === 'corriendo' && !notRun
  const Icon =
    phase.estado === 'paso' ? Check : phase.estado === 'fallo' ? X : running ? Loader2 : Minus
  const label = notRun
    ? translate('auto.components.dolphin.studio.phaseNotRun', "{{value0}}: didn't run", {
        value0: phase.nombre
      })
    : phase.nombre
  return (
    <li
      title={phase.detalle ?? label}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium',
        phase.estado === 'paso' && 'bg-status-success-background text-status-success',
        phase.estado === 'fallo' && 'bg-destructive/10 text-destructive',
        running && 'bg-status-warning-background text-status-warning',
        (phase.estado === 'esperando' || phase.estado === 'salteada' || notRun) &&
          'bg-foreground/[0.05] text-muted-foreground',
        notRun && 'opacity-60'
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-3', running && 'animate-spin motion-reduce:animate-none')}
      />
      {phase.nombre}
    </li>
  )
}

/**
 * El portón de la sesión: las fases del repo (las de una rama, sin construir) sobre la carpeta de
 * la sesión, cuando se las pide. Qué fase frenó y por qué, en una línea.
 */
export function StudioPorton({
  repoPath,
  isVisible,
  revision,
  autoReview
}: {
  repoPath: string | null
  isVisible: boolean
  revision?: DolphinPortonRevision
  autoReview?: {
    enabled: boolean
    agentWorking: boolean
    hasChanges: boolean
  }
}): React.JSX.Element {
  const porton = useDolphinPorton(repoPath, isVisible, revision)
  const previousWorking = useRef(autoReview?.agentWorking === true)
  useEffect(() => {
    const stopped = previousWorking.current && autoReview?.agentWorking === false
    previousWorking.current = autoReview?.agentWorking === true
    if (
      stopped &&
      autoReview?.enabled &&
      autoReview.hasChanges &&
      revision &&
      !porton.running &&
      !porton.starting
    ) {
      porton.start()
    }
  }, [autoReview, porton, revision])
  const verdict = portonVerdict(porton.run, porton.running, porton.interrupted)
  const failed = portonFailure(porton.run)
  const skippedReason = verdict === 'skipped' ? portonSkippedReason(porton.run) : null
  const reviewPhase = porton.run?.fases.find((phase) => phase.nombre === 'revisión')
  const busy = porton.running || porton.starting
  // Terminó, o se cortó: lo que no llegó a correr se ve tenue y sin girar.
  const finished = !porton.running && (porton.run?.hasta !== undefined || porton.interrupted)
  const runningPhase = porton.running
    ? porton.run?.fases.find((phase) => phase.estado === 'corriendo')
    : undefined

  const status = porton.starting
    ? translate('auto.components.dolphin.studio.portonStarting', 'Asking Dolphin…')
    : runningPhase
      ? translate('auto.components.dolphin.studio.portonRunning', 'Running {{value0}}…', {
          value0: runningPhase.nombre
        })
      : verdict === 'passed'
        ? translate('auto.components.dolphin.studio.portonPassed', 'Passed')
        : verdict === 'failed' && failed
          ? translate('auto.components.dolphin.studio.portonStopped', 'Stopped at {{value0}}', {
              value0: failed.nombre
            })
          : verdict === 'skipped'
            ? translate('auto.components.dolphin.studio.portonSkipped', 'No phase ran')
            : verdict === 'interrupted'
              ? translate(
                  'auto.components.dolphin.studio.portonInterrupted',
                  'Stopped before finishing'
                )
              : null

  return (
    <div className="space-y-2 px-3 pb-3">
      <div className="flex items-center gap-2">
        {status ? (
          <span
            role="status"
            className={cn(
              'min-w-0 truncate text-xs',
              verdict === 'passed' && 'text-status-success',
              verdict === 'failed' && 'text-destructive',
              verdict === 'skipped' && 'text-status-warning',
              verdict !== 'passed' &&
                verdict !== 'failed' &&
                verdict !== 'skipped' &&
                'text-muted-foreground'
            )}
          >
            {status}
          </span>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant={verdict === 'idle' ? 'default' : 'ghost'}
          className={cn(
            'ml-auto shrink-0 rounded-full',
            verdict !== 'idle' && 'bg-foreground/[0.07] hover:bg-foreground/[0.12]'
          )}
          disabled={!repoPath || busy}
          onClick={porton.start}
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : null}
          {verdict === 'idle'
            ? translate('auto.components.dolphin.studio.runPorton', 'Run the gate')
            : translate('auto.components.dolphin.studio.runPortonAgain', 'Run again')}
        </Button>
      </div>
      {porton.run && porton.run.fases.length > 0 ? (
        <ul
          aria-label={translate('auto.components.dolphin.studio.phases', 'Phases')}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {porton.run.fases.map((phase) => (
            <PhaseChip key={phase.nombre} phase={phase} finished={finished} />
          ))}
        </ul>
      ) : null}
      {reviewPhase?.estado === 'fallo' ? (
        <p className="mt-2 line-clamp-2 text-xs break-words text-destructive">
          {translate(
            'auto.components.dolphin.studio.reviewConcerns',
            'Another model has concerns: {{value0}}',
            {
              value0:
                reviewPhase.detalle?.replace(/^revisión:\s*/, '') ?? ''
            }
          )}
        </p>
      ) : reviewPhase?.estado === 'paso' ? (
        <p className="mt-2 text-xs text-status-success">
          {translate(
            'auto.components.dolphin.studio.reviewAccepted',
            'Another model reviewed it and accepts it'
          )}
        </p>
      ) : reviewPhase?.estado === 'salteada' && reviewPhase.detalle ? (
        <p className="mt-2 line-clamp-2 font-mono text-xs break-words text-muted-foreground">
          {reviewPhase.detalle}
        </p>
      ) : failed?.detalle ? (
        <p className="mt-2 line-clamp-2 font-mono text-xs break-words text-destructive">
          {failed.detalle}
        </p>
      ) : skippedReason ? (
        <p className="mt-2 line-clamp-2 font-mono text-xs break-words text-muted-foreground">
          {skippedReason}
        </p>
      ) : finished && porton.run?.fases.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {translate(
            'auto.components.dolphin.studio.noPhases',
            'This repo has no phases to run: add typecheck or test to its package.json.'
          )}
        </p>
      ) : !porton.run && !porton.failure ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {translate(
            'auto.components.dolphin.studio.portonHint',
            "The repo's phases (types, tests…) on this folder, like a branch."
          )}
        </p>
      ) : null}
      {porton.failure ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {dolphinFailureMessage({ ok: false, ...porton.failure })}
        </p>
      ) : null}
    </div>
  )
}
