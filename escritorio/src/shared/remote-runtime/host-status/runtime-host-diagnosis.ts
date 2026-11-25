import type { RuntimeRpcFailure } from '../../runtime-rpc-envelope'
import { isTailscaleEndpoint } from '../remote-runtime-tailscale-hint'

/**
 * Why a saved server is not working, in words a person can act on.
 *
 * Pedido de Nico (20/11/2026): el entorno «VPS-OpenClaw» quedaba en silencio. Había tres capas a
 * la vez —Tailscale apagado en la PC, el puerto atendido por el servidor viejo de la base y no por un Dolphin— y
 * la app sólo mostraba «Reconectando». Esto separa cada caso:
 *
 * - `tailscale-off`: la dirección es de Tailscale (100.64.0.0/10, fd7a:115c:a1e0::/48, *.ts.net)
 *   y esta máquina no tiene ninguna dirección de la tailnet: Tailscale está apagado o sin sesión.
 * - `host-unreachable`: la red está, pero el servidor no contesta en ese puerto.
 * - `not-dolphin`: contestó, pero es otro programa (el servidor de la base anuncia sus capacidades con otro prefijo).
 * - `pairing-expired`: contestó y rechazó este dispositivo; hay que volver a emparejar.
 * - `incompatible`: contestó con un protocolo que esta versión no entiende.
 *
 * Es puro: quien llama sabe el endpoint, la respuesta y si hay Tailscale local.
 */
export type RuntimeHostDiagnosisReason =
  | 'connected'
  | 'tailscale-off'
  | 'host-unreachable'
  | 'not-dolphin'
  | 'pairing-expired'
  | 'incompatible'

export type RuntimeServerProduct = 'dolphin' | 'base' | 'unknown'

export type RuntimeHostDiagnosis = {
  reason: RuntimeHostDiagnosisReason
  /** Lo que el servidor dijo ser, cuando contestó. */
  product?: RuntimeServerProduct
  /** Su versión, cuando contestó. */
  serverVersion?: string | null
}

/** Si hay tailnet en esta máquina: `unknown` cuando no se pudo mirar. */
export type LocalTailnetState = 'up' | 'down' | 'unknown'

/** Lo mínimo del status para saber qué programa contestó. */
type AnsweredStatus = { capabilities?: readonly string[] | null; appVersion?: string | null }

const DOLPHIN_CAPABILITY_PREFIX = 'dolphind.'
const BASE_CAPABILITY_PREFIX = 'orcad.'

/** Dolphin anuncia capacidades `dolphind.*`; el programa del que nació, las mismas con el prefijo de abajo. */
export function runtimeServerProduct(
  capabilities: readonly string[] | null | undefined
): RuntimeServerProduct {
  if (!capabilities || capabilities.length === 0) {
    return 'unknown'
  }
  if (capabilities.some((capability) => capability.startsWith(DOLPHIN_CAPABILITY_PREFIX))) {
    return 'dolphin'
  }
  return capabilities.some((capability) => capability.startsWith(BASE_CAPABILITY_PREFIX))
    ? 'base'
    : 'unknown'
}

const PAIRING_REFUSED_CODES = new Set([
  'unauthorized',
  'forbidden',
  'device_revoked',
  'bad_proof',
  'bad_auth'
])

const INCOMPATIBLE_CODES = new Set([
  'invalid_runtime_response',
  'protocol_version_mismatch',
  'method_not_found',
  'unsupported_method'
])

/** No llegó a contestar: red, puerto cerrado o tiempo agotado. */
const UNREACHED_CODES = new Set([
  'remote_runtime_unavailable',
  'runtime_unavailable',
  'runtime_timeout',
  'timeout',
  'reconnecting'
])

/** La clasificación de un status que contestó bien. */
export function diagnoseAnsweredRuntimeHost(status: AnsweredStatus): RuntimeHostDiagnosis {
  const product = runtimeServerProduct(status.capabilities)
  return {
    // `unknown` no alcanza para acusar: un Dolphin viejo puede no anunciar capacidades.
    reason: product === 'base' ? 'not-dolphin' : 'connected',
    product,
    serverVersion: status.appVersion ?? null
  }
}

/** La clasificación de un status que falló; null cuando el fallo no dice nada útil todavía. */
export function diagnoseFailedRuntimeHost(
  failure: RuntimeRpcFailure,
  endpoint: string | null | undefined,
  localTailnet: LocalTailnetState
): RuntimeHostDiagnosis | null {
  const code = failure.error.code
  if (PAIRING_REFUSED_CODES.has(code)) {
    return { reason: 'pairing-expired' }
  }
  if (INCOMPATIBLE_CODES.has(code)) {
    return { reason: 'incompatible' }
  }
  if (!UNREACHED_CODES.has(code)) {
    return null
  }
  return isTailscaleEndpoint(endpoint) && localTailnet === 'down'
    ? { reason: 'tailscale-off' }
    : { reason: 'host-unreachable' }
}

/** Tailscale da a cada nodo una IPv4 de 100.64.0.0/10 o una IPv6 de fd7a:115c:a1e0::/48. */
const TAILNET_IPV4_RE = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
const TAILNET_IPV6_RE = /^fd7a:115c:a1e0:/i

/**
 * Si esta máquina está en una tailnet, mirando sus direcciones (lo que da `os.networkInterfaces()`).
 *
 * Por qué así y no `tailscale status`: el ejecutable no siempre está en el PATH (en la PC de Nico
 * vive en D:\Tailscale) y lanzar procesos en cada sondeo es caro. Con Tailscale apagado o sin
 * sesión el adaptador sigue existiendo, pero sin ninguna dirección de la tailnet.
 */
export function localTailnetStateFromInterfaces(
  interfaces: Record<string, readonly { address: string }[] | undefined>
): LocalTailnetState {
  const addresses = Object.values(interfaces).flatMap((entries) => entries ?? [])
  if (addresses.length === 0) {
    return 'unknown'
  }
  return addresses.some(
    ({ address }) => TAILNET_IPV4_RE.test(address) || TAILNET_IPV6_RE.test(address)
  )
    ? 'up'
    : 'down'
}

/** El texto para una persona, en castellano: lo usan el CLI y el detalle de la app. */
export function describeRuntimeHostDiagnosis(
  diagnosis: RuntimeHostDiagnosis,
  context: { endpoint?: string | null; environmentName?: string } = {}
): { title: string; detail: string } {
  const where = context.endpoint ? ` (${context.endpoint})` : ''
  switch (diagnosis.reason) {
    case 'connected':
      return {
        title: 'Conectado',
        detail: `El servidor contesta y es Dolphin${diagnosis.serverVersion ? ` ${diagnosis.serverVersion}` : ''}.`
      }
    case 'tailscale-off':
      return {
        title: 'Tailscale está apagado en esta máquina',
        detail:
          `El servidor${where} sólo se alcanza por Tailscale y esta máquina no tiene dirección de la ` +
          'tailnet. Abrí Tailscale e iniciá sesión; la app se reconecta sola.'
      }
    case 'host-unreachable':
      return {
        title: 'El servidor no contesta',
        detail:
          `Nada responde en${where || ' la dirección guardada'}. Puede estar apagado, o el programa ` +
          'que lo atendía ya no corre en ese puerto.'
      }
    case 'not-dolphin':
      return {
        title: 'Ese servidor no es Dolphin',
        detail:
          `Contesta${where}, pero es otro programa` +
          `${diagnosis.serverVersion ? ` ${diagnosis.serverVersion}` : ''}, no un servidor de Dolphin. ` +
          'Algunas funciones no van a estar. Para usar Dolphin ahí, abrí el repo como espacio de ' +
          'trabajo SSH: la app instala su propio servidor.'
      }
    case 'pairing-expired':
      return {
        title: 'El emparejamiento ya no vale',
        detail:
          'El servidor contestó pero rechazó este dispositivo (lo quitaron o cambió su clave). ' +
          'Volvé a emparejar con un código nuevo.'
      }
    case 'incompatible':
      return {
        title: 'Versiones que no se entienden',
        detail:
          'El servidor contestó con un protocolo que esta versión de Dolphin no entiende. ' +
          'Actualizá el servidor o la app.'
      }
  }
}
