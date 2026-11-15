import { DolphinRuntimeService } from '../../../../runtime/dolphin-runtime'

export class ReceivingRuntime extends DolphinRuntimeService {
  override getOrchestrationDbIfAvailable() {
    return super.getOrchestrationDbIfAvailable()
  }
  mailTarget(handle: string) {
    return this.resolveStructuredMailboxTarget(handle)
  }
}
