import { PALETA_CLARA, PALETA_OSCURA, type PaletaDeCodigo } from './paleta-de-codigo'

/**
 * Qué tema de colores lleva el código: el editor, los diffs y los bloques de código del chat.
 *
 * - `dolphin` es el de siempre: lo que nombra (función, tipo) con color y en negrita, lo que
 *   estructura en gris. Callado, para leer código ocho horas.
 * - `noche` es el que pidió Nico el 14/11/2026 sobre la tarjeta «Lo que hizo» de la referencia
 *   (`docs/reforma/codigo-y-resumen-del-agente.md`): palabras clave en rosa coral, nombres en azul
 *   claro, cadenas en verde menta, sobre un negro casi puro. Es el único lugar de la interfaz donde
 *   va color fuerte.
 *
 * Vive en `shared` por lo mismo que la paleta: lo elige un ajuste, lo guarda el proceso principal y
 * lo pintan tres superficies del renderer que no se conocen entre sí.
 */
export const TEMAS_DE_CODIGO = ['noche', 'dolphin'] as const

export type TemaDeCodigo = (typeof TEMAS_DE_CODIGO)[number]

/**
 * El de un perfil nuevo. Uno que ya existía y nunca eligió conserva `dolphin`: lo resuelve la
 * migración de los ajustes (`temaDeCodigoGuardado`), no este valor.
 */
export const TEMA_DE_CODIGO_DE_FABRICA: TemaDeCodigo = 'noche'

/** Lo que había antes de que existiera el ajuste: así se ve un perfil viejo que no eligió nada. */
export const TEMA_DE_CODIGO_ANTERIOR: TemaDeCodigo = 'dolphin'

export type TemaDeCodigoSettings = {
  /** Ausente: el de antes (`dolphin`). Los perfiles nuevos nacen con `noche`. */
  temaDeCodigo?: TemaDeCodigo
}

export function temaDeCodigo(valor: unknown): TemaDeCodigo {
  return TEMAS_DE_CODIGO.includes(valor as TemaDeCodigo)
    ? (valor as TemaDeCodigo)
    : TEMA_DE_CODIGO_ANTERIOR
}

/**
 * Los colores de Dolphin Noche, medidos con cuentagotas sobre la referencia
 * (`docs/reforma/referencias/lo-que-hizo-el-agente-referencia.png`) y corridos hasta pasar AA.
 *
 * Contraste de cada tinta sobre el lienzo `#0e0e0e` (y el peor de los dos fondos de diff):
 * texto 15,47 · clave 7,42 (6,34) · identificador 9,35 (7,98) · función 9,80 (8,37) ·
 * tipo 8,33 (7,12) · cadena 11,04 (9,43) · número 9,84 (8,41) · puntuación 11,07 (9,45) ·
 * comentario 5,35 (4,57) · número de línea 4,62. Ninguna baja de 4,5:1.
 *
 * El rosa coral de la referencia mide #f66eae–#ff779e en el centro de los glifos; se lo bajó a
 * #f6789a, que es el mismo tono con menos violeta. El azul de los nombres mide #7fc6ff y el de las
 * llamadas tira a lavanda (#b8a1ff): se dejó en un azul pálido (#a9b4ff) para que no aparezca un
 * violeta nuevo, que es el flúor que Nico no quiere.
 */
export const PALETA_NOCHE_OSCURA: PaletaDeCodigo = {
  ...PALETA_OSCURA,
  base: { color: '7db8ff' },
  comentario: { color: '8c867d', cursiva: true },
  puntuacion: { color: 'c4c4c4' },
  operador: { color: 'c4c4c4' },
  clave: { color: 'f6789a' },
  funcion: { color: 'a9b4ff' },
  tipo: { color: '8fa6ff' },
  cadena: { color: '7ed6a0' },
  numero: { color: '8fc3bd' },
  expresionRegular: { color: '7ed6a0', cursiva: true },
  anotacion: { color: 'f6789a' },
  invalido: { color: 'f0646f' }
}

/**
 * La variante clara: los mismos tonos, bajados de luz hasta 4,5:1 sobre `#fcfcfc` (y sobre los
 * fondos de diff claros): texto 16,61 · clave 6,23 (5,35) · identificador 5,94 (5,10) ·
 * función 6,46 (5,55) · tipo 6,84 (5,88) · cadena 6,47 (5,56) · número 6,64 (5,70) ·
 * puntuación 8,64 (7,42) · comentario 5,83 (5,01) · número de línea 4,62.
 */
export const PALETA_NOCHE_CLARA: PaletaDeCodigo = {
  ...PALETA_CLARA,
  base: { color: '1f5fbf' },
  comentario: { color: '6b6258', cursiva: true },
  puntuacion: { color: '4a4a4a' },
  operador: { color: '4a4a4a' },
  clave: { color: 'b02a4d' },
  funcion: { color: '4a4fc0' },
  tipo: { color: '3550b8' },
  cadena: { color: '136a40' },
  numero: { color: '2a645e' },
  expresionRegular: { color: '136a40', cursiva: true },
  anotacion: { color: 'b02a4d' },
  invalido: { color: 'b42633' }
}

/** Lo que no es un rol de la paleta: el fondo, el texto suelto y los diffs. */
export type CromoDeCodigo = {
  readonly fondo: string
  /** El texto sin token (texto plano, Markdown): neutro, no del color de los nombres. */
  readonly texto: string
  readonly numeroDeLinea: string
  readonly quitadoFondo: string
  readonly agregadoFondo: string
  readonly quitadoMarca: string
  readonly agregadoMarca: string
}

export const CROMO_NOCHE_OSCURO: CromoDeCodigo = {
  fondo: '0e0e0e',
  texto: 'e6e6e6',
  numeroDeLinea: '7c7c7c',
  quitadoFondo: '2a1013',
  agregadoFondo: '0f2318',
  quitadoMarca: 'f0646f',
  agregadoMarca: '4cc38a'
}

export const CROMO_NOCHE_CLARO: CromoDeCodigo = {
  fondo: 'fcfcfc',
  texto: '1c1c1c',
  numeroDeLinea: '737373',
  quitadoFondo: 'fbe6e8',
  agregadoFondo: 'e3f4ea',
  quitadoMarca: 'b42633',
  agregadoMarca: '176c40'
}

/** La paleta de fábrica de cada tema: la base sobre la que se aplica lo que la persona cambió. */
export function paletaDeFabrica(tema: TemaDeCodigo, oscuro: boolean): PaletaDeCodigo {
  if (tema === 'noche') {
    return oscuro ? PALETA_NOCHE_OSCURA : PALETA_NOCHE_CLARA
  }
  return oscuro ? PALETA_OSCURA : PALETA_CLARA
}
