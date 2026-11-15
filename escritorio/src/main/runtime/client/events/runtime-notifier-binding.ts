import type { RuntimeNotifier } from './runtime-notifier-contract'
import { DolphinRuntimeWithPtyController } from '../../terminal/lifecycle/dolphin-runtime-pty-controller'

export abstract class RuntimeNotifierBinding extends DolphinRuntimeWithPtyController {
  setNotifier(notifier: RuntimeNotifier | null): void {
    this.notifier = notifier
    if (notifier) {
      this.repositoryForkBackfill.start()
    }
  }

  protected countTerminalSideEffectConsumingClientEventListeners(): number {
    return this.clientEvents.countTerminalSideEffectConsumers()
  }
}
