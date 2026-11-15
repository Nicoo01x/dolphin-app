import type {
  ColumnaDelTablero,
  FaseDelPortonDeTarjeta
} from '../../../../../shared/dolphin-tablero-types'

/**
 * La tarjeta de ejemplo del tablero vacío: recorre el ciclo sola, y es la explicación del producto
 * sin un párrafo. Nace en Ideas, la aprueban (Para hacer), un agente la toma (Haciendo), su rama
 * cruza el portón fase por fase, queda para revisar y termina en Hecho. Después, una pausa larga
 * quieta en Hecho, y vuelve a empezar.
 */

/** Las fases del portón de la tarjeta de ejemplo: las gratis de cualquier repo, de la más barata. */
export const FASES_DE_EJEMPLO: readonly FaseDelPortonDeTarjeta[] = [
  { fase: 'types', estado: 'paso' },
  { fase: 'lint', estado: 'paso' },
  { fase: 'tests', estado: 'paso' },
  { fase: 'build', estado: 'paso' }
]

export type MomentoDelEjemplo = {
  columna: ColumnaDelTablero
  /** Cuántas fases del portón ya corrieron. */
  llenas: number
  /** Falso el instante en que se va de Hecho para volver a nacer en Ideas. */
  visible: boolean
}

/** Cuándo empieza cada tramo de una vuelta, en ms. */
const TRAMOS: readonly { desde: number; columna: ColumnaDelTablero; llenas: number }[] = [
  { desde: 0, columna: 'ideas', llenas: 0 },
  { desde: 1_800, columna: 'para-hacer', llenas: 0 },
  { desde: 3_200, columna: 'haciendo', llenas: 0 },
  { desde: 4_400, columna: 'haciendo', llenas: 1 },
  { desde: 5_200, columna: 'haciendo', llenas: 2 },
  { desde: 6_000, columna: 'haciendo', llenas: 3 },
  { desde: 6_800, columna: 'haciendo', llenas: 4 },
  { desde: 7_800, columna: 'para-revisar', llenas: 4 },
  { desde: 10_200, columna: 'hecho', llenas: 4 }
]

/** Una vuelta entera: unos doce segundos de ciclo y la pausa larga en Hecho. */
export const DURACION_DE_LA_VUELTA = 18_000
/** Se va de Hecho un momento antes de volver a nacer: no cruza el tablero hacia atrás. */
const SE_VA = 17_400

/** Con «reducir movimiento»: quieta en Para revisar, con la tira entera. */
export const MOMENTO_QUIETO: MomentoDelEjemplo = {
  columna: 'para-revisar',
  llenas: FASES_DE_EJEMPLO.length,
  visible: true
}

export function momentoDelEjemplo(ms: number): MomentoDelEjemplo {
  const enLaVuelta = ((ms % DURACION_DE_LA_VUELTA) + DURACION_DE_LA_VUELTA) % DURACION_DE_LA_VUELTA
  const tramo = TRAMOS.findLast((t) => t.desde <= enLaVuelta) ?? TRAMOS[0]!
  return { columna: tramo.columna, llenas: tramo.llenas, visible: enLaVuelta < SE_VA }
}

/** Cuánto falta para que el ejemplo cambie: así se despierta sólo cuando hay algo que mover. */
export function hastaElProximoCambio(ms: number): number {
  const enLaVuelta = ((ms % DURACION_DE_LA_VUELTA) + DURACION_DE_LA_VUELTA) % DURACION_DE_LA_VUELTA
  const cortes = [...TRAMOS.map((t) => t.desde), SE_VA, DURACION_DE_LA_VUELTA]
  const proximo = cortes.find((corte) => corte > enLaVuelta) ?? DURACION_DE_LA_VUELTA
  return proximo - enLaVuelta
}
