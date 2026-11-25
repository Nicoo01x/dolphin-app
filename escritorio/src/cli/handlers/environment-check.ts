import { networkInterfaces } from 'node:os'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getDefaultUserDataPath, RuntimeClient, RuntimeClientError } from '../runtime-client'
import { resolveEnvironment } from '../runtime/environments'
import { getPreferredPairedRuntimeConnection } from '../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  describeRuntimeHostDiagnosis,
  diagnoseAnsweredRuntimeHost,
  diagnoseFailedRuntimeHost,
  localTailnetStateFromInterfaces,
  type LocalTailnetState,
  type RuntimeHostDiagnosis
} from '../../shared/remote-runtime/host-status/runtime-host-diagnosis'
import type { RuntimeStatus } from '../../shared/runtime-session-contracts'

export type EnvironmentCheckResult = RuntimeHostDiagnosis & {
  environment: { id: string; name: string; endpoint: string }
  localTailnet: LocalTailnetState
  title: string
  detail: string
  error?: { code: string; message: string }
}

function localTailnet(): LocalTailnetState {
  try {
    return localTailnetStateFromInterfaces(networkInterfaces())
  } catch {
    return 'unknown'
  }
}

/**
 * `dolphin environment check`: conecta de verdad al servidor emparejado y dice por qué no anda.
 *
 * `environment show` sólo lee el archivo de emparejamientos; `status --environment` imprime el
 * mensaje crudo. Esto separa Tailscale apagado, servidor mudo, otro programa (el servidor de la base) y
 * emparejamiento vencido, con el mismo diagnóstico que muestra la app. Sale con 1 salvo «connected».
 */
export async function checkEnvironment(
  selector: string,
  callStatus: () => Promise<{ result: RuntimeStatus }>
): Promise<EnvironmentCheckResult> {
  const environment = resolveEnvironment(getDefaultUserDataPath(), selector)
  const endpoint = getPreferredPairedRuntimeConnection(environment).endpoint
  const tailnet = localTailnet()
  let diagnosis: RuntimeHostDiagnosis
  let error: EnvironmentCheckResult['error']
  try {
    diagnosis = diagnoseAnsweredRuntimeHost((await callStatus()).result)
  } catch (caught) {
    const code =
      caught instanceof RuntimeClientError || (caught instanceof Error && 'code' in caught)
        ? String((caught as { code: unknown }).code)
        : 'runtime_unavailable'
    const message = caught instanceof Error ? caught.message : String(caught)
    error = { code, message }
    diagnosis = diagnoseFailedRuntimeHost(
      { id: 'status.get', ok: false, error: { code, message } },
      endpoint,
      tailnet
    ) ?? { reason: 'host-unreachable' }
  }
  const copy = describeRuntimeHostDiagnosis(diagnosis, { endpoint })
  return {
    ...diagnosis,
    environment: { id: environment.id, name: environment.name, endpoint },
    localTailnet: tailnet,
    title: copy.title,
    detail: copy.detail,
    ...(error ? { error } : {})
  }
}

export function formatEnvironmentCheck(result: EnvironmentCheckResult): string {
  const mark = result.reason === 'connected' ? '✓' : result.reason === 'not-dolphin' ? '!' : '✗'
  const lines = [
    `${result.environment.name}  ${result.environment.endpoint}`,
    `${mark} ${result.title}`,
    `  ${result.detail}`
  ]
  if (result.error) {
    lines.push(`  (${result.error.code}: ${result.error.message})`)
  }
  return lines.join('\n')
}

/** Lo que un sondeo puede esperar: el handshake tiene su propio tope de 12 s; esto cubre el resto. */
const CHECK_TIMEOUT_MS = 20_000

/**
 * Why its own client: los comandos `environment` ignoran la selección remota a propósito (leen el
 * almacén de emparejamientos local), así que el `client` del dispatcher habla con este Dolphin, no
 * con el servidor que hay que revisar.
 */
function statusOfEnvironment(selector: string): () => Promise<{ result: RuntimeStatus }> {
  return () => {
    const environment = resolveEnvironment(getDefaultUserDataPath(), selector)
    const remote = new RuntimeClient(
      getDefaultUserDataPath(),
      CHECK_TIMEOUT_MS,
      null,
      environment.id
    )
    return remote.call<RuntimeStatus>('status.get')
  }
}

export const ENVIRONMENT_CHECK_HANDLERS: Record<string, CommandHandler> = {
  'environment check': async ({ flags, json }) => {
    const selector = flags.get('environment')
    if (typeof selector !== 'string' || selector.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --environment')
    }
    const result = await checkEnvironment(selector, statusOfEnvironment(selector))
    printResult(
      { id: 'local', ok: true, result, _meta: { runtimeId: 'local' } },
      json,
      formatEnvironmentCheck
    )
    if (result.reason !== 'connected') {
      process.exitCode = 1
    }
  }
}
