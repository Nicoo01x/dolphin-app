/**
 * Los colores de la interfaz, derivados de cuatro perillas.
 *
 * La app ya está tokenizada entera —`--color-background`, `--color-primary`, `--color-sidebar` y
 * compañía— y el chat ya deriva los suyos de un ajuste. Esto hace lo mismo para la cáscara: la
 * persona elige un acento, una superficie, una tinta y cuánto contraste quiere, y de ahí sale el
 * juego completo.
 *
 * Lo que de verdad hay que resolver acá no es mezclar colores: es que **ninguna elección pueda
 * dejar el texto ilegible**. Un selector de color que permite escribir gris claro sobre blanco no
 * es personalización, es una forma de romper la app sin darse cuenta. Por eso cada color de texto
 * pasa por un piso de contraste antes de salir, y si no llega, se corre hasta llegar.
 */

export type PerillasDelTema = {
  /** El color de las acciones y de lo seleccionado. */
  acento: string
  /** El fondo de la app. */
  superficie: string
  /** El color del texto principal. */
  tinta: string
  /**
   * Cuánta separación entre los planos, de 0 a 100. Sube la distancia entre el fondo, las tarjetas
   * y los bordes; no toca la legibilidad, que tiene su propio piso.
   */
  contraste: number
}

/** El piso de contraste del texto común contra su fondo: el mínimo AA de WCAG. */
export const CONTRASTE_MINIMO_TEXTO = 4.5
/** El del texto secundario y los bordes, que son más chicos pero no decorativos. */
export const CONTRASTE_MINIMO_TENUE = 3

type Rgb = { r: number; g: number; b: number }

/** Lee `#rgb`, `#rrggbb` y `#rrggbbaa` (la transparencia se ignora: acá se decide color, no capa). */
export function leerColor(valor: string): Rgb | null {
  const limpio = valor.trim().replace(/^#/, '')
  const corto = /^[0-9a-fA-F]{3}$/.test(limpio)
  const largo = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(limpio)
  if (!corto && !largo) {
    return null
  }
  const hex = corto ? [...limpio].map((letra) => letra + letra).join('') : limpio.slice(0, 6)
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  }
}

export function escribirColor({ r, g, b }: Rgb): string {
  const dos = (n: number): string =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${dos(r)}${dos(g)}${dos(b)}`
}

/** Luminancia relativa de WCAG: no es el promedio de los canales, el verde pesa mucho más. */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (valor: number): number => {
    const v = valor / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Entre 1 (iguales) y 21 (negro contra blanco). */
export function contraste(uno: Rgb, otro: Rgb): number {
  const a = luminancia(uno)
  const b = luminancia(otro)
  const claro = Math.max(a, b)
  const oscuro = Math.min(a, b)
  return (claro + 0.05) / (oscuro + 0.05)
}

function mezclar(uno: Rgb, otro: Rgb, cuanto: number): Rgb {
  const parte = Math.min(1, Math.max(0, cuanto))
  return {
    r: uno.r + (otro.r - uno.r) * parte,
    g: uno.g + (otro.g - uno.g) * parte,
    b: uno.b + (otro.b - uno.b) * parte
  }
}

const NEGRO: Rgb = { r: 0, g: 0, b: 0 }
const BLANCO: Rgb = { r: 255, g: 255, b: 255 }

/**
 * El mismo color, corrido hasta que se lea sobre ese fondo.
 *
 * Se aleja del fondo en pasos chicos —hacia el blanco si el fondo es oscuro, hacia el negro si es
 * claro— y devuelve el primero que llega al piso. Mantiene el tono que la persona eligió todo lo
 * que puede en vez de saltar a blanco o negro de una.
 */
export function colorLegible(color: Rgb, fondo: Rgb, piso: number): Rgb {
  if (contraste(color, fondo) >= piso) {
    return color
  }
  const destino = luminancia(fondo) > 0.5 ? NEGRO : BLANCO
  for (let paso = 1; paso <= 20; paso += 1) {
    const corrido = mezclar(color, destino, paso / 20)
    if (contraste(corrido, fondo) >= piso) {
      return corrido
    }
  }
  return destino
}

/** Las variables CSS que la cáscara de la app ya lee. */
export type TokensDelTema = Record<string, string>

/**
 * De las cuatro perillas al juego de tokens.
 *
 * El contraste separa los planos: con 0 la tarjeta y el fondo son casi el mismo color y la
 * jerarquía la hace sólo la tipografía; con 100 cada plano se despega. Los textos no dependen de
 * esa perilla — tienen su piso y no se negocia.
 */
export function tokensDelTema(perillas: PerillasDelTema): TokensDelTema | null {
  const superficie = leerColor(perillas.superficie)
  const tinta = leerColor(perillas.tinta)
  const acento = leerColor(perillas.acento)
  if (!superficie || !tinta || !acento) {
    return null
  }
  const oscuro = luminancia(superficie) <= 0.5
  const separacion = Math.min(100, Math.max(0, perillas.contraste)) / 100
  const haciaElOtroLado = oscuro ? BLANCO : NEGRO
  const plano = (cuanto: number): Rgb =>
    mezclar(superficie, haciaElOtroLado, cuanto * (0.04 + separacion * 0.1))

  const textoPrincipal = colorLegible(tinta, superficie, CONTRASTE_MINIMO_TEXTO)
  const textoTenue = colorLegible(
    mezclar(tinta, superficie, 0.4),
    superficie,
    CONTRASTE_MINIMO_TENUE
  )
  const sobreElAcento = contraste(BLANCO, acento) >= contraste(NEGRO, acento) ? BLANCO : NEGRO

  return {
    '--color-background': escribirColor(superficie),
    '--color-foreground': escribirColor(textoPrincipal),
    '--color-card': escribirColor(plano(1)),
    '--color-card-foreground': escribirColor(textoPrincipal),
    '--color-popover': escribirColor(plano(1.5)),
    '--color-popover-foreground': escribirColor(textoPrincipal),
    '--color-muted': escribirColor(plano(1)),
    '--color-muted-foreground': escribirColor(textoTenue),
    '--color-accent': escribirColor(plano(1.5)),
    '--color-accent-foreground': escribirColor(textoPrincipal),
    '--color-primary': escribirColor(acento),
    '--color-primary-foreground': escribirColor(sobreElAcento),
    '--color-border': escribirColor(plano(2)),
    '--color-input': escribirColor(plano(2)),
    '--color-ring': escribirColor(acento),
    '--color-sidebar': escribirColor(plano(0.5)),
    '--color-sidebar-foreground': escribirColor(textoPrincipal),
    '--color-editor-surface': escribirColor(superficie)
  }
}
