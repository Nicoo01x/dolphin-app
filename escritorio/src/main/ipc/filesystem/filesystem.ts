import type { Store } from '../../persistence/loading-store/store'
import type { CommitMessageAgentEnvironmentResolvers } from '../../text-generation/commit-message-agent-environment'
import { registerLocalLogTailHandlers } from '../local-log-tail'
import { createSenderScopedRequestCancellations } from '../sender-scoped-request-cancellation'
import {
  createFilesystemHandlerContext,
  type FilesystemHandlerContext
} from './filesystem-handler-context'
import { registerFilesystemReadHandlers } from './filesystem-read-handlers'
import { registerFilesystemDownloadHandlers } from './filesystem-download-handlers'
import { registerFilesystemWriteHandlers } from './filesystem-write-handlers'
import { registerFilesystemSearchHandlers } from './filesystem-search-handlers'
import { registerFilesystemGitStatusHandlers } from './filesystem-git-status-handlers'
import { registerFilesystemGitCommitHandlers } from './filesystem-git-commit-handlers'
import { registerFilesystemGitCommitActionHandlers } from './filesystem-git-commit-action-handlers'
import { registerFilesystemGitCommitGenerationHandlers } from './filesystem-git-commit-generation-handlers'
import { registerFilesystemGitModelDiscoveryHandlers } from './filesystem-git-model-discovery-handlers'
import { registerFilesystemGitPullRequestGenerationHandlers } from './filesystem-git-pull-request-generation-handlers'
import { registerFilesystemGitRemoteHandlers } from './filesystem-git-remote-handlers'
import { registerFilesystemGitDiffHandlers } from './filesystem-git-diff-handlers'
import { registerFilesystemGitIndexHandlers } from './filesystem-git-index-handlers'
import { registerFilesystemGitUrlHandlers } from './filesystem-git-url-handlers'
// Dolphin: Cmd+K en el editor. Vive acá y no en un módulo propio porque usa la misma resolución
// de ajustes y el mismo destino local que el mensaje de commit, que son de este contexto.
import { registerFilesystemInlineEditHandlers } from './filesystem-inline-edit-handlers'

export function registerFilesystemHandlers(
  store: Store,
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  const context: FilesystemHandlerContext = createFilesystemHandlerContext(
    store,
    commitMessageAgentEnv,
    createSenderScopedRequestCancellations(),
    createSenderScopedRequestCancellations()
  )

  registerFilesystemReadHandlers(context)
  registerFilesystemDownloadHandlers(context)
  registerFilesystemWriteHandlers(context)
  registerFilesystemSearchHandlers(context)
  registerFilesystemGitStatusHandlers(context)
  registerFilesystemGitCommitHandlers(context)
  registerFilesystemGitCommitActionHandlers(context)
  registerFilesystemGitCommitGenerationHandlers(context)
  registerFilesystemGitModelDiscoveryHandlers(context)
  registerFilesystemGitPullRequestGenerationHandlers(context)
  registerFilesystemGitRemoteHandlers(context)
  registerFilesystemGitDiffHandlers(context)
  registerFilesystemGitIndexHandlers(context)
  registerFilesystemGitUrlHandlers(context)
  registerFilesystemInlineEditHandlers(context)
  registerLocalLogTailHandlers(store)
}
