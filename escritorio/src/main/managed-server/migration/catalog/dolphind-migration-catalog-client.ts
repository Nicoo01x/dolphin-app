import { hasModernAutomationLaunchSetup } from '../../../../shared/automations/launch/automation-launch-setup'
import { automationCanonicalLaunchSetup } from '../../../../shared/automations/launch/automation-canonical-launch-setup'
import { AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY } from '../../../../shared/automations/automation-runtime-capabilities'
import {
  parseDolphindMigrationCatalogAbortResult,
  parseDolphindMigrationCatalogState
} from '../../../../shared/dolphind-migration/dolphind-migration-catalog-state'

import type {
  DolphindMigrationCatalogAbortResult,
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'

import {
  findUnsupportedMigrationBlobKind,
  dolphindMigrationBlobKindUnsupportedBlocker
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'

import type { DolphindMigrationBlobDescriptor } from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import { dolphindMigrationManifestBlobs } from '../../../../shared/dolphind-migration/dolphind-migration-automation-run-history'
import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import { assertDolphindMigrationRequestFits } from './dolphind-migration-request-budget'
import { hasExtraAgentArgs } from '../../../../shared/agent-launch/startup/automation-extra-agent-args'
import { requiredDolphindMigrationSourceCapability } from '../../../../shared/dolphind-migration/dolphind-migration-source-kind'
import type { CatalogRequestOptions } from './dolphind-migration-request'
import { sendSupportedMigrationRequest } from './dolphind-migration-request'

type DolphindCatalogMigrationOperation = 'abort' | 'commit' | 'stage' | 'state'

const METHOD_BY_OPERATION: Record<DolphindCatalogMigrationOperation, string> = {
  abort: 'dolphind.migration.abortCatalog',
  commit: 'dolphind.migration.commitCatalog',
  stage: 'dolphind.migration.stageCatalog',
  state: 'dolphind.migration.catalogState'
}

export function stageRemoteDolphindMigrationCatalog(
  pairingCode: string,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'stage', manifest, options)
}

/** Expected blobs make the destination refuse incomplete commits. */
export async function commitRemoteDolphindMigrationCatalog(
  pairingCode: string,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions & {
    expectedBlobs?: readonly DolphindMigrationBlobDescriptor[]
  } = {}
): Promise<DolphindMigrationCatalogState> {
  const result = await request(pairingCode, 'commit', manifest, options, options.expectedBlobs)
  return parseDolphindMigrationCatalogState(result, manifest)
}

export function readRemoteDolphindMigrationCatalogState(
  pairingCode: string,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'state', manifest, options)
}

export async function abortRemoteDolphindMigrationCatalog(
  pairingCode: string,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationCatalogAbortResult> {
  const result = await request(pairingCode, 'abort', manifest, options)
  const parsed = parseDolphindMigrationCatalogAbortResult(result, manifest)
  // Older already-absent replies prove no durability, unlike real aborts.
  if (parsed.state === 'absent' && !parsed.aborted && parsed.durableAbsent !== true) {
    throw new Error('dolphind_migration_abort_durability_unverifiable:destination_update_required')
  }
  return parsed
}

async function requestCatalogState(
  pairingCode: string,
  operation: Exclude<DolphindCatalogMigrationOperation, 'abort'>,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions
): Promise<DolphindMigrationCatalogState> {
  const result = await request(pairingCode, operation, manifest, options)
  return parseDolphindMigrationCatalogState(result, manifest)
}

async function request(
  pairingCode: string,
  operation: DolphindCatalogMigrationOperation,
  manifest: DolphindMigrationManifest,
  options: CatalogRequestOptions,
  expectedBlobs: readonly DolphindMigrationBlobDescriptor[] = []
): Promise<unknown> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('dolphind_migration_pairing_code_invalid')
  }
  // Preserve exact { manifest } wire shape for blob-free and SSH moves.
  const params = expectedBlobs.length > 0 ? { manifest, expectedBlobs } : { manifest }
  // Validation-size limits can exceed sealed-frame capacity; reject before the host closes the socket.
  assertDolphindMigrationRequestFits(params)
  const imports = operation === 'stage' || operation === 'commit'
  const carriesExtraAgentArgs =
    imports &&
    (manifest.payload.dormantState?.automations ?? []).some((automation) =>
      hasExtraAgentArgs(automation.extraAgentArgs)
    )
  // An older host would drop the blob a manifest names and import without its rows.
  const requiredBlobs = imports
    ? [...expectedBlobs, ...dolphindMigrationManifestBlobs(manifest)]
    : expectedBlobs
  const response = await sendSupportedMigrationRequest(
    pairing,
    METHOD_BY_OPERATION[operation],
    params,
    options,
    carriesExtraAgentArgs,
    // Recheck source capabilities on every operation; older hosts may misparse non-SSH sources.
    requiredDolphindMigrationSourceCapability(manifest.source),
    // Hosts without blob capability would strip expectedBlobs and commit unchecked.
    (capabilities) => {
      if (
        imports &&
        (manifest.payload.dormantState?.automations ?? []).some((automation) =>
          hasModernAutomationLaunchSetup(automationCanonicalLaunchSetup(automation))
        ) &&
        !capabilities.includes(AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY)
      ) {
        throw new Error(
          'Update Dolphin on the destination host to keep automation agent launch settings.'
        )
      }
      const unsupported = findUnsupportedMigrationBlobKind(requiredBlobs, capabilities)
      if (unsupported) {
        throw new Error(dolphindMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`dolphind_migration_${operation}_failed:${response.error.message}`)
  }
  return response.result
}
