import { createHash, randomUUID } from 'node:crypto'

import {
  DOLPHIND_MIGRATION_MANIFEST_VERSION,
  parseDolphindMigrationManifest
} from '../../../shared/dolphind-migration/dolphind-migration-manifest-validation'

import type {
  DolphindMigrationCatalogPayload,
  DolphindMigrationManifest
} from '../../../shared/dolphind-migration/dolphind-migration-manifest'

import { DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { DolphindMigrationBlobDescriptor } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import {
  dolphindMigrationAutomationRunHistoryBlob,
  serializeDolphindMigrationAutomationRunHistory,
  withDolphindMigrationAutomationRunHistory
} from '../../../shared/dolphind-migration/dolphind-migration-automation-run-history'

import type { SshTarget } from '../../../shared/ssh-types'
import type { Store } from '../loading-store/store'
import { collectDolphindMigrationSourceCatalog } from './dolphind-source-catalog'
import { computeDolphindMigrationManifestSha256 } from '../../dolphind/dolphind-migration-manifest-digest'
import {
  IDENTITY_DOLPHIND_MIGRATION_PATH_REWRITER,
  rewriteDolphindMigrationPayloadPaths
} from './path-rewrite/dolphind-migration-path-rewrite'

import type { DolphindMigrationPathRewriter } from './path-rewrite/dolphind-migration-path-rewrite'
import {
  DOLPHIND_MIGRATION_MANIFEST_TOO_LARGE,
  describeOversizedDolphindMigrationPayload,
  formatKib
} from '../../managed-server/migration/catalog/dolphind-migration-payload-capacity'

import { hasDormantState } from './dolphind-migration-dormant-state'

export type DolphindMigrationExportStore = Pick<
  Store,
  | 'collectDolphindMigrationSourceDormantState'
  | 'getFolderWorkspaces'
  | 'getProjectGroups'
  | 'getRepos'
> & {
  /** Groups the server's record wins for: still read for row ownership, never exported. */
  serverOwnedProjectGroupIds?: ReadonlySet<string>
}

export type DolphindMigrationManifestExportOptions = {
  migrationId?: string
  now?: () => Date
  destinationEnvironmentId?: string
  onlyCatalog?: DolphindMigrationCatalogIds
  /** Maps source paths to destination paths before signing; identity for an SSH host. */
  rewrite?: DolphindMigrationPathRewriter
  /** Re-export a journal written before run history moved out of the manifest, as it was signed. */
  inlineAutomationRuns?: boolean
}

export type DolphindMigrationExportedBlob = {
  descriptor: DolphindMigrationBlobDescriptor
  bytes: Buffer
}

export type DolphindMigrationManifestExport = {
  manifest: DolphindMigrationManifest
  /** The bytes of every blob the manifest names. */
  blobs: DolphindMigrationExportedBlob[]
}

export function createDolphindMigrationManifest(
  store: DolphindMigrationExportStore,
  target: SshTarget,
  options: DolphindMigrationManifestExportOptions = {}
): DolphindMigrationManifest {
  return exportDolphindMigrationManifest(store, target, options).manifest
}

export function exportDolphindMigrationManifest(
  store: DolphindMigrationExportStore,
  target: SshTarget,
  options: DolphindMigrationManifestExportOptions = {}
): DolphindMigrationManifestExport {
  const rewrite = options.rewrite ?? IDENTITY_DOLPHIND_MIGRATION_PATH_REWRITER
  const collected = restrictCatalog(
    collectDolphindMigrationSourceCatalog(store, target),
    options.onlyCatalog
  )
  const serverOwned = store.serverOwnedProjectGroupIds
  const sourcePayload = serverOwned
    ? {
        ...collected,
        projectGroups: collected.projectGroups.filter((group) => !serverOwned.has(group.id))
      }
    : collected
  const source = {
    sshTargetId: target.id,
    sshTargetGeneration: target.generation ?? null,
    targetLabel: target.label
  }
  const dormantState = store.collectDolphindMigrationSourceDormantState(
    source,
    sourcePayload,
    options.destinationEnvironmentId
  )
  // Select dormant state using source identities before rewriting destination paths.
  const rewritten = rewriteDolphindMigrationPayloadPaths(
    { ...sourcePayload, ...(hasDormantState(dormantState) ? { dormantState } : {}) },
    rewrite
  )
  const { payload, runHistory } = options.inlineAutomationRuns
    ? { payload: rewritten, runHistory: null }
    : moveAutomationRunsToBlob(rewritten)
  const unsigned = {
    version: DOLPHIND_MIGRATION_MANIFEST_VERSION,
    migrationId: options.migrationId ?? randomUUID(),
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    source,
    payload,
    ...(options.destinationEnvironmentId
      ? { destinationEnvironmentId: options.destinationEnvironmentId }
      : {})
  }
  try {
    // Sign what the journal and the host read back: the parsed form (the parser keeps only the fields
    // it knows) of the JSON (a value with toJSON serializes differently), never the live objects.
    const { manifestSha256: _unsigned, ...normalized } = parseDolphindMigrationManifest({
      ...JSON.parse(JSON.stringify(unsigned)),
      manifestSha256: UNSIGNED_DIGEST
    })
    if (runHistory) {
      // Refuse here what the destination's commit would refuse, while nothing is fenced.
      withDolphindMigrationAutomationRunHistory(normalized, runHistory.bytes.toString('utf8'))
    }
    return {
      manifest: { ...normalized, manifestSha256: computeDolphindMigrationManifestSha256(normalized) },
      blobs: runHistory ? [runHistory] : []
    }
  } catch (error) {
    if (error instanceof Error && error.message === DOLPHIND_MIGRATION_MANIFEST_TOO_LARGE) {
      throw new Error(describeOversizedDolphindMigrationPayload(payload))
    }
    throw error
  }
}

/** Run history scales with every run ever kept, so it travels beside the manifest, never in it. */
function moveAutomationRunsToBlob(payload: DolphindMigrationCatalogPayload): {
  payload: DolphindMigrationCatalogPayload
  runHistory: DolphindMigrationExportedBlob | null
} {
  if (!payload.dormantState?.automationRuns?.length) {
    return { payload, runHistory: null }
  }
  const { automationRuns, ...dormantState } = payload.dormantState
  // The JSON round trip matches what the manifest's own normalization keeps.
  const bytes = Buffer.from(
    serializeDolphindMigrationAutomationRunHistory(JSON.parse(JSON.stringify(automationRuns))),
    'utf8'
  )
  const maxBytes = DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS['automation-run-history'].maxBytes
  if (bytes.length > maxBytes) {
    throw new Error(
      `This SSH host's automation run history is too large to move to its Dolphin server ` +
        `(${formatKib(bytes.length)}, limit ${formatKib(maxBytes)}). Delete automations you no ` +
        `longer need from this host's projects; their run history goes with them. Then reconnect. ` +
        `(dolphind_migration_automation_run_history_too_large)`
    )
  }
  const ref = { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
  return {
    payload: {
      ...payload,
      dormantState: { ...dormantState, automationRunHistory: ref }
    },
    runHistory: { descriptor: dolphindMigrationAutomationRunHistoryBlob(ref), bytes }
  }
}

const UNSIGNED_DIGEST = '0'.repeat(64)

export type DolphindMigrationCatalogIds = {
  repositoryIds: ReadonlySet<string>
  folderWorkspaceIds: ReadonlySet<string>
  projectGroupIds: ReadonlySet<string>
}

export function dolphindMigrationCatalogIds(
  payloads: readonly DolphindMigrationCatalogPayload[]
): DolphindMigrationCatalogIds {
  return {
    repositoryIds: new Set(payloads.flatMap((p) => p.repositories.map((row) => row.id))),
    folderWorkspaceIds: new Set(payloads.flatMap((p) => p.folderWorkspaces.map((row) => row.id))),
    projectGroupIds: new Set(payloads.flatMap((p) => p.projectGroups.map((row) => row.id)))
  }
}

function restrictCatalog(
  payload: DolphindMigrationCatalogPayload,
  ids: DolphindMigrationCatalogIds | undefined
): DolphindMigrationCatalogPayload {
  if (!ids) {
    return payload
  }
  return {
    repositories: payload.repositories.filter((row) => ids.repositoryIds.has(row.id)),
    folderWorkspaces: payload.folderWorkspaces.filter((row) => ids.folderWorkspaceIds.has(row.id)),
    projectGroups: payload.projectGroups.filter((row) => ids.projectGroupIds.has(row.id))
  }
}
