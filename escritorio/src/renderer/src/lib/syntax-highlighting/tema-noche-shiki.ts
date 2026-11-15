import type { ThemeRegistration } from 'shiki/core'
import type { PaletaDeCodigo } from '../../../../shared/paleta-de-codigo'
import {
  CROMO_NOCHE_CLARO,
  CROMO_NOCHE_OSCURO,
  PALETA_NOCHE_CLARA,
  PALETA_NOCHE_OSCURA,
  type CromoDeCodigo
} from '../../../../shared/tema-de-codigo'

/**
 * Dolphin Noche para shiki: los bloques de código y los diffs del chat con los mismos colores que
 * el editor. Los scopes son los de TextMate (los mismos que leen Light+ y Dark+), y acá sí se
 * distingue lo que Monaco no puede: las propiedades y los métodos van en un azul más pálido que
 * los nombres, como en la referencia.
 */
export const TEMA_NOCHE_OSCURO_SHIKI = 'dolphin-noche-oscuro'
export const TEMA_NOCHE_CLARO_SHIKI = 'dolphin-noche-claro'

type ReglaTextMate = {
  scope: string[]
  settings: { foreground: string; fontStyle?: string }
}

function regla(scope: string[], color: string, cursiva = false): ReglaTextMate {
  return {
    scope,
    settings: { foreground: `#${color}`, ...(cursiva ? { fontStyle: 'italic' } : {}) }
  }
}

/** La propiedad, un paso más pálida que el nombre: la mezcla con el texto al 35 %. */
function masPalido(color: string, hacia: string): string {
  const canal = (hex: string, i: number): number => Number.parseInt(hex.slice(i, i + 2), 16)
  return [0, 2, 4]
    .map((i) => Math.round(canal(color, i) * 0.65 + canal(hacia, i) * 0.35))
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('')
}

function temaShiki(
  nombre: string,
  tipo: 'dark' | 'light',
  paleta: PaletaDeCodigo,
  cromo: CromoDeCodigo
): ThemeRegistration {
  return {
    name: nombre,
    type: tipo,
    colors: { 'editor.background': `#${cromo.fondo}`, 'editor.foreground': `#${cromo.texto}` },
    tokenColors: [
      regla(['comment', 'punctuation.definition.comment'], paleta.comentario.color, true),
      regla(
        [
          'keyword',
          'storage',
          'storage.type',
          'storage.modifier',
          'keyword.control',
          'keyword.operator.new',
          'keyword.operator.expression',
          'variable.language'
        ],
        paleta.clave.color
      ),
      regla(['keyword.operator', 'punctuation', 'meta.brace'], paleta.puntuacion.color),
      regla(
        ['variable', 'variable.other', 'variable.parameter', 'meta.definition.variable'],
        paleta.base.color
      ),
      regla(
        ['variable.other.property', 'variable.other.object.property', 'support.variable.property'],
        masPalido(paleta.base.color, cromo.texto)
      ),
      regla(['entity.name.function', 'support.function'], paleta.funcion.color),
      regla(
        [
          'entity.name.type',
          'entity.name.class',
          'support.type',
          'support.class',
          'entity.other.inherited-class'
        ],
        paleta.tipo.color
      ),
      regla(['entity.name.tag'], paleta.clave.color),
      regla(['entity.other.attribute-name'], paleta.base.color),
      regla(['string', 'string.template', 'punctuation.definition.string'], paleta.cadena.color),
      regla(['string.regexp'], paleta.expresionRegular.color, true),
      regla(['constant.numeric', 'constant.language', 'constant.character'], paleta.numero.color),
      regla(['meta.decorator', 'entity.name.function.decorator'], paleta.anotacion.color),
      regla(['markup.heading', 'markup.bold'], cromo.texto),
      regla(['markup.inserted'], cromo.agregadoMarca),
      regla(['markup.deleted'], cromo.quitadoMarca),
      regla(['invalid'], paleta.invalido.color)
    ]
  }
}

export const TEMAS_NOCHE_SHIKI = [
  temaShiki(TEMA_NOCHE_OSCURO_SHIKI, 'dark', PALETA_NOCHE_OSCURA, CROMO_NOCHE_OSCURO),
  temaShiki(TEMA_NOCHE_CLARO_SHIKI, 'light', PALETA_NOCHE_CLARA, CROMO_NOCHE_CLARO)
] as const
