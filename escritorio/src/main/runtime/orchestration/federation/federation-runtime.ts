import type { DolphinRuntimeService } from '../../dolphin-runtime'

export type FederationRuntime = Pick<
  DolphinRuntimeService,
  | 'syncOrchestrationFederatedDispatch'
  | 'getOrchestrationDb'
  | 'resolveOrchestrationWorkerServer'
  | 'callOrchestrationWorkerServer'
  | 'notifyMessageArrived'
  | 'reconcileLegacyWorkerTerminals'
>
