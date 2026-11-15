import { getDolphinPushGatewayUrl } from '../dolphin-profiles/cloud-auth/profile-cloud-auth-config'
import { DesktopPushService } from '../runtime/push/desktop-push-service'
import type { DolphinRuntimeService } from '../runtime/dolphin-runtime'
import type { DolphinRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'
import { mainProcessState as state } from './main-process-state'

// Push authenticates by host keypair, so accountless hosts must register phones too; shared startup state supplies the runtime in both modes.
export function startDesktopPushService(runtimeRpc: DolphinRuntimeRpcServer): void {
  const runtime: DolphinRuntimeService | null = state.runtime
  if (!runtime) {
    console.warn('[push] Background push startup skipped: runtime not started')
    return
  }
  const gatewayUrl = getDolphinPushGatewayUrl()
  if (!gatewayUrl) {
    return
  }
  try {
    const pushService = DesktopPushService.create({ runtime, runtimeRpc, gatewayUrl })
    pushService?.start()
    state.desktopPushService = pushService
  } catch (error) {
    console.warn(
      '[push] Background push startup unavailable:',
      error instanceof Error ? error.message : String(error)
    )
  }
}
