/**
 * El fondo de la ventana: un óleo detrás de los paneles, que quedan translúcidos encima.
 *
 * Lo pidió Nico el 14/11/2026 (`docs/reforma/chat-con-paisaje.md`): «que después le puedan poner
 * el fondo que ellos quieran, pero por default que venga uno así». Vive en `shared` porque lo elige
 * un ajuste, lo guarda el proceso principal (que también copia la imagen propia al perfil) y lo
 * pinta el renderer.
 */

export const FONDOS_INCLUIDOS_IDS = [
  'sierra',
  'merced',
  'desfiladero',
  'andes',
  'lago',
  'meandro',
  'delaware'
] as const

export type FondoIncluidoId = (typeof FONDOS_INCLUIDOS_IDS)[number]

/**
 * El que viene puesto: el mismo óleo de la referencia (`chat-con-paisaje-referencia.png`), «Among
 * the Sierra Nevada, California» de Bierstadt. Nico: «ese mismo fondo quiero».
 */
export const FONDO_INCLUIDO_DE_FABRICA: FondoIncluidoId = 'sierra'

export type FuenteDelFondo =
  | { readonly tipo: 'ninguno' }
  | { readonly tipo: 'incluido'; readonly id: FondoIncluidoId }
  /** Una imagen de la persona, ya copiada adentro del perfil: `nombre` es el archivo, sin ruta. */
  | { readonly tipo: 'propio'; readonly nombre: string }

export type FondoDelChat = {
  readonly fuente: FuenteDelFondo
  /**
   * Cuánto se oscurece la pintura donde se ve directa (el chat vacío y las juntas entre paneles):
   * 0 = se ve entera, 1 = negro. Los paneles de vidrio tapan un poco más (`alfaDelVidrio`), y
   * nunca menos de lo que pide su texto para llegar a AA.
   */
  readonly velo: number
  readonly desenfoque: boolean
  /**
   * Paneles sin vidrio: la pintura queda sólo en el chat vacío. Apagado de fábrica y elegido por la
   * persona en Ajustes, nunca leído del sistema: con los «Efectos de transparencia» de Windows
   * apagados la pintura se veía sólo en el medio, y no era lo que la persona había elegido.
   */
  readonly panelesOpacos: boolean
}

/**
 * El rango del deslizador. El velo ya no cuida la legibilidad (de eso se encarga el vidrio de cada
 * panel, y detrás de la pregunta del chat vacío un velo local), así que puede bajar hasta dejar el
 * cuadro casi entero, como en la referencia. Arriba de 0,9 ya no se ve y conviene «Ninguno».
 */
export const VELO_MINIMO = 0.2
export const VELO_MAXIMO = 0.9

export const FONDO_DEL_CHAT_DE_FABRICA: FondoDelChat = {
  fuente: { tipo: 'incluido', id: FONDO_INCLUIDO_DE_FABRICA },
  velo: 0.3,
  desenfoque: false,
  panelesOpacos: false
}

export type FondoDelChatSettings = {
  /** Ausente: el de fábrica. «Ninguno» se guarda explícito, así no vuelve solo. */
  fondoDelChat?: FondoDelChat
}

/** El nombre de archivo de una imagen propia: sin carpetas, sin `..`, con extensión de imagen. */
const NOMBRE_PROPIO = /^[\w.-]{1,120}\.(?:webp|png|jpe?g|avif)$/i

export function nombreDeFondoPropioValido(nombre: unknown): nombre is string {
  return typeof nombre === 'string' && NOMBRE_PROPIO.test(nombre) && !nombre.includes('..')
}

function fuente(valor: unknown): FuenteDelFondo {
  if (!valor || typeof valor !== 'object') {
    return FONDO_DEL_CHAT_DE_FABRICA.fuente
  }
  const crudo = valor as { tipo?: unknown; id?: unknown; nombre?: unknown }
  if (crudo.tipo === 'ninguno') {
    return { tipo: 'ninguno' }
  }
  if (crudo.tipo === 'incluido' && FONDOS_INCLUIDOS_IDS.includes(crudo.id as FondoIncluidoId)) {
    return { tipo: 'incluido', id: crudo.id as FondoIncluidoId }
  }
  if (crudo.tipo === 'propio' && nombreDeFondoPropioValido(crudo.nombre)) {
    return { tipo: 'propio', nombre: crudo.nombre }
  }
  return FONDO_DEL_CHAT_DE_FABRICA.fuente
}

/** Lo que llega de los ajustes no se cree: un valor roto vuelve al de fábrica, no rompe la ventana. */
export function fondoDelChat(valor: unknown): FondoDelChat {
  if (!valor || typeof valor !== 'object') {
    return FONDO_DEL_CHAT_DE_FABRICA
  }
  const crudo = valor as {
    fuente?: unknown
    velo?: unknown
    desenfoque?: unknown
    panelesOpacos?: unknown
  }
  const velo =
    typeof crudo.velo === 'number' && Number.isFinite(crudo.velo)
      ? Math.min(VELO_MAXIMO, Math.max(VELO_MINIMO, crudo.velo))
      : FONDO_DEL_CHAT_DE_FABRICA.velo
  return {
    fuente: fuente(crudo.fuente),
    velo,
    desenfoque: crudo.desenfoque === true,
    panelesOpacos: crudo.panelesOpacos === true
  }
}

/**
 * El vidrio de los paneles (`docs/reforma/chat-con-paisaje.md`, «El vidrio»).
 *
 * Cada panel pinta la misma pintura, achicada y desenfocada una sola vez al cargarla (no un
 * `backdrop-filter` que se recalcula con cada tecla), con una tinta encima. Para que el texto se
 * lea sobre CUALQUIER imagen sin tapar la pintura con un gris liso, la pintura esmerilada pasa por
 * una curva de luz antes de usarla (`luzDelVidrio`), como el material de vidrio de un sistema: en
 * oscuro las luces se aplastan con un codo suave hasta un techo y en claro las sombras suben hasta
 * un piso. La curva conserva el dibujo (nubes, rocas, árboles) y acota el peor punto: así la tinta
 * mínima sale de la cuenta, no de medir los fondos uno por uno, y puede ser liviana.
 */
export type Rgb = readonly [number, number, number]
export type TemaDelVidrio = 'oscuro' | 'claro'

/** La luz más alta que deja pasar el vidrio oscuro y la más baja del claro (luminancia de WCAG). */
export const TECHO_DEL_VIDRIO_OSCURO = 0.1
export const PISO_DEL_VIDRIO_CLARO = 0.36
/** El codo de la curva: más chico aplasta más las luces y deja más dibujo en los medios. */
const CODO = 0.25
export const TINTA_DEL_VIDRIO_OSCURO: Rgb = [23, 23, 23]
export const TINTA_DEL_VIDRIO_CLARO: Rgb = [250, 250, 252]
/** El texto más tenue que va sobre el vidrio: la tinta al 74 % en oscuro, #4a4a4a en claro. */
export const ATENUADO_SOBRE_VIDRIO_OSCURO: Rgb = [0xb7, 0xb7, 0xb7]
export const ATENUADO_SOBRE_VIDRIO_CLARO: Rgb = [0x4a, 0x4a, 0x4a]
/** Cuánta tinta suma el deslizador entre su mínimo y su máximo, encima de la mínima. */
const TINTA_DEL_DESLIZADOR = 0.5
const ALFA_MAXIMO_DEL_VIDRIO = 0.95

function lineal(canal: number): number {
  const c = canal / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function aSrgb(luz: number): number {
  const c = luz <= 0.0031308 ? luz * 12.92 : 1.055 * luz ** (1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, c)) * 255
}

/** Luminancia relativa de WCAG 2.x. */
export function luminancia([r, g, b]: Rgb): number {
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b)
}

export function contraste(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (oscuro! + 0.05)
}

/**
 * La curva de luz del vidrio: de la luminancia de un punto de la pintura a la que muestra el panel.
 * Oscuro: `techo · (1 + codo) · L / (L + codo)`, que lleva el blanco justo al techo. Claro: la misma
 * curva sobre la oscuridad (1 − L), que lleva el negro justo al piso.
 */
export function luzDelVidrio(luz: number, tema: TemaDelVidrio): number {
  const l = Math.min(1, Math.max(0, luz))
  if (tema === 'oscuro') {
    return (TECHO_DEL_VIDRIO_OSCURO * (1 + CODO) * l) / (l + CODO)
  }
  const sombra = 1 - l
  return 1 - ((1 - PISO_DEL_VIDRIO_CLARO) * (1 + CODO) * sombra) / (sombra + CODO)
}

/**
 * Un color pasado por la curva, como lo hace `vidrio-del-paisaje.ts` punto a punto. Oscuro: escala
 * los tres canales en luz lineal (conserva el tono). Claro: lo mezcla con blanco en luz lineal. Las
 * dos cuentas dejan la luminancia exacta que pide la curva.
 */
export function colorDelVidrio(color: Rgb, tema: TemaDelVidrio): Rgb {
  const [r, g, b] = [lineal(color[0]), lineal(color[1]), lineal(color[2])]
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const objetivo = luzDelVidrio(luz, tema)
  if (tema === 'oscuro') {
    const k = luz > 0 ? objetivo / luz : 0
    return [aSrgb(r * k), aSrgb(g * k), aSrgb(b * k)]
  }
  const t = luz < 1 ? Math.max(0, (objetivo - luz) / (1 - luz)) : 0
  return [aSrgb(r + (1 - r) * t), aSrgb(g + (1 - g) * t), aSrgb(b + (1 - b) * t)]
}

/** Lo que pinta el navegador: la tinta con su alfa sobre un punto de la pintura, canal por canal. */
export function mezcla(tinta: Rgb, alfa: number, fondo: Rgb): Rgb {
  const canal = (i: 0 | 1 | 2): number => tinta[i] * alfa + fondo[i] * (1 - alfa)
  return [canal(0), canal(1), canal(2)]
}

/** La tinta mínima del vidrio para que `texto` llegue a 4,5:1 sobre el punto `extremo`. */
export function alfaMinimoDelVidrio(tinta: Rgb, extremo: Rgb, texto: Rgb): number {
  let [bajo, alto] = [0, 1]
  for (let i = 0; i < 24; i += 1) {
    const medio = (bajo + alto) / 2
    if (contraste(mezcla(tinta, medio, extremo), texto) >= 4.5) {
      alto = medio
    } else {
      bajo = medio
    }
  }
  return alto
}

/**
 * Los peores puntos posibles: el blanco, el negro y los seis colores puros. La curva deja la
 * luminancia justa, pero la mezcla del navegador es por canal y en sRGB, así que un azul puro pide
 * un poco más de tinta que un gris con la misma luz.
 */
export const EXTREMOS: readonly Rgb[] = [
  [255, 255, 255],
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 255],
  [255, 0, 255]
]

function alfaMinimoDelTema(tema: TemaDelVidrio): number {
  const tinta = tema === 'oscuro' ? TINTA_DEL_VIDRIO_OSCURO : TINTA_DEL_VIDRIO_CLARO
  const texto = tema === 'oscuro' ? ATENUADO_SOBRE_VIDRIO_OSCURO : ATENUADO_SOBRE_VIDRIO_CLARO
  const peor = Math.max(
    ...EXTREMOS.map((color) => alfaMinimoDelVidrio(tinta, colorDelVidrio(color, tema), texto))
  )
  // Un centésimo de margen por el redondeo de los canales a enteros.
  return Math.ceil(peor * 100) / 100 + 0.01
}

/** La tinta mínima de cada tema: con eso, cualquier punto de cualquier cuadro da AA. */
export const ALFA_MINIMO_DEL_VIDRIO: Readonly<Record<TemaDelVidrio, number>> = {
  oscuro: alfaMinimoDelTema('oscuro'),
  claro: alfaMinimoDelTema('claro')
}

/**
 * Cuánto tapa la tinta del vidrio con este velo: la mínima de AA con el velo en su mínimo, y el
 * deslizador le suma hasta medio panel más. Así el vidrio de fábrica deja ver la pintura como la
 * referencia y quien quiera paneles más quietos sube el velo.
 */
export function alfaDelVidrio(velo: number, tema: TemaDelVidrio): number {
  const recorrido = Math.max(0, (velo - VELO_MINIMO) / (VELO_MAXIMO - VELO_MINIMO))
  return Math.min(
    ALFA_MAXIMO_DEL_VIDRIO,
    ALFA_MINIMO_DEL_VIDRIO[tema] + recorrido * TINTA_DEL_DESLIZADOR
  )
}
