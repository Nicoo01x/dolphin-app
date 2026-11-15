/**
 * El fondo de la ventana: un óleo detrás de los paneles, que quedan translúcidos encima.
 *
 * Lo pidió Nico el 14/11/2026 (`docs/reforma/chat-con-paisaje.md`): «que después le puedan poner
 * el fondo que ellos quieran, pero por default que venga uno así». Vive en `shared` porque lo elige
 * un ajuste, lo guarda el proceso principal (que también copia la imagen propia al perfil) y lo
 * pinta el renderer.
 */

export const FONDOS_INCLUIDOS_IDS = [
  'merced',
  'desfiladero',
  'andes',
  'lago',
  'meandro',
  'delaware'
] as const

export type FondoIncluidoId = (typeof FONDOS_INCLUIDOS_IDS)[number]

/** El que viene puesto: el más parecido a la referencia (Bierstadt, roca con niebla). */
export const FONDO_INCLUIDO_DE_FABRICA: FondoIncluidoId = 'merced'

export type FuenteDelFondo =
  | { readonly tipo: 'ninguno' }
  | { readonly tipo: 'incluido'; readonly id: FondoIncluidoId }
  /** Una imagen de la persona, ya copiada adentro del perfil: `nombre` es el archivo, sin ruta. */
  | { readonly tipo: 'propio'; readonly nombre: string }

export type FondoDelChat = {
  readonly fuente: FuenteDelFondo
  /**
   * Cuánto se oscurece la pintura donde no hay paneles (0 = se ve entera, 1 = negro). Los paneles
   * le suman su propio velo hasta llegar siempre al mínimo que da AA (ver `veloDePanel`).
   */
  readonly velo: number
  readonly desenfoque: boolean
}

/**
 * El rango del deslizador. Abajo de 0,6 la tinta plena del chat vacío (la pregunta, la carpeta y la
 * rama, que van directo sobre la pintura) deja de llegar a 4,5:1 en el cielo de `merced`, que pide
 * 0,59; arriba de 0,9 ya no se ve el cuadro y conviene elegir «Ninguno».
 */
export const VELO_MINIMO = 0.6
export const VELO_MAXIMO = 0.9

export const FONDO_DEL_CHAT_DE_FABRICA: FondoDelChat = {
  fuente: { tipo: 'incluido', id: FONDO_INCLUIDO_DE_FABRICA },
  velo: 0.64,
  desenfoque: false
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
  const crudo = valor as { fuente?: unknown; velo?: unknown; desenfoque?: unknown }
  const velo =
    typeof crudo.velo === 'number' && Number.isFinite(crudo.velo)
      ? Math.min(VELO_MAXIMO, Math.max(VELO_MINIMO, crudo.velo))
      : FONDO_DEL_CHAT_DE_FABRICA.velo
  return {
    fuente: fuente(crudo.fuente),
    velo,
    desenfoque: crudo.desenfoque === true
  }
}

/**
 * Cuánto oscurece un panel (contando el velo de la ventana) para que su texto atenuado llegue a
 * 4,5:1 en el punto más claro del cuadro más claro.
 *
 * Medido sobre los seis óleos incluidos (`assets/fondos/FUENTE.md`), con un desenfoque de 2 px que
 * es lo que promedia un glifo. En oscuro el peor punto es el cielo de `merced` (#f9f6e7): la tinta
 * plena pide 0,59, la del 74 % (#b7b7b7) 0,75 y la del 60 % (#989898) 0,84. En claro es la sombra
 * de `merced` (#0b0804): la tinta plena pide 0,51 y #4a4a4a 0,74.
 *
 * Por eso, sobre la pintura, el texto atenuado de los paneles sube un escalón (al 74 % en oscuro,
 * #4a4a4a en claro; `paisaje.css`) y el panel se queda en 0,78: con el 60 % habría que tapar el
 * 84 % del cuadro y la ventana translúcida sería un gris liso.
 *
 * Los dos velos se componen: lo que deja ver la ventana (1 − velo) por lo que deja ver el panel
 * (1 − p) tiene que ser ≤ 0,22. Así el deslizador cambia cuánto cuadro se ve en el chat vacío y en
 * las juntas, y nunca la legibilidad de un panel.
 */
export const OSCURIDAD_DE_PANEL = 0.78

export function veloDePanel(veloDeVentana: number, oscuridad = OSCURIDAD_DE_PANEL): number {
  const deja = 1 - Math.min(0.99, Math.max(0, veloDeVentana))
  return Math.min(1, Math.max(0, 1 - (1 - oscuridad) / deja))
}
