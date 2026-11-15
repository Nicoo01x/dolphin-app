import type { DolphinFailureCode } from './dolphin-console-types'

/**
 * El tablero de Dolphin visto desde el escritorio (ver docs/idea.md): cinco columnas fijas y una
 * tarjeta por archivo en `.dolphin/tablero/` del repo. El núcleo (src/nucleo/tarjetas.ts) es el dueño
 * del formato; acá se lee sólo lo mínimo para dibujar, y se valida porque viene de disco: una tarjeta
 * rota no tumba el tablero.
 */

export const COLUMNAS_DEL_TABLERO = [
  'ideas',
  'para-hacer',
  'haciendo',
  'para-revisar',
  'hecho'
] as const

export type ColumnaDelTablero = (typeof COLUMNAS_DEL_TABLERO)[number]

/** Cómo le fue a una fase del portón con la rama de una tarjeta. */
export type EstadoDeFaseDelPorton = 'paso' | 'fallo' | 'salteada' | 'sin-correr'

export type FaseDelPortonDeTarjeta = { fase: string; estado: EstadoDeFaseDelPorton }

export type TarjetaDelTablero = {
  id: string
  titulo: string
  columna: ColumnaDelTablero
  tipo: 'tarea' | 'bug' | 'idea'
  /** Qué hay que hacer, con las palabras de quien la anotó (opcional en el núcleo). */
  detalle?: string
  /** Quién la toma: una persona o «agentes». Sin nadie, está libre. */
  quien?: string
  /** Cuando un equipo la trabaja: la rama que entrega. */
  rama?: string
  /**
   * La última pasada de su rama por el portón, fase por fase y en orden. Sólo si el núcleo la dejó
   * escrita en la tarjeta: sin el dato no se dibuja nada (no se adivina un portón).
   */
  porton?: FaseDelPortonDeTarjeta[]
  /** La última vez que cambió de columna (ISO): ordena cada columna, lo más nuevo arriba. */
  movida: string
}

/** Qué tarjeta pasar a qué columna; el repo sale del espacio de trabajo de donde se leyó. */
export type PedidoDeMoverTarjeta = { worktreeId: string; id: string; columna: ColumnaDelTablero }

/**
 * Lo que contesta pedirle al núcleo que mueva una tarjeta. Si no se pudo, con el código de la
 * consola (que la pantalla traduce, como en el modo live y el portón) y el detalle tal cual: el
 * porqué del núcleo cuando no la aceptó (`rejected`), o cuántos segundos se esperó (`timeout`).
 */
export type TarjetaMovida = { ok: true } | { ok: false; code: DolphinFailureCode; detail?: string }

/** `sin-tablero`: el proyecto no es local o no tiene tarjetas escritas; no es un error. */
export type TableroLeido = { ok: true; tarjetas: TarjetaDelTablero[] } | { ok: false }

export type ColumnaConTarjetas = {
  columna: ColumnaDelTablero
  tarjetas: TarjetaDelTablero[]
}

const esColumna = (valor: unknown): valor is ColumnaDelTablero =>
  typeof valor === 'string' && (COLUMNAS_DEL_TABLERO as readonly string[]).includes(valor)

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() ? valor : undefined

const ESTADOS_DE_FASE: readonly EstadoDeFaseDelPorton[] = [
  'paso',
  'fallo',
  'salteada',
  'sin-correr'
]

/** Las fases que se entienden; una rota se descarta sola y no tumba la tira. */
function portonDe(dato: unknown): FaseDelPortonDeTarjeta[] | undefined {
  if (!Array.isArray(dato)) {
    return undefined
  }
  const fases = dato.flatMap((fase: unknown): FaseDelPortonDeTarjeta[] => {
    const f = fase as Record<string, unknown> | null
    const nombre = texto(f?.fase)
    const estado = ESTADOS_DE_FASE.find((e) => e === f?.estado)
    return nombre && estado ? [{ fase: nombre, estado }] : []
  })
  return fases.length > 0 ? fases : undefined
}

/** Una tarjeta tal como la dejó el núcleo en disco, o `undefined` si no se entiende. */
export function comoTarjetaDelTablero(dato: unknown): TarjetaDelTablero | undefined {
  const d = dato as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !texto(d.titulo)) {
    return undefined
  }
  if (!esColumna(d.columna)) {
    return undefined
  }
  const detalle = texto(d.detalle)
  const quien = texto(d.quien)
  const rama = texto(d.rama)
  const creada = texto(d.creada)
  const porton = rama ? portonDe(d.porton) : undefined
  return {
    id: d.id,
    titulo: d.titulo as string,
    columna: d.columna,
    tipo: d.tipo === 'bug' || d.tipo === 'idea' ? d.tipo : 'tarea',
    ...(detalle ? { detalle } : {}),
    ...(quien ? { quien } : {}),
    ...(rama ? { rama } : {}),
    ...(porton ? { porton } : {}),
    movida: texto(d.movida) ?? creada ?? ''
  }
}

/**
 * Las cinco columnas en su orden, SIEMPRE las cinco (son el ciclo, no una preferencia), y adentro de
 * cada una lo que se movió último arriba.
 */
export function agruparPorColumna(tarjetas: readonly TarjetaDelTablero[]): ColumnaConTarjetas[] {
  return COLUMNAS_DEL_TABLERO.map((columna) => ({
    columna,
    tarjetas: tarjetas
      .filter((tarjeta) => tarjeta.columna === columna)
      .sort((a, b) => b.movida.localeCompare(a.movida))
  }))
}

/** Dibujar el tablero sólo vale si hay algo que mostrar; si no, va el estado vacío. */
export function hayTarjetas(
  tablero: TableroLeido | null
): tablero is Extract<TableroLeido, { ok: true }> {
  return tablero !== null && tablero.ok && tablero.tarjetas.length > 0
}

/**
 * Las columnas con trabajo sin empezar: una tarjeta ahí se puede volver un pedido para el agente.
 * En las demás ya hay alguien trabajando o ya terminó, y tocarlas no tendría qué hacer.
 */
export const COLUMNAS_SIN_EMPEZAR: readonly ColumnaDelTablero[] = ['ideas', 'para-hacer']

export const sePuedeEmpezar = (tarjeta: TarjetaDelTablero): boolean =>
  COLUMNAS_SIN_EMPEZAR.includes(tarjeta.columna)

/** Lo que se carga en el prompt: el título y, si la tarjeta lo trae, su detalle en otro párrafo. */
export const textoParaElPrompt = (tarjeta: TarjetaDelTablero): string =>
  tarjeta.detalle ? `${tarjeta.titulo}\n\n${tarjeta.detalle}` : tarjeta.titulo
