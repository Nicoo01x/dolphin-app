/**
 * Traer un tema de VS Code: su JSON entra y sale una paleta de las nuestras.
 *
 * Why se traduce a los doce roles en vez de armar un tema de Monaco a medida con sus cien scopes:
 * porque así el tema importado entra por el mismo lugar que el propio (`paleta-de-codigo.ts` →
 * `definirTemasDeDolphin`), y entonces hereda las dos decisiones que hacen que Dolphin no sea un
 * arcoíris más —el cromo sigue monocromo y los roles conservan su peso— mientras los colores pasan
 * a ser los del tema que la persona eligió. Un tema de VS Code trae además colores de interfaz
 * (`colors`): de todos esos sólo se mira el fondo y el texto del editor, y el resto se ignora a
 * propósito. Es una decisión, no una limitación: lo que se importa es la paleta del código.
 *
 * Y why un módulo de `shared`: lo usa la pantalla de ajustes (que pega el JSON), lo guarda el
 * proceso principal y lo pinta el renderer, igual que la paleta que traduce.
 */

import type { PaletaParcial, RolDeCodigo, TintaDeRol } from './paleta-de-codigo'

/** Lo que miramos de un archivo de tema de VS Code; todo lo demás se ignora. */
export type TemaDeVsCode = {
  readonly name?: unknown
  readonly type?: unknown
  readonly colors?: unknown
  readonly tokenColors?: unknown
}

type ReglaDeTema = {
  readonly scopes: readonly string[]
  readonly color: string | null
  readonly fontStyle: string | null
}

/**
 * Qué scope de TextMate alimenta cada rol nuestro, del más específico al más general.
 *
 * El orden importa: gana el primero que el tema define. Por eso `keyword.operator` está en
 * `operador` y antes que `keyword` en `clave` — un tema que pinta los dos igual da el mismo
 * resultado, y uno que los distingue se respeta.
 */
const SCOPES_POR_ROL: Readonly<Record<Exclude<RolDeCodigo, 'base'>, readonly string[]>> = {
  comentario: ['comment', 'punctuation.definition.comment'],
  puntuacion: ['punctuation', 'punctuation.separator', 'meta.brace'],
  operador: ['keyword.operator', 'punctuation.accessor'],
  clave: ['keyword.control', 'keyword', 'storage.modifier', 'storage'],
  funcion: ['entity.name.function', 'support.function', 'meta.function-call', 'variable.function'],
  tipo: [
    'entity.name.type',
    'entity.name.class',
    'support.type',
    'support.class',
    'storage.type',
    'entity.other.inherited-class'
  ],
  cadena: ['string.quoted', 'string', 'constant.character'],
  numero: ['constant.numeric', 'constant.language', 'constant'],
  expresionRegular: ['string.regexp', 'constant.regexp'],
  anotacion: ['entity.other.attribute-name', 'meta.decorator', 'entity.name.tag'],
  invalido: ['invalid', 'invalid.illegal']
}

/** Un hex de seis dígitos sin `#`, que es lo que pide Monaco; `null` si no se puede leer. */
function hexDeSeis(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null
  }
  const limpio = valor.trim().replace(/^#/, '')
  // Un `#rgb` se expande y a un `#rrggbbaa` se le saca el alfa: Monaco no lo acepta, y un tema que
  // trae transparencia en el texto se vería igual con ella descartada.
  if (/^[0-9a-fA-F]{3}$/.test(limpio)) {
    return [...limpio]
      .map((d) => d + d)
      .join('')
      .toLowerCase()
  }
  return /^[0-9a-fA-F]{6,8}$/.test(limpio) ? limpio.slice(0, 6).toLowerCase() : null
}

function leerReglas(tokenColors: unknown): ReglaDeTema[] {
  if (!Array.isArray(tokenColors)) {
    return []
  }
  return tokenColors.flatMap((entrada): ReglaDeTema[] => {
    if (!entrada || typeof entrada !== 'object') {
      return []
    }
    const { scope, settings } = entrada as { scope?: unknown; settings?: unknown }
    if (!settings || typeof settings !== 'object') {
      return []
    }
    const { foreground, fontStyle } = settings as { foreground?: unknown; fontStyle?: unknown }
    // El scope puede venir como lista, o como una cadena con comas (los dos existen en temas reales).
    const scopes = Array.isArray(scope)
      ? scope.filter((uno): uno is string => typeof uno === 'string')
      : typeof scope === 'string'
        ? scope.split(',').map((uno) => uno.trim())
        : []
    return [
      {
        scopes: scopes.filter(Boolean),
        color: hexDeSeis(foreground),
        fontStyle: typeof fontStyle === 'string' ? fontStyle : null
      }
    ]
  })
}

/**
 * La regla que manda para un scope: la que lo nombra más específicamente.
 *
 * TextMate hace coincidir por prefijo de puntos, así que `string` cubre a `string.quoted.double`.
 * Entre dos que coinciden gana la que nombra más segmentos, que es la regla de TextMate y además
 * lo que la persona espera al ver su tema.
 */
function reglaPara(reglas: readonly ReglaDeTema[], buscado: string): ReglaDeTema | null {
  let mejor: { regla: ReglaDeTema; peso: number } | null = null
  for (const regla of reglas) {
    for (const scope of regla.scopes) {
      const coincide = buscado === scope || buscado.startsWith(`${scope}.`)
      if (!coincide || regla.color === null) {
        continue
      }
      const peso = scope.split('.').length
      if (!mejor || peso > mejor.peso) {
        mejor = { regla, peso }
      }
    }
  }
  return mejor?.regla ?? null
}

function tintaDe(regla: ReglaDeTema): TintaDeRol | null {
  if (regla.color === null) {
    return null
  }
  const estilo = regla.fontStyle ?? ''
  return {
    color: regla.color,
    ...(estilo.includes('bold') ? { negrita: true } : {}),
    ...(estilo.includes('italic') ? { cursiva: true } : {})
  }
}

export type PaletaImportada = {
  /** El nombre que el tema declara, para poder decir cuál está puesto. */
  readonly nombre: string | null
  /** Si el tema se declara oscuro: decide a cuál de las dos paletas va. */
  readonly oscuro: boolean
  readonly paleta: PaletaParcial
}

/**
 * Lee un tema de VS Code ya parseado y devuelve la paleta parcial que le corresponde, o `null` si
 * eso no es un tema (ni un `tokenColors` ni un color de texto: no hay nada que traer).
 *
 * Es parcial a propósito: lo que el tema no define queda con el valor de fábrica del rol en vez de
 * apagarse. Un tema que sólo pinta cadenas y comentarios deja el resto legible.
 */
export function paletaDesdeTemaDeVsCode(crudo: unknown): PaletaImportada | null {
  if (!crudo || typeof crudo !== 'object') {
    return null
  }
  const tema = crudo as TemaDeVsCode
  const reglas = leerReglas(tema.tokenColors)
  const colores =
    tema.colors && typeof tema.colors === 'object' ? (tema.colors as Record<string, unknown>) : {}
  const paleta: Record<string, TintaDeRol> = {}
  const base = hexDeSeis(colores['editor.foreground'])
  if (base !== null) {
    paleta.base = { color: base }
  }
  for (const [rol, scopes] of Object.entries(SCOPES_POR_ROL)) {
    for (const scope of scopes) {
      const regla = reglaPara(reglas, scope)
      const tinta = regla ? tintaDe(regla) : null
      if (tinta) {
        paleta[rol] = tinta
        break
      }
    }
  }
  // Why se mira la paleta armada y no si el JSON tenía `tokenColors`: un tema con reglas que no
  // traen ningún color (o que sólo pinta cosas de la interfaz) no deja nada que aplicar, y devolver
  // un tema vacío haría que la pantalla diga «listo» sin que cambie un solo píxel.
  if (Object.keys(paleta).length === 0) {
    return null
  }
  const tipo = typeof tema.type === 'string' ? tema.type.toLowerCase() : ''
  const fondo = hexDeSeis(colores['editor.background'])
  return {
    nombre: typeof tema.name === 'string' && tema.name.trim() ? tema.name.trim() : null,
    // El `type` manda; sin él se mira el fondo, y sin fondo se asume oscuro, que es el default de
    // la app. Lo que decide es la luminancia relativa de la W3C, el mismo criterio que las etiquetas.
    oscuro: tipo === 'dark' ? true : tipo === 'light' ? false : fondo === null || esOscuro(fondo),
    paleta: paleta as PaletaParcial
  }
}

/** Si un hex de seis dígitos es oscuro, por luminancia relativa de la W3C. */
export function esOscuro(hex: string): boolean {
  const canal = (desde: number): number => {
    const valor = Number.parseInt(hex.slice(desde, desde + 2), 16) / 255
    return valor <= 0.039_28 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4) <= 0.179
}
