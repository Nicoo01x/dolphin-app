import type { ColumnaDelTablero, TarjetaMovida } from '../../shared/dolphin-tablero-types'
import { askConsole, ensureConsole, failureOf, type OpenOptions } from './dolphin-console'

/**
 * Cuánto se le da a la consola para arrancar cuando es para mover una tarjeta. Más que el tope de
 * siempre (20 s): con la máquina cargada arrancó en 38 s en frío, y el primer arrastre del día
 * fallaba aunque esperar un poco más lo resolvía. La tarjeta queda «guardando» mientras tanto.
 */
export const ARRANQUE_PARA_MOVER_MS = 60_000

/** La consola que se usa para hablarle al núcleo; se inyecta en los tests. */
export type ConsolaParaMover = {
  abrir: (repo: string) => Promise<{ url: string; token: string }>
  pedir: (url: string, init: RequestInit) => Promise<Response>
}

export function consolaDeVerdad(options: OpenOptions): ConsolaParaMover {
  const conMargen: OpenOptions = {
    ...options,
    timeoutMs: options.timeoutMs ?? ARRANQUE_PARA_MOVER_MS
  }
  return {
    abrir: (repo) => ensureConsole(repo, conMargen),
    pedir: (url, init) => askConsole(url, init)
  }
}

/**
 * Mover una tarjeta del tablero es cosa del núcleo (`moverTarjeta`: la columna, la fecha y el
 * historial, escritos en fila para que dos cambios no se pisen). Se le pide a la consola del repo,
 * igual que el modo live y el portón a mano, en vez de escribir el archivo desde acá: el formato de
 * la tarjeta es del núcleo y una segunda copia de esa escritura terminaría distinta.
 */
export async function moverTarjetaDelTablero(
  repo: string,
  id: string,
  columna: ColumnaDelTablero,
  consola: ConsolaParaMover
): Promise<TarjetaMovida> {
  try {
    const { url, token } = await consola.abrir(repo)
    const respuesta = await consola.pedir(`${url}/api/tablero/${encodeURIComponent(id)}/mover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dolphin-token': token },
      body: JSON.stringify({ columna })
    })
    if (respuesta.ok) {
      return { ok: true }
    }
    const cuerpo = (await respuesta.json().catch(() => null)) as { porQue?: unknown } | null
    return {
      ok: false,
      code: 'rejected',
      detail: typeof cuerpo?.porQue === 'string' ? cuerpo.porQue : String(respuesta.status)
    }
  } catch (error) {
    // El código va aparte del detalle: un `timeout` con detalle «20» se leía «No se pudo mover: 20».
    return failureOf(error)
  }
}
