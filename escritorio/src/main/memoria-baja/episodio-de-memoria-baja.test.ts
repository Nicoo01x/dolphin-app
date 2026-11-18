import { describe, expect, it } from 'vitest'
import {
  EPISODIO_INICIAL,
  evaluarMuestra,
  modoActivo,
  silenciar,
  umbralDeSalida,
  type EpisodioDeMemoriaBaja,
  type MuestraDeMemoria
} from './episodio-de-memoria-baja'

const GB = 1024 ** 3
const UMBRAL = 1.5 * GB

function correr(
  disponibles: readonly number[],
  { modo = 'automatico', desde = EPISODIO_INICIAL, ahora = 0 } = {} as {
    modo?: MuestraDeMemoria['modo']
    desde?: EpisodioDeMemoriaBaja
    ahora?: number
  }
): { avisos: boolean[]; estado: EpisodioDeMemoriaBaja } {
  let estado = desde
  const avisos: boolean[] = []
  disponibles.forEach((disponible, vuelta) => {
    const resultado = evaluarMuestra(estado, {
      disponible,
      umbral: UMBRAL,
      modo,
      ahora: ahora + vuelta * 5_000
    })
    estado = resultado.estado
    avisos.push(resultado.avisar)
  })
  return { avisos, estado }
}

describe('evaluarMuestra', () => {
  it('no avisa por una sola muestra baja: un pico no es un episodio', () => {
    expect(correr([4 * GB, 1 * GB, 4 * GB]).avisos).toEqual([false, false, false])
  })

  it('avisa a la segunda muestra seguida bajo el umbral', () => {
    expect(correr([1 * GB, 1 * GB]).avisos).toEqual([false, true])
  })

  it('avisa una sola vez por episodio aunque la memoria siga baja', () => {
    const { avisos } = correr([1 * GB, 1 * GB, 0.8 * GB, 0.5 * GB, 1 * GB])
    expect(avisos.filter(Boolean)).toHaveLength(1)
  })

  it('no sale del episodio al volver apenas sobre el umbral (histéresis)', () => {
    const justoArriba = UMBRAL + 100 * 1024 ** 2
    expect(justoArriba).toBeLessThan(umbralDeSalida(UMBRAL))
    const { avisos, estado } = correr([1 * GB, 1 * GB, justoArriba, 1 * GB, 1 * GB])
    expect(avisos.filter(Boolean)).toHaveLength(1)
    expect(estado.enEpisodio).toBe(true)
  })

  it('sale pasado el margen, y el episodio siguiente vuelve a avisar', () => {
    const arriba = umbralDeSalida(UMBRAL) + 1
    const { avisos } = correr([1 * GB, 1 * GB, arriba, 1 * GB, 1 * GB])
    expect(avisos).toEqual([false, true, false, false, true])
  })

  it('el margen de salida es al menos medio GB', () => {
    expect(umbralDeSalida(GB) - GB).toBe(512 * 1024 ** 2)
    expect(umbralDeSalida(4 * GB) - 4 * GB).toBe(GB)
  })

  it('apagado no avisa nunca, con la memoria que sea', () => {
    expect(correr([0, 0, 0], { modo: 'apagado' }).avisos).toEqual([false, false, false])
  })

  it('siempre avisa enseguida una vez, aunque sobre memoria', () => {
    expect(correr([8 * GB, 8 * GB, 8 * GB], { modo: 'siempre' }).avisos).toEqual([
      true,
      false,
      false
    ])
  })
})

describe('silenciar («Después»)', () => {
  it('calla por el plazo y, si sigue faltando, vuelve a avisar al terminar', () => {
    const { estado } = correr([1 * GB, 1 * GB])
    const callado = silenciar(estado, 10_000, 60_000)
    const durante = evaluarMuestra(callado, {
      disponible: GB,
      umbral: UMBRAL,
      modo: 'automatico',
      ahora: 30_000
    })
    expect(durante.avisar).toBe(false)
    const despues = evaluarMuestra(durante.estado, {
      disponible: GB,
      umbral: UMBRAL,
      modo: 'automatico',
      ahora: 70_000
    })
    expect(despues.avisar).toBe(true)
  })

  it('un episodio nuevo dentro del plazo tampoco avisa', () => {
    const callado = silenciar(EPISODIO_INICIAL, 0, 60_000)
    expect(correr([1 * GB, 1 * GB], { desde: callado, ahora: 1_000 }).avisos).toEqual([
      false,
      false
    ])
  })
})

describe('modoActivo', () => {
  it('prendido a mano siempre; en automático, sólo durante el episodio', () => {
    expect(modoActivo(EPISODIO_INICIAL, 'siempre')).toBe(true)
    expect(modoActivo(EPISODIO_INICIAL, 'automatico')).toBe(false)
    expect(modoActivo({ ...EPISODIO_INICIAL, enEpisodio: true }, 'automatico')).toBe(true)
    expect(modoActivo({ ...EPISODIO_INICIAL, enEpisodio: true }, 'apagado')).toBe(false)
  })
})
