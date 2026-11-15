import { translate } from '@/i18n/i18n'
import type { AccionDePaso, DetalleDePaso, ResultadoDePaso, TipoDePaso } from './pasos'

/**
 * Las palabras de la tarjeta «Lo que hizo», del catálogo de traducciones. Las frases las arma
 * `pasos.ts` con datos (acción, objeto, detalle); acá se dicen en el idioma de la persona.
 */

export function verboDe(accion: AccionDePaso): string {
  switch (accion) {
    case 'leyo':
      return translate('auto.components.dolphin.loQueHizo.accion.leyo', 'Read')
    case 'busco':
      return translate('auto.components.dolphin.loQueHizo.accion.busco', 'Searched for')
    case 'corrio':
      return translate('auto.components.dolphin.loQueHizo.accion.corrio', 'Ran')
    case 'edito':
      return translate('auto.components.dolphin.loQueHizo.accion.edito', 'Edited')
    case 'creo':
      return translate('auto.components.dolphin.loQueHizo.accion.creo', 'Created')
    case 'borro':
      return translate('auto.components.dolphin.loQueHizo.accion.borro', 'Deleted')
    case 'movio':
      return translate('auto.components.dolphin.loQueHizo.accion.movio', 'Moved')
  }
}

/** El tipo, a la derecha del paso y en tinta suave. */
export function tipoDe(tipo: TipoDePaso): string {
  switch (tipo) {
    case 'leyo':
      return translate('auto.components.dolphin.loQueHizo.tipo.leyo', 'Read')
    case 'busco':
      return translate('auto.components.dolphin.loQueHizo.tipo.busco', 'Searched')
    case 'corrio':
      return translate('auto.components.dolphin.loQueHizo.tipo.corrio', 'Ran')
    case 'edito':
      return translate('auto.components.dolphin.loQueHizo.tipo.edito', 'Edited')
  }
}

/** El resultado, a la derecha y en color: rojo lo que falló, verde el arreglo. */
export function resultadoDe(resultado: ResultadoDePaso): string {
  return resultado === 'fallo'
    ? translate('auto.components.dolphin.loQueHizo.resultado.fallo', 'Failed')
    : translate('auto.components.dolphin.loQueHizo.resultado.arreglo', 'Fix ready')
}

export function detalleDe(detalle: DetalleDePaso): string {
  switch (detalle.tipo) {
    case 'fallaron':
      return translate('auto.components.dolphin.loQueHizo.detalle.fallaron', '{{count}} failed', {
        count: detalle.n,
        defaultValue_one: '{{count}} failed'
      })
    case 'pasaron':
      return translate('auto.components.dolphin.loQueHizo.detalle.pasaron', '{{count}} passed', {
        count: detalle.n,
        defaultValue_one: '{{count}} passed'
      })
    case 'codigo':
      return translate(
        'auto.components.dolphin.loQueHizo.detalle.codigo',
        'exited with {{value0}}',
        {
          value0: detalle.n
        }
      )
    case 'fallo':
      return translate('auto.components.dolphin.loQueHizo.detalle.fallo', 'failed')
    case 'lineas':
      return `+${detalle.mas} −${detalle.menos}`
  }
}

export function resumenDeCabecera(
  motor: string,
  archivos: number,
  segundos: number | null
): string {
  const partes = [motor]
  if (archivos > 0) {
    partes.push(
      translate('auto.components.dolphin.loQueHizo.archivos', '{{count}} files', {
        count: archivos,
        defaultValue_one: '{{count}} file'
      })
    )
  }
  if (segundos !== null) {
    partes.push(
      segundos < 60
        ? translate('auto.components.dolphin.loQueHizo.segundos', '{{value0}} s', {
            value0: segundos
          })
        : translate('auto.components.dolphin.loQueHizo.minutos', '{{value0}} min {{value1}} s', {
            value0: Math.floor(segundos / 60),
            value1: segundos % 60
          })
    )
  }
  return partes.join(' · ')
}
