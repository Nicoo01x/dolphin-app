// #33849: an ~/.ssh/config host whose IdentityFile uses OpenSSH tokens connects with that key, not a password prompt.
// DOLPHIN_E2E_DOLPHIND_CONVERT_HOST=docker; DOLPHIN_E2E_DOLPHIND_CONVERT_TEMPLATE must be built for the Docker host.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/dolphin-app'
import { waitForSessionReady } from './helpers/store'
import { managedServer } from './helpers/dolphind-convert-flow'
import { openSshHostSettings, seedIsolatedSshConfig } from './helpers/ssh-config-host-picker'
import {
  DOLPHIND_CONVERT_HOST_ENV,
  startDolphindConvertHost,
  type DolphindConvertHost
} from './helpers/dolphind-convert-host'

const HOST = process.env[DOLPHIND_CONVERT_HOST_ENV]
const TEMPLATE_SOURCE = process.env.DOLPHIN_E2E_DOLPHIND_CONVERT_TEMPLATE

test.skip(
  HOST !== 'docker' || !TEMPLATE_SOURCE,
  `Set ${DOLPHIND_CONVERT_HOST_ENV}=docker and DOLPHIN_E2E_DOLPHIND_CONVERT_TEMPLATE`
)
test.use({
  seedTestRepo: false,
  dolphinAppExtraEnv: { DOLPHIN_DOLPHIND_TEMPLATE_PATH: TEMPLATE_SOURCE ?? '', SSH_AUTH_SOCK: '' }
})

let host: DolphindConvertHost | null = null
let keyDir: string | null = null
test.afterEach(() => {
  host?.cleanup()
  host = null
  if (keyDir) {
    rmSync(keyDir, { recursive: true, force: true })
    keyDir = null
  }
})

test('an IdentityFile path with %r and %p tokens is the key Connect uses', async ({
  electronApp,
  appPage
}, testInfo) => {
  // Starts a Docker host and installs Dolphin's server there.
  test.setTimeout(6 * 60_000)
  host = startDolphindConvertHost('docker', testInfo)
  keyDir = mkdtempSync(path.join(os.tmpdir(), 'dolphin-identity-tokens-'))
  // %r and %p expand to root and the mapped port; ssh -G prints them unexpanded.
  copyFileSync(host.input.identityFile!, path.join(keyDir, `id-root-${host.input.port}`))
  const alias = `dolphin-tokens-${host.input.port}`
  await seedIsolatedSshConfig(
    electronApp,
    [
      `Host ${alias}`,
      `  HostName ${host.input.host}`,
      `  Port ${host.input.port}`,
      '  User root',
      `  IdentityFile ${keyDir}/id-%r-%p`,
      '  IdentitiesOnly yes',
      ''
    ].join('\n')
  )
  await waitForSessionReady(appPage)
  const targetId = await appPage.evaluate(async (configHost) => {
    const { target } = await window.api.ssh.addTarget({
      target: {
        label: configHost,
        configHost,
        host: configHost,
        port: 22,
        username: '',
        source: 'ssh-config'
      }
    })
    return target.id
  }, alias)
  const section = await openSshHostSettings(appPage)
  const card = section.locator(`[data-ssh-target-card][data-ssh-target-label="${alias}"]`)
  await card.hover()
  await card.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect
    .poll(() => managedServer(appPage, targetId), { timeout: 4 * 60_000 })
    .toMatchObject({ kind: 'managed' })
  await expect(appPage.getByRole('dialog', { name: 'SSH Password' })).toHaveCount(0)
})
