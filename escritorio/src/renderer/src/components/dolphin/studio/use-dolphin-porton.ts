import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DolphinPortonRevision,
  DolphinFailureCode,
  DolphinPortonResult,
  DolphinPortonRun
} from '../../../../../shared/dolphin-console-types'

export type DolphinPortonState = {
  running: boolean
  /** Arrancando: el pedido salió y Dolphin todavía no contestó (puede estar levantando su consola). */
  starting: boolean
  run: DolphinPortonRun | null
  /** La pasada dejó de contestar a mitad (se cerró la consola): lo que se ve es hasta donde llegó. */
  interrupted: boolean
  failure: { code: DolphinFailureCode; detail?: string } | null
}

const IDLE: DolphinPortonState = {
  running: false,
  starting: false,
  run: null,
  interrupted: false,
  failure: null
}
/** Cuánto se espera entre una pregunta y la siguiente mientras corre. */
const POLL_MS = 1_000

/** Lo que cambia una respuesta de la consola, sobre lo que ya se sabía. */
export function nextPortonState(
  current: DolphinPortonState,
  result: DolphinPortonResult
): DolphinPortonState {
  if (!result.ok) {
    // Why conservar la pasada: es lo único que dice hasta dónde llegó; queda marcada como cortada.
    return {
      ...current,
      running: false,
      starting: false,
      interrupted: current.running || current.starting,
      failure: { code: result.code, ...(result.detail ? { detail: result.detail } : {}) }
    }
  }
  // Una consola que contesta «nada» mientras esperábamos una pasada es otra consola: la de antes se cerró.
  if (!result.pasada && current.run && current.running) {
    return { ...current, running: false, starting: false, interrupted: true }
  }
  return {
    running: result.corriendo,
    starting: false,
    run: result.pasada,
    interrupted: false,
    failure: null
  }
}

/**
 * El portón a mano de una carpeta, desde el panel de la sesión: arrancar una pasada y preguntar cómo va
 * mientras corre. No pregunta nada al montarse: preguntar levanta la consola de Dolphin de esa
 * carpeta, y eso es un proceso que solo vale la pena cuando alguien pidió el portón.
 */
export function useDolphinPorton(
  repoPath: string | null,
  enabled: boolean,
  revision?: DolphinPortonRevision
): DolphinPortonState & { start: () => void } {
  const [state, setState] = useState<DolphinPortonState>(IDLE)
  const stateRef = useRef(state)
  stateRef.current = state
  const latestPath = useRef(repoPath)
  latestPath.current = repoPath

  // Otra carpeta empieza de cero: la pasada de la anterior no es de esta.
  useEffect(() => {
    setState(IDLE)
  }, [repoPath])

  const apply = useCallback((path: string, result: DolphinPortonResult) => {
    if (latestPath.current === path) {
      setState((current) => nextPortonState(current, result))
    }
  }, [])

  const start = useCallback(() => {
    if (!repoPath || stateRef.current.running || stateRef.current.starting) {
      return
    }
    const path = repoPath
    setState((current) => ({ ...current, starting: true, interrupted: false, failure: null }))
    void window.api.dolphin.porton(path, revision).then(
      (result) => apply(path, result),
      (error: unknown) =>
        apply(path, {
          ok: false,
          code: 'unreachable',
          detail: error instanceof Error ? error.message : String(error)
        })
    )
  }, [apply, repoPath, revision])

  useEffect(() => {
    if (!state.running || !repoPath || !enabled) {
      return
    }
    const path = repoPath
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    // Why encadenado y no setInterval: la próxima pregunta sale cuando volvió la anterior, así
    // dos respuestas no llegan cruzadas.
    const ask = (): void => {
      void window.api.dolphin
        .portonState(path)
        .catch((error: unknown): DolphinPortonResult => ({
          ok: false,
          code: 'unreachable',
          detail: error instanceof Error ? error.message : String(error)
        }))
        .then((result) => {
          if (!alive) {
            return
          }
          apply(path, result)
          timer = setTimeout(ask, POLL_MS)
        })
    }
    timer = setTimeout(ask, POLL_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [apply, enabled, repoPath, state.running])

  return { ...state, start }
}
