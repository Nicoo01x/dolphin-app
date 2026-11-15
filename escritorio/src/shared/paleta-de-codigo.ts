/**
 * La paleta del código: qué color y qué peso tiene cada cosa que se escribe.
 *
 * Vive en `shared` y no en el editor porque la eligen los ajustes, la guarda el proceso principal
 * y la pinta el renderer: si viviera adentro de Monaco, personalizarla sería imposible sin tocar
 * el editor.
 *
 * Dos decisiones que hacen que esto no sea un arcoíris más:
 *
 * 1. **Lo que NOMBRA se enciende; lo que ESTRUCTURA se apaga.** Las funciones y los tipos van con
 *    color y en negrita; las palabras clave, los operadores y la puntuación se quedan en gris y en
 *    peso liviano. Un tema que pinta `if` del mismo tamaño que `calcularImpuesto` le pone el mismo
 *    énfasis a los dos, y de los dos sólo uno te dice qué hace el archivo.
 * 2. **Las variables no llevan color.** Son la mayoría de las palabras de cualquier archivo: si se
 *    pintan, el color deja de significar algo. Quedan en el gris claro del texto base y así los
 *    seis roles que sí tienen color se leen de un vistazo.
 *
 * El cromo alrededor (paneles, rail, gutter, pie) sigue siendo monocromo: el color vive adentro
 * del código, que es el contenido, y no en la interfaz que lo rodea.
 */

/** Cada cosa a la que se le puede poner color. Es la lista completa: no hay roles escondidos. */
export const ROLES_DE_CODIGO = [
  'base',
  'comentario',
  'puntuacion',
  'operador',
  'clave',
  'funcion',
  'tipo',
  'cadena',
  'numero',
  'expresionRegular',
  'anotacion',
  'invalido'
] as const

export type RolDeCodigo = (typeof ROLES_DE_CODIGO)[number]

export type TintaDeRol = {
  /** Hex de seis dígitos, sin `#`: es el formato que pide Monaco. */
  readonly color: string
  readonly negrita?: boolean
  readonly cursiva?: boolean
}

export type PaletaDeCodigo = Readonly<Record<RolDeCodigo, TintaDeRol>>
export type PaletaParcial = Partial<Record<RolDeCodigo, Partial<TintaDeRol>>>

/** Cómo se llama cada rol en la pantalla de ajustes. */
export const NOMBRE_DEL_ROL: Readonly<Record<RolDeCodigo, string>> = {
  base: 'Variables y texto',
  comentario: 'Comentarios',
  puntuacion: 'Puntuación',
  operador: 'Operadores',
  clave: 'Palabras clave',
  funcion: 'Funciones',
  tipo: 'Tipos y clases',
  cadena: 'Textos',
  numero: 'Números',
  expresionRegular: 'Expresiones regulares',
  anotacion: 'Anotaciones',
  invalido: 'Errores'
}

/**
 * La paleta oscura de fábrica.
 *
 * Cinco hues y nada más, todos desaturados y medidos contra el lienzo `#0c0d10`: ninguno baja de
 * 4,5:1. Cuatro son fríos y uno —el de las funciones— es cálido, que es lo que hace que el ojo
 * caiga primero ahí. Los comentarios quedan en 3,8:1 a propósito: un comentario que pesa lo mismo
 * que el código compite con él.
 */
export const PALETA_OSCURA: PaletaDeCodigo = {
  base: { color: 'c9c9d2' },
  comentario: { color: '70707a', cursiva: true },
  puntuacion: { color: '70707a' },
  operador: { color: '9a9aa4' },
  clave: { color: 'a89ad6' },
  funcion: { color: 'e0bd86', negrita: true },
  tipo: { color: '7fc6bf', negrita: true },
  cadena: { color: '9ec49a' },
  numero: { color: 'd9a87c' },
  expresionRegular: { color: 'd9a87c', cursiva: true },
  anotacion: { color: 'a89ad6' },
  invalido: { color: 'e08b84' }
}

/** La misma idea sobre papel: mismos hues, bajados de luz para dar 4,5:1 sobre `#fbfbfc`. */
export const PALETA_CLARA: PaletaDeCodigo = {
  base: { color: '35353d' },
  comentario: { color: '8c8c95', cursiva: true },
  puntuacion: { color: '85858e' },
  operador: { color: '63636c' },
  clave: { color: '6a4fae' },
  funcion: { color: '8a5a12', negrita: true },
  tipo: { color: '15706a', negrita: true },
  cadena: { color: '3d7336' },
  numero: { color: '95561c' },
  expresionRegular: { color: '95561c', cursiva: true },
  anotacion: { color: '6a4fae' },
  invalido: { color: 'a33c34' }
}

/**
 * Paletas listas, para no obligar a nadie a elegir doce colores a mano.
 *
 * `monocromo` no es una curiosidad: es la que lleva la idea al extremo —cero hues, la jerarquía
 * entera por luz y peso—. Sirve para leer código mucho rato y para capturas.
 */
export const PRESETS_OSCUROS: Readonly<Record<string, PaletaParcial>> = {
  dolphin: {},
  monocromo: {
    clave: { color: '8c8c97' },
    funcion: { color: 'ffffff', negrita: true },
    tipo: { color: 'ffffff', negrita: true },
    cadena: { color: '8e8e99', cursiva: true },
    numero: { color: '8e8e99' },
    expresionRegular: { color: '8e8e99', cursiva: true },
    anotacion: { color: '8c8c97' }
  },
  oceano: {
    clave: { color: '7fa7d6' },
    funcion: { color: '8fd6cf', negrita: true },
    tipo: { color: 'c3d98f', negrita: true },
    cadena: { color: '8fb6cc' },
    numero: { color: 'a9c7e0' }
  }
}

const HEX = /^[0-9a-f]{6}$/i

/** Lo que llega de los ajustes no se cree: un hex roto deja a Monaco sin tema entero. */
export function paletaConPersonal(base: PaletaDeCodigo, personal?: PaletaParcial): PaletaDeCodigo {
  if (!personal) {
    return base
  }
  const salida: Record<string, TintaDeRol> = {}
  for (const rol of ROLES_DE_CODIGO) {
    const deFabrica = base[rol]
    const encima = personal[rol]
    salida[rol] = {
      color: encima?.color && HEX.test(encima.color) ? encima.color.toLowerCase() : deFabrica.color,
      ...((encima?.negrita ?? deFabrica.negrita) ? { negrita: true } : {}),
      ...((encima?.cursiva ?? deFabrica.cursiva) ? { cursiva: true } : {})
    }
  }
  return salida as PaletaDeCodigo
}

/** El ajuste, en su propio módulo como los demás grupos. */
export type PaletaDeCodigoSettings = {
  /** Lo que la persona cambió del tema oscuro. Ausente: el de fábrica. */
  paletaDeCodigoOscura?: PaletaParcial
  /** Lo mismo para el claro. */
  paletaDeCodigoClara?: PaletaParcial
}
