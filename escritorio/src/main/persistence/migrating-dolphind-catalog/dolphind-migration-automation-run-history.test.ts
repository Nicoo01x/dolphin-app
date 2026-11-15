import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SshTarget } from '../../../shared/ssh-types'
import {
  MAX_DOLPHIND_MIGRATION_MANIFEST_BYTES,
  parseDolphindMigrationManifest
} from '../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import { closeTestStores, createSqliteTestStore } from '../persistence-test-harness'
import { Store } from '../loading-store/store'
import { commitDolphindMigrationDestination } from '../../managed-server/migration/cutover/dolphind-migration-cutover-coordinator'
import { storeBackedDolphindMigrationDestination } from '../../managed-server/migration/cutover/testing/dolphind-migration-destination-fake'
import './dolphind-migration-cutover-journal'
import './dolphind-migration-manifest-export'
import '../../ssh/migration-source/dolphind-migration-source-assertions'
import { fenceDolphindMigrationSource } from '../../ssh/migration-source/dolphind-migration-source-fence'
import { SshTargetDolphindClaims } from '../../ssh/targets/ssh-target-dolphind-claims'

const TARGET: SshTarget = {
  id: 'ssh-prod',
  label: 'Production',
  host: 'prod.example.com',
  port: 22,
  username: 'deploy',
  generation: 2
}

const directories: string[] = []
afterEach(async () => {
  await closeTestStores()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** A host whose one automation kept more run output than a whole manifest may hold (#37051). */
async function hostWithRunHistory(outputChars = 30_000) {
  const userDataPath = mkdtempSync(join(tmpdir(), 'dolphind-run-history-'))
  directories.push(userDataPath)
  const store = createSqliteTestStore(Store, {
    dataFile: join(userDataPath, 'desktop', 'dolphin-data.json')
  })
  const server = createSqliteTestStore(Store, {
    dataFile: join(userDataPath, 'server', 'dolphin-data.json')
  })
  store.addSshTarget(TARGET)
  store.addRepo({
    id: 'repo-1',
    path: '/srv/app',
    displayName: 'App',
    badgeColor: '#737373',
    addedAt: 1,
    kind: 'git',
    connectionId: TARGET.id
  })
  const automation = store.createAutomation({
    name: 'Nightly check',
    prompt: 'Check the repo',
    agentId: 'claude',
    projectId: 'repo-1',
    workspaceMode: 'new_per_run',
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 1
  })
  for (let index = 0; index < 40; index++) {
    const run = store.createAutomationRun(automation, 1_000 + index)
    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      outputSnapshot: {
        format: 'plain_text',
        content: `run ${index}: ${'x'.repeat(outputChars)}`,
        capturedAt: 2_000 + index,
        truncated: false
      }
    })
  }
  const claims = new SshTargetDolphindClaims(store)
  const fenced = await fenceDolphindMigrationSource({
    userDataPath,
    store,
    claims,
    targetId: TARGET.id,
    destinationEnvironmentId: 'env-1',
    destinationName: 'Managed',
    terminalProof: { verdict: 'exited', provenPtyIds: [] }
  })
  if (fenced.outcome !== 'fenced') {
    throw new Error(`expected a fence: ${fenced.reason}`)
  }
  return { userDataPath, store, server, claims, automation, cutover: fenced.cutover }
}

describe('moving automation run history to a host server', () => {
  it('moves history larger than the manifest limit, every run intact', async () => {
    const h = await hostWithRunHistory()
    const history = h.store.listAutomationRuns(h.automation.id)
    expect(JSON.stringify(history).length).toBeGreaterThan(MAX_DOLPHIND_MIGRATION_MANIFEST_BYTES)
    expect(JSON.stringify(h.cutover.manifest).length).toBeLessThan(64 * 1024)

    const committed = await commitDolphindMigrationDestination(
      {
        userDataPath: h.userDataPath,
        store: h.store,
        claims: h.claims,
        destination: storeBackedDolphindMigrationDestination(h.server)
      },
      h.cutover.migrationId
    )

    expect(committed.phase).toBe('destination-committed')
    const moved = h.server.listAutomationRuns(h.automation.id)
    expect(moved.map((run) => [run.id, run.runNumber, run.outputSnapshot?.content])).toEqual(
      history.map((run) => [run.id, run.runNumber, run.outputSnapshot?.content])
    )
  })

  it('refuses a commit whose history never arrived, importing nothing', async () => {
    const h = await hostWithRunHistory()
    const manifest = parseDolphindMigrationManifest(JSON.parse(JSON.stringify(h.cutover.manifest)))
    h.server.stageDolphindMigrationCatalog(manifest)

    expect(() => h.server.commitStagedDolphindMigrationCatalog(manifest)).toThrow(
      'dolphind_migration_blob_incomplete:automation-run-history:migration'
    )
    expect(h.server.getDolphindMigrationCatalogState(manifest).state).toBe('staged')
    expect(h.server.listAutomations()).toEqual([])
  })
})
