// The JSON header carries the unhashed worktree ID needed for history GC; raw history follows.
import { z } from 'zod'
import { DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import { hashWorktreeId } from '../../pty/history/terminal-history-id'

// fish history lives outside Dolphin's store and cannot migrate.
export const DOLPHIND_MIGRATION_SHELL_HISTORY_SHELLS = ['zsh', 'bash'] as const

export type DolphindMigrationShellHistoryShell =
  (typeof DOLPHIND_MIGRATION_SHELL_HISTORY_SHELLS)[number]

export const DOLPHIND_MIGRATION_SHELL_HISTORY_VERSION = 1
/** Bound header scanning; worktree IDs contain a repo ID and path. */
export const DOLPHIND_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES = 16 * 1024
const NEWLINE = 0x0a

const HeaderSchema = z.object({
  version: z.literal(DOLPHIND_MIGRATION_SHELL_HISTORY_VERSION),
  worktreeId: z.string().min(1),
  loginShell: z.literal(true).optional()
})

export const MAX_DOLPHIND_MIGRATION_SHELL_HISTORY_BYTES =
  DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].maxBytes

export type DolphindMigrationShellHistoryKey = {
  worktreeHash: string
  shell: DolphindMigrationShellHistoryShell
}

export type DolphindMigrationShellHistoryHeader = {
  worktreeId: string
  /** WSL bridge history uses bash_history for the distro login shell when no zsh sibling exists. */
  loginShell: boolean
  byteLength: number
}

export function dolphindMigrationShellHistoryKey(
  worktreeId: string,
  shell: DolphindMigrationShellHistoryShell
): string {
  return `${hashWorktreeId(worktreeId)}-${shell}`
}

export function shellHistoryFileName(shell: DolphindMigrationShellHistoryShell): string {
  return `${shell}_history`
}

export function parseDolphindMigrationShellHistoryKey(
  key: string
): DolphindMigrationShellHistoryKey {
  if (!DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].key.test(key)) {
    throw new Error('dolphind_migration_shell_history_key_invalid')
  }
  const [worktreeHash, shell] = key.split('-')
  const supported = DOLPHIND_MIGRATION_SHELL_HISTORY_SHELLS.find((entry) => entry === shell)
  if (!supported) {
    throw new Error('dolphind_migration_shell_history_shell_unsupported')
  }
  return { worktreeHash, shell: supported }
}

export function encodeDolphindMigrationShellHistoryHeader(
  worktreeId: string,
  options: { loginShell?: boolean } = {}
): Buffer {
  const document = {
    version: DOLPHIND_MIGRATION_SHELL_HISTORY_VERSION,
    worktreeId,
    ...(options.loginShell ? { loginShell: true } : {})
  }
  const header = Buffer.from(`${JSON.stringify(document)}\n`, 'utf8')
  if (header.length > DOLPHIND_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES) {
    throw new Error('dolphind_migration_shell_history_worktree_id_too_long')
  }
  return header
}

/** Verify the header matches the hashed key; totalBytes includes the header and must leave history bytes. */
export function parseDolphindMigrationShellHistoryHeader(
  key: string,
  head: Buffer,
  totalBytes: number
): DolphindMigrationShellHistoryHeader {
  const parsedKey = parseDolphindMigrationShellHistoryKey(key)
  const end = head.subarray(0, DOLPHIND_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES).indexOf(NEWLINE)
  if (end === -1) {
    throw new Error('dolphind_migration_shell_history_header_invalid')
  }
  const { worktreeId, loginShell } = parseHeaderLine(head.subarray(0, end))
  if (hashWorktreeId(worktreeId) !== parsedKey.worktreeHash) {
    throw new Error('dolphind_migration_shell_history_key_mismatch')
  }
  const byteLength = end + 1
  if (totalBytes <= byteLength) {
    throw new Error('dolphind_migration_shell_history_empty')
  }
  return { worktreeId, loginShell, byteLength }
}

function parseHeaderLine(line: Buffer): { worktreeId: string; loginShell: boolean } {
  try {
    const parsed = HeaderSchema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line))
    )
    if (parsed.success) {
      return { worktreeId: parsed.data.worktreeId, loginShell: parsed.data.loginShell === true }
    }
  } catch {
    // Not UTF-8 JSON; refused below like any other malformed header.
  }
  throw new Error('dolphind_migration_shell_history_header_invalid')
}
