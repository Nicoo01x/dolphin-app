import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { sendNotesToActiveAgentSession } from '@/lib/agent-session/messaging/terminal/active-agent-note-send'
import { translate } from '@/i18n/i18n'
import type { DolphinBugFailureCode } from '../../../../../shared/dolphin-bug-types'

export function avisoFinalDeBug(
  codigo: number,
  lineaFinal: string
): { tipo: 'ok' | 'error'; texto: string } {
  const linea =
    lineaFinal ||
    translate('auto.components.dolphin.xray.noFinalLine', 'The command left no final line.')
  if (codigo === 0) {
    return {
      tipo: 'ok',
      texto: translate('auto.components.dolphin.xray.fixed', 'Fixed: {{value0}}', {
        value0: linea
      })
    }
  }
  return {
    tipo: 'error',
    texto: translate('auto.components.dolphin.xray.notFixed', "It isn't fixed: {{value0}}", {
      value0: linea
    })
  }
}

export function textoDeFalloBug(code: DolphinBugFailureCode, detail?: string): string {
  if (code === 'incomplete') {
    return translate('auto.components.dolphin.xray.incomplete', 'The report was incomplete.')
  }
  if (code === 'already-running') {
    return translate(
      'auto.components.dolphin.xray.alreadyRunning',
      'A report is already in progress.'
    )
  }
  if (code === 'dolphin-missing') {
    return translate(
      'auto.components.dolphin.xray.dolphinMissing',
      'Dolphin is not in {{value0}}.',
      {
        value0: detail ?? ''
      }
    )
  }
  return translate('auto.components.dolphin.xray.failed', "Couldn't run the report: {{value0}}", {
    value0: detail ?? ''
  })
}

/**
 * El lado de la ventana principal de X-ray: lo que se señaló en cualquier app le llega al agente
 * que está activo acá, por el mismo camino que las notas del navegador. Si no llega (no hay
 * agente, o la terminal no lo tomó), main lo copia al portapapeles para no perderlo.
 */
export function useXrayBridge(activo = true): void {
  useEffect(() => {
    if (!activo) {
      return undefined
    }
    const dolphin = window.api?.dolphin
    const dejarDeEscucharEnviar = dolphin?.onXrayEnviar?.(({ id, prompt }) => {
      const worktreeId = useAppStore.getState().activeWorktreeId
      const confirmar = (ok: boolean): void => void window.api.dolphin.confirmarXray?.({ id, ok })
      if (!worktreeId) {
        confirmar(false)
        return
      }
      void sendNotesToActiveAgentSession({ worktreeId, prompt })
        .then((resultado) => confirmar(resultado.status === 'sent'))
        .catch(() => confirmar(false))
    })
    const dejarDeEscucharBug = dolphin?.onXrayBug?.(({ id, que, elemento }) => {
      const state = useAppStore.getState()
      const worktreeId = state.activeWorktreeId
      const worktree = worktreeId
        ? state.getKnownWorktreeById(worktreeId, state.activeWorkspaceExecutionHostId ?? undefined)
        : undefined
      if (!worktree?.path) {
        toast.error(
          translate(
            'auto.components.dolphin.xray.noWorktree',
            'There is no active worktree to investigate the bug.'
          )
        )
        return
      }
      const empezando = translate(
        'auto.components.dolphin.xray.starting',
        'Investigating the bug in {{value0}}. Starting an agent uses your quota.',
        { value0: worktree.displayName }
      )
      toast.loading(empezando, { id })
      void dolphin
        .reportarBug({ id, repoPath: worktree.path, que, elemento })
        .then((resultado) => {
          if (!resultado.ok && resultado.code) {
            toast.error(textoDeFalloBug(resultado.code, resultado.detail), { id })
          }
        })
        .catch((error: unknown) =>
          toast.error(
            translate(
              'auto.components.dolphin.xray.failed',
              "Couldn't run the report: {{value0}}",
              {
                value0: error instanceof Error ? error.message : String(error)
              }
            ),
            { id }
          )
        )
    })
    const dejarDeEscucharAvance = dolphin?.onXrayBugAvance?.(({ id, linea }) => {
      toast.loading(linea, { id })
    })
    const dejarDeEscucharTerminado = dolphin?.onXrayBugTerminado?.(
      ({ id, codigo, lineaFinal, fallo }) => {
        const aviso = fallo
          ? { tipo: 'error' as const, texto: textoDeFalloBug(fallo.code, fallo.detail) }
          : avisoFinalDeBug(codigo, lineaFinal)
        if (aviso.tipo === 'ok') {
          toast.success(aviso.texto, { id, duration: 10_000 })
        } else {
          toast.error(aviso.texto, { id, duration: 10_000 })
        }
      }
    )
    return () => {
      dejarDeEscucharEnviar?.()
      dejarDeEscucharBug?.()
      dejarDeEscucharAvance?.()
      dejarDeEscucharTerminado?.()
    }
  }, [activo])
}
