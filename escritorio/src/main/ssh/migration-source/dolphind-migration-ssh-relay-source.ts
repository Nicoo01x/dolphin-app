import { DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND } from '../../../shared/dolphind-migration/dolphind-migration-source-kind'
import type { SshTarget } from '../../../shared/ssh-types'
import { collectDolphindMigrationSourceCatalog } from '../../persistence/migrating-dolphind-catalog/dolphind-source-catalog'
import type { Store } from '../../persistence/loading-store/store'
import { createDolphindMigrationManifest } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import { IDENTITY_DOLPHIND_MIGRATION_PATH_REWRITER } from '../../persistence/migrating-dolphind-catalog/path-rewrite/dolphind-migration-path-rewrite'
import type {
  DolphindMigrationSource,
  DolphindMigrationSourceCutoverPort
} from '../../managed-server/migration/cutover/dolphind-migration-source'
import { assertDolphindMigrationSourceUnchanged } from './dolphind-migration-source-assertions'
import {
  fenceDolphindMigrationSource,
  releaseDolphindMigrationFence,
  resolveDolphindMigrationFence
} from './dolphind-migration-source-fence'
import {
  assessDolphindMigrationTerminals,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from './dolphind-migration-terminal-gate'
import type { SshTargetDolphindClaims } from '../targets/ssh-target-dolphind-claims'
import type { DolphindMigrationPreflightStore } from '../targets/ssh-target-dolphind-preflight'
import type { DolphindMigrationPaneLeasePredicate } from './dolphind-migration-bridged-panes'

type SshRelayCutoverDeps = {
  userDataPath: string
  store: DolphindMigrationPreflightStore
  claims: SshTargetDolphindClaims
  /** Rebuild copied stores for every check so later edits remain visible. */
  freshSource?: () => DolphindMigrationPreflightStore
  signal?: AbortSignal
}

export function sshRelayMigrationCutoverPort(
  deps: SshRelayCutoverDeps
): DolphindMigrationSourceCutoverPort {
  return {
    verifyFence: (cutover) =>
      assertDolphindMigrationSourceUnchanged(
        { userDataPath: deps.userDataPath, store: deps.freshSource?.() ?? deps.store },
        cutover
      ),
    releaseFence: (cutover) => releaseDolphindMigrationFence(deps, cutover)
  }
}

export function createSshRelayMigrationSource(
  deps: SshRelayCutoverDeps & {
    store: DolphindMigrationPreflightStore &
      Pick<Store, 'getSshRemotePtyLeases' | 'markSshRemotePtyLease'>
    target: SshTarget
    /** Every relay endpoint on the host's account; without it exit can never be proven. */
    censusHost?: CensusHostRelayTerminals | null
    isBridgedPaneLease?: DolphindMigrationPaneLeasePredicate
  }
): DolphindMigrationSource {
  const { userDataPath, store, target } = deps
  return {
    ...sshRelayMigrationCutoverPort(deps),
    kind: DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND,
    journalKey: target.id,
    collectCatalog: () => collectDolphindMigrationSourceCatalog(store, target),
    exportManifest: (options = {}) =>
      createDolphindMigrationManifest(store, target, {
        ...options,
        rewrite: IDENTITY_DOLPHIND_MIGRATION_PATH_REWRITER
      }),
    assessTerminals: () => assessDolphindMigrationTerminals(store, target.id, deps.censusHost),
    retireProvenExitedTerminals: (proof) => retireProvenExitedLeases(store, target.id, proof),
    resolveFence: () => resolveDolphindMigrationFence(userDataPath, target),
    acquireFence: (args) =>
      fenceDolphindMigrationSource({
        userDataPath,
        store,
        claims: deps.claims,
        targetId: target.id,
        isBridgedPaneLease: deps.isBridgedPaneLease,
        ...args
      })
  }
}
