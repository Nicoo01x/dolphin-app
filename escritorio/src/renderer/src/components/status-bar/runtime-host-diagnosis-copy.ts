import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import type { RuntimeHostDiagnosis } from '../../../../shared/remote-runtime/host-status/runtime-host-diagnosis'

export type RuntimeHostDiagnosisCopy = {
  /** Lo corto, en la fila: «Tailscale apagado». */
  label: string
  /** El título del detalle. */
  summary: string
  /** Qué hacer. */
  explanation: string
  /** Si la conexión anda igual y esto es un aviso, no un corte. */
  warning: boolean
}

const KEY = 'components.dolphin.diagnosticoHost'

/**
 * Lo que la fila de un servidor dice cuando el diagnóstico encontró algo (Nico, 20/11/2026: «que
 * la app lo diga claro en vez de quedar en silencio»). Null cuando no hay nada que decir.
 */
export function runtimeHostDiagnosisCopy(
  diagnosis: RuntimeHostDiagnosis | null | undefined,
  t: Translate = translate
): RuntimeHostDiagnosisCopy | null {
  switch (diagnosis?.reason) {
    case undefined:
    case 'connected':
      return null
    case 'tailscale-off':
      return {
        label: t(`${KEY}.tailscale.label`, 'Tailscale is off'),
        summary: t(`${KEY}.tailscale.summary`, 'Tailscale is off on this computer'),
        explanation: t(
          `${KEY}.tailscale.explanation`,
          'This server is only reachable over Tailscale, and this computer has no tailnet address. Open Tailscale and sign in; Dolphin reconnects on its own.'
        ),
        warning: false
      }
    case 'host-unreachable':
      return {
        label: t(`${KEY}.mudo.label`, 'Not answering'),
        summary: t(`${KEY}.mudo.summary`, 'The server is not answering'),
        explanation: t(
          `${KEY}.mudo.explanation`,
          'Nothing answers at the saved address. The machine may be off, or the program that served it no longer runs on that port.'
        ),
        warning: false
      }
    case 'not-dolphin':
      return {
        label: t(`${KEY}.otroPrograma.label`, 'Not Dolphin'),
        summary: t(`${KEY}.otroPrograma.summary`, 'This server is not Dolphin'),
        explanation: t(
          `${KEY}.otroPrograma.explanation`,
          'It answers{{version}}, but it is another program, so some features will be missing. To use Dolphin there, open the repo as an SSH workspace: Dolphin installs its own server.',
          { version: diagnosis.serverVersion ? ` (${diagnosis.serverVersion})` : '' }
        ),
        warning: true
      }
    case 'pairing-expired':
      return {
        label: t(`${KEY}.emparejamiento.label`, 'Pairing expired'),
        summary: t(`${KEY}.emparejamiento.summary`, 'This pairing is no longer valid'),
        explanation: t(
          `${KEY}.emparejamiento.explanation`,
          'The server answered but refused this device (it was removed or its key changed). Pair again with a new code.'
        ),
        warning: false
      }
    case 'incompatible':
      return {
        label: t(`${KEY}.incompatible.label`, 'Incompatible'),
        summary: t(`${KEY}.incompatible.summary`, 'The versions cannot talk'),
        explanation: t(
          `${KEY}.incompatible.explanation`,
          'The server answered with a protocol this version of Dolphin does not understand. Update the server or the app.'
        ),
        warning: false
      }
  }
}
