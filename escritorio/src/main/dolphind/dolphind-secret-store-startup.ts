import { join } from 'node:path'
import { prepareDolphindSecretStore } from './dolphind-host-adapters'

export async function prepareDolphindSecretStoreAndMigrate(userDataPath: string): Promise<void> {
  const { getSecretStore } = await import('../../shared/secret-store')
  const { reportSecretProtectionGap } = await import('../host/secret-protection-report')
  const { migratePlaintextCredentials, dolphindCredentialRoot } =
    await import('./dolphind-plaintext-credential-migration')
  // Keep sealing keys outside disposable DOLPHIN_USER_DATA roots.
  if (await prepareDolphindSecretStore(dolphindCredentialRoot(), userDataPath)) {
    migratePlaintextCredentials(getSecretStore())
  }
  reportSecretProtectionGap({ dataFile: join(userDataPath, 'dolphin-data.json') })
}
