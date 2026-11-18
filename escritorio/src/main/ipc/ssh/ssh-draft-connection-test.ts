import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { SshTarget, SshTargetCreateInput } from '../../../shared/ssh-types'
import { errorMessage } from '../../../shared/error-message'
import {
  assertSshConnectsNotFenced,
  runSshTestConnectionProbe
} from './ssh-connect-attempt-registry'
import { connectionManager } from './ssh-ipc-context'
import { describeSshConnectFailure } from '../../ssh/connection/ssh-connect-failure-next-step'
import { isSshSessionStartFailure } from '../../ssh/connection/ssh-session-start-failure'

export const SSH_DRAFT_CONNECTION_TEST_CHANNEL = 'ssh:testDraftConnection'

export type SshDraftConnectionTestResult = { success: true } | { success: false; error: string }

/**
 * Try the host the person is about to save, before it is saved.
 *
 * Why a throwaway id and not a saved target: saving first and removing on failure would leave
 * a removed-host tombstone behind, which hides the alias from the ~/.ssh/config import. The
 * probe runs like Test connection does (no state published, no server set up) and closes.
 */
export async function testSshDraftConnection(
  input: SshTargetCreateInput
): Promise<SshDraftConnectionTestResult> {
  const draft: SshTarget = { ...input, id: `draft-${randomUUID()}` }
  try {
    await runSshTestConnectionProbe(draft.id, async () => {
      assertSshConnectsNotFenced()
      try {
        await connectionManager!.connect(draft, { probe: true })
      } finally {
        await connectionManager!.disconnect(draft.id)
      }
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      // The next step leads, as on a failed connect; SSH's raw reason follows in parentheses.
      error:
        error instanceof Error && isSshSessionStartFailure(error)
          ? describeSshConnectFailure(error)
          : errorMessage(error)
    }
  }
}

export function registerSshDraftConnectionTestHandler(): void {
  ipcMain.handle(
    SSH_DRAFT_CONNECTION_TEST_CHANNEL,
    async (
      _event,
      args: { target?: SshTargetCreateInput }
    ): Promise<SshDraftConnectionTestResult> => {
      const target = args?.target
      if (!target || typeof target.host !== 'string' || !target.host.trim()) {
        return { success: false, error: 'Missing SSH host.' }
      }
      return testSshDraftConnection(target)
    }
  )
}
