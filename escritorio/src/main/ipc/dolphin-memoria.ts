import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Store } from '../persistence/loading-store/store'
import { projectMemoryRepoPath } from '../agent-hooks/project-agent-memory-repo'
import {
  forgetRememberedProjectMemory,
  REMEMBER_MAX_CHARS,
  rememberProjectMemory
} from '../agent-hooks/project-agent-memory-remember'
import type { DolphinForgetResult, DolphinRememberResult } from '../../shared/dolphin-memoria-types'
import { isTrustedUIRenderer } from './ui'

const RememberSchema = z.object({
  worktreeId: z.string().min(1).max(500),
  // Un poco de holgura: el límite real se mide sobre el texto ya sin espacios de más.
  text: z.string().max(REMEMBER_MAX_CHARS * 4),
  porQue: z.string().max(300)
})
const ForgetSchema = z.object({ worktreeId: z.string().min(1).max(500), id: z.string().max(100) })

/** «Recordar esto» desde un mensaje del chat, y su «Deshacer». */
export function registerDolphinMemoryHandlers(store: Store): void {
  ipcMain.handle(
    'dolphin:memoria:recordar',
    async (event, request: unknown): Promise<DolphinRememberResult> => {
      const parsed = RememberSchema.safeParse(request)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return { ok: false, reason: 'invalid-request' }
      }
      const repoPath = projectMemoryRepoPath(store, parsed.data.worktreeId)
      if (!repoPath) {
        return { ok: false, reason: 'no-project' }
      }
      try {
        return await rememberProjectMemory(repoPath, parsed.data.text, parsed.data.porQue)
      } catch {
        return { ok: false, reason: 'write-failed' }
      }
    }
  )
  ipcMain.handle(
    'dolphin:memoria:olvidar',
    async (event, request: unknown): Promise<DolphinForgetResult> => {
      const parsed = ForgetSchema.safeParse(request)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return { ok: false }
      }
      const repoPath = projectMemoryRepoPath(store, parsed.data.worktreeId)
      try {
        return {
          ok: repoPath ? await forgetRememberedProjectMemory(repoPath, parsed.data.id) : false
        }
      } catch {
        return { ok: false }
      }
    }
  )
}
