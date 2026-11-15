import { RpcDispatcher } from '../../dispatcher'
import type { RpcRequest } from '../../core'
import type { DolphinRuntimeService } from '../../../dolphin-runtime'
import { REPO_METHODS } from './repo'

export function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

export function repoDispatcher(
  runtime: Pick<DolphinRuntimeService, 'getRuntimeId'> & Partial<DolphinRuntimeService>
) {
  return new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: These RPC cases supply every runtime method their handlers and envelope access.
    runtime: runtime as DolphinRuntimeService,
    methods: REPO_METHODS
  })
}
