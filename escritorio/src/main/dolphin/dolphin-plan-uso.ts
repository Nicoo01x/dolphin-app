import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  ProviderRateLimits,
  RateLimitState,
  RateLimitWindow
} from '../../shared/rate-limit-types'

type VentanaDeUso = { nombre: '5h' | 'semana'; usadoPct: number; reiniciaEn: string | null }
type UsoDeAgente = { agente: 'claude' | 'codex' | 'gemini'; ventanas: VentanaDeUso[] }
export type PlanUso = { escritoEn: string; agentes: UsoDeAgente[] }

function ventana(
  nombre: VentanaDeUso['nombre'],
  v: RateLimitWindow | null | undefined
): VentanaDeUso[] {
  if (!v || !Number.isFinite(v.usedPercent)) {
    return []
  }
  return [
    {
      nombre,
      usadoPct: Math.round(v.usedPercent),
      reiniciaEn: v.resetsAt ? new Date(v.resetsAt).toISOString() : null
    }
  ]
}

function usoDe(agente: UsoDeAgente['agente'], limits: ProviderRateLimits | null): UsoDeAgente[] {
  if (!limits) {
    return []
  }
  const ventanas = [
    ...ventana('5h', limits.session),
    ...ventana('semana', limits.weekly),
    ...ventana('semana', limits.fableWeekly)
  ]
  return ventanas.length > 0 ? [{ agente, ventanas }] : []
}

/**
 * Lo que el autopiloto del núcleo lee para no quemar la noche: cuánto queda de cada ventana del plan
 * de cada agente (la app ya lo mide para la barra del chat). Sin datos, sin archivo.
 */
export function planUsoDe(state: RateLimitState, ahora = new Date()): PlanUso | null {
  const agentes = [
    ...usoDe('claude', state.claude),
    ...usoDe('codex', state.codex),
    ...usoDe('gemini', state.gemini)
  ]
  return agentes.length > 0 ? { escritoEn: ahora.toISOString(), agentes } : null
}

const RUTA = (): string => join(homedir(), '.dolphin', 'plan-uso.json')
const CADA_MS = 60_000

/**
 * Escribe `~/.dolphin/plan-uso.json` cada vez que cambia el cupo, como mucho una vez por minuto y
 * por temporal + rename (el núcleo nunca lee un archivo a medias). No corre en tests ni en E2E.
 */
export function publicarPlanUso(
  onStateChange: (listener: (state: RateLimitState) => void) => () => void,
  env: NodeJS.ProcessEnv = process.env
): () => void {
  if (env.VITEST || env.DOLPHIN_E2E_USER_DATA_DIR || env.DOLPHIN_E2E_HOME_DIR) {
    return () => undefined
  }
  let ultima = 0
  let pendiente: RateLimitState | null = null
  let timer: NodeJS.Timeout | null = null
  const escribir = async (state: RateLimitState): Promise<void> => {
    const uso = planUsoDe(state)
    if (!uso) {
      return
    }
    const ruta = RUTA()
    try {
      await mkdir(join(homedir(), '.dolphin'), { recursive: true })
      await writeFile(`${ruta}.tmp`, JSON.stringify(uso, null, 2))
      await rename(`${ruta}.tmp`, ruta)
    } catch (error) {
      console.warn('[dolphin] no se pudo guardar el uso del plan', error)
    }
  }
  const quitar = onStateChange((state) => {
    pendiente = state
    const falta = ultima + CADA_MS - Date.now()
    if (falta <= 0) {
      ultima = Date.now()
      void escribir(state)
      return
    }
    timer ??= setTimeout(() => {
      timer = null
      ultima = Date.now()
      if (pendiente) {
        void escribir(pendiente)
      }
    }, falta)
    timer.unref?.()
  })
  return () => {
    quitar()
    if (timer) {
      clearTimeout(timer)
    }
  }
}
