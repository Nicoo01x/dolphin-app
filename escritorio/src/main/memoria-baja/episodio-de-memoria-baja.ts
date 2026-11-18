import type { ModoPocaRam } from '../../shared/modo-poca-ram'

/**
 * Cuándo avisar que queda poca RAM. Es sólo la regla, sin relojes ni procesos: recibe una muestra
 * y devuelve el estado nuevo y si hay que avisar.
 *
 * Tres cosas la hacen no molestar:
 * - Hacen falta dos muestras seguidas bajo el umbral para entrar: un pico de un build que dura un
 *   segundo no es una computadora sin memoria.
 * - Para salir no alcanza con volver al umbral: hay que pasarlo por un margen (histéresis). Sin él,
 *   una máquina que oscila alrededor del número prendía y apagaba el aviso en loop.
 * - Se avisa una vez por episodio. «Después» lo calla una hora; si al volver sigue faltando, vuelve.
 */

/** Muestras seguidas bajo el umbral antes de dar el episodio por empezado. */
export const MUESTRAS_PARA_ENTRAR = 2

/** El margen para salir: un cuarto del umbral, y nunca menos de medio GB. */
const MARGEN_MINIMO_DE_SALIDA = 512 * 1024 ** 2

export type EpisodioDeMemoriaBaja = {
  readonly enEpisodio: boolean
  readonly muestrasBajas: number
  /** Ya se avisó en este episodio (y la persona no pidió que vuelva). */
  readonly avisado: boolean
  /** Hasta cuándo no se avisa, por un «Después». */
  readonly silenciadoHasta: number
}

export const EPISODIO_INICIAL: EpisodioDeMemoriaBaja = {
  enEpisodio: false,
  muestrasBajas: 0,
  avisado: false,
  silenciadoHasta: 0
}

export type MuestraDeMemoria = {
  readonly disponible: number
  readonly umbral: number
  readonly modo: ModoPocaRam
  readonly ahora: number
}

export type Evaluacion = {
  readonly estado: EpisodioDeMemoriaBaja
  readonly avisar: boolean
}

export function umbralDeSalida(umbral: number): number {
  return umbral + Math.max(MARGEN_MINIMO_DE_SALIDA, umbral / 4)
}

function siguienteEpisodio(
  estado: EpisodioDeMemoriaBaja,
  { disponible, umbral }: MuestraDeMemoria
): EpisodioDeMemoriaBaja {
  if (disponible < umbral) {
    const muestrasBajas = estado.muestrasBajas + 1
    return {
      ...estado,
      muestrasBajas,
      enEpisodio: estado.enEpisodio || muestrasBajas >= MUESTRAS_PARA_ENTRAR
    }
  }
  if (estado.enEpisodio && disponible < umbralDeSalida(umbral)) {
    // Entre el umbral y la salida: el episodio sigue, aunque esta muestra no fue baja.
    return { ...estado, muestrasBajas: 0 }
  }
  // Fuera del episodio, el próximo vuelve a avisar.
  return { ...estado, muestrasBajas: 0, enEpisodio: false, avisado: false }
}

export function evaluarMuestra(
  estado: EpisodioDeMemoriaBaja,
  muestra: MuestraDeMemoria
): Evaluacion {
  if (muestra.modo === 'apagado') {
    return {
      estado: { ...EPISODIO_INICIAL, silenciadoHasta: estado.silenciadoHasta },
      avisar: false
    }
  }
  const siguiente: EpisodioDeMemoriaBaja =
    muestra.modo === 'siempre'
      ? { ...estado, enEpisodio: true }
      : siguienteEpisodio(estado, muestra)
  const avisar =
    siguiente.enEpisodio && !siguiente.avisado && muestra.ahora >= siguiente.silenciadoHasta
  return { estado: avisar ? { ...siguiente, avisado: true } : siguiente, avisar }
}

/** «Después»: no avisa por un rato y, si al terminar sigue faltando, vuelve a avisar. */
export function silenciar(
  estado: EpisodioDeMemoriaBaja,
  ahora: number,
  ms: number
): EpisodioDeMemoriaBaja {
  return { ...estado, avisado: false, silenciadoHasta: ahora + ms }
}

/** Si el modo está activo ahora: prendido a mano, o en automático con poca memoria. */
export function modoActivo(estado: EpisodioDeMemoriaBaja, modo: ModoPocaRam): boolean {
  return modo === 'siempre' || (modo === 'automatico' && estado.enEpisodio)
}
