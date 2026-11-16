import { translate } from '@/i18n/i18n'
import type { DolphinConsoleResult } from '../../../../shared/dolphin-console-types'

type Failure = Extract<DolphinConsoleResult, { ok: false }>

/**
 * Por qué no se pudo, en el idioma de la app: qué pasó y qué hacer. El detalle va tal cual: es lo
 * que hay que leer para arreglarlo —dónde se buscó, la última línea de error— o lo que contestó
 * Dolphin, con sus palabras.
 */
export function dolphinFailureMessage(failure: Failure): string {
  const value0 = failure.detail ?? ''
  switch (failure.code) {
    case 'not-found':
      return translate(
        'auto.components.dolphin.failure.notFound',
        'Dolphin is not in {{value0}}: run npm install there, or point DOLPHIN_APP_DIR to its folder.',
        { value0 }
      )
    case 'not-installed':
      return translate(
        'auto.components.dolphin.failure.notInstalled',
        "This installation doesn't include the Dolphin core, which is what runs the console. If you have the dolphin-app repo, run npm install and npm run ui:build there, set DOLPHIN_APP_DIR to its folder and open the app again."
      )
    case 'not-built':
      return translate(
        'auto.components.dolphin.failure.notBuilt',
        'The Dolphin console is not built: run npm run ui:build in dolphin-app and try again.'
      )
    case 'exited':
      return translate(
        'auto.components.dolphin.failure.exited',
        'The Dolphin console closed while starting ({{value0}}). Check that error and try again.',
        { value0 }
      )
    case 'timeout':
      return translate(
        'auto.components.dolphin.failure.timeout',
        'The Dolphin console did not answer in {{value0}} s. Try again; if it keeps happening, close the app and open it again.',
        { value0 }
      )
    case 'unreachable':
      return translate(
        'auto.components.dolphin.failure.unreachable',
        'Could not talk to Dolphin: {{value0}}',
        { value0 }
      )
    case 'rejected':
      return value0
    case 'invalid-request':
      return translate(
        'auto.components.dolphin.failure.invalidRequest',
        'The request to Dolphin came incomplete.'
      )
    case 'unknown-project':
      return translate(
        'auto.components.dolphin.failure.unknownProject',
        '{{value0}} is not a project or a workspace of the app.',
        { value0 }
      )
    case 'nothing-to-send':
      return translate(
        'auto.components.dolphin.failure.nothingToSend',
        'No annotation says what to change: write the request in the annotation.'
      )
  }
}
