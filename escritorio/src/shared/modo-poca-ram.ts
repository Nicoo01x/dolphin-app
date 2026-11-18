/**
 * El modo poca RAM: cuando a la computadora le queda poca memoria, Dolphin avisa antes de que algo
 * se caiga y ofrece correr lo más pesado en un servidor de la persona.
 *
 * Este archivo es lo que comparten main y la ventana: el ajuste, cómo se lee, y la forma del aviso
 * que viaja por IPC. La regla de cuándo avisar vive en `main/memoria-baja/`.
 */

/**
 * - `automatico`: avisa solo cuando lo libre baja del umbral. Es el default.
 * - `siempre`: el modo queda prendido aunque sobre memoria; avisa una vez al prenderlo.
 * - `apagado`: no mira la memoria para nada (ni la muestrea).
 */
export type ModoPocaRam = 'automatico' | 'siempre' | 'apagado'

export const MODO_POCA_RAM_POR_DEFECTO: ModoPocaRam = 'automatico'

/** Los umbrales que se ofrecen, en GB libres. Chicos a propósito: avisar de más se apaga. */
export const UMBRALES_POCA_RAM_GB: readonly number[] = [1, 1.5, 2, 3, 4]

export const UMBRAL_POCA_RAM_POR_DEFECTO_GB = 1.5

const GB = 1024 ** 3

export type ModoPocaRamSettings = {
  /** Ausente vale `automatico`. */
  modoPocaRam?: ModoPocaRam
  /** GB libres debajo de los cuales salta el aviso, en automático. Ausente vale 1,5. */
  umbralPocaRamGb?: number
}

/** Lo guardado no es de fiar: cualquier valor raro vuelve al default. */
export function resolverModoPocaRam(valor: unknown): ModoPocaRam {
  return valor === 'automatico' || valor === 'siempre' || valor === 'apagado'
    ? valor
    : MODO_POCA_RAM_POR_DEFECTO
}

export function resolverUmbralPocaRamGb(valor: unknown): number {
  return typeof valor === 'number' && UMBRALES_POCA_RAM_GB.includes(valor)
    ? valor
    : UMBRAL_POCA_RAM_POR_DEFECTO_GB
}

export function umbralPocaRamBytes(settings: ModoPocaRamSettings | null | undefined): number {
  return resolverUmbralPocaRamGb(settings?.umbralPocaRamGb) * GB
}

/** Lo que más memoria usa ahora, si se puede nombrar; si no, Dolphin entero. */
export type LoQueMasPesa =
  | {
      readonly tipo: 'espacio'
      readonly worktreeId: string
      readonly nombre: string
      readonly repoId: string
      readonly repoNombre: string
      readonly bytes: number
    }
  | { readonly tipo: 'dolphin'; readonly bytes: number }

/** Lo que main le manda a la ventana cuando toca avisar. */
export type AvisoDeMemoriaBaja = {
  /** Lo libre de verdad: en Windows y Linux, lo disponible; en macOS, sin presión. */
  readonly disponible: number
  readonly total: number
  /** Todo lo que Dolphin usa: la app más sus terminales y agentes. */
  readonly dolphin: number
  readonly masPesado: LoQueMasPesa
  /** `umbral` si saltó solo; `siempre` si el modo está prendido a mano. */
  readonly motivo: 'umbral' | 'siempre'
}

/** La última muestra, para que Ajustes muestre cuánto hay libre ahora. */
export type EstadoDeMemoriaBaja = {
  readonly disponible: number | null
  readonly total: number | null
  /** Si el modo está activo: prendido a mano, o en automático con poca memoria. */
  readonly activo: boolean
}

/** Cuánto se calla «Después»: si en una hora sigue faltando, vuelve. */
export const SILENCIO_DESPUES_MS = 60 * 60_000
