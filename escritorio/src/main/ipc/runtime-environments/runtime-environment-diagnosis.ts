import { networkInterfaces } from 'node:os'
import {
  diagnoseAnsweredRuntimeHost,
  diagnoseFailedRuntimeHost,
  localTailnetStateFromInterfaces,
  type LocalTailnetState,
  type RuntimeHostDiagnosis
} from '../../../shared/remote-runtime/host-status/runtime-host-diagnosis'
import type { RuntimeHostStatusResponse } from '../../../shared/remote-runtime/host-status/runtime-host-status'

/** Si esta máquina está en la tailnet ahora; leer las interfaces no lanza procesos. */
export function readLocalTailnetState(): LocalTailnetState {
  try {
    return localTailnetStateFromInterfaces(networkInterfaces())
  } catch {
    return 'unknown'
  }
}

/** El diagnóstico de un sondeo de status, para el snapshot que ve la app. */
export function diagnoseRuntimeEnvironmentResponse(
  response: RuntimeHostStatusResponse,
  endpoint: string | null | undefined,
  localTailnet: () => LocalTailnetState = readLocalTailnetState
): RuntimeHostDiagnosis | null {
  return response.ok
    ? diagnoseAnsweredRuntimeHost(response.result)
    : diagnoseFailedRuntimeHost(response, endpoint, localTailnet())
}
