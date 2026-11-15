import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../../../config/scripts/test-runtime/environment/vitest-host-ports-setup'

const shim = vi.hoisted(() => ({ ensureLinuxTerminalDolphinCliShimDir: vi.fn() }))
vi.mock('./linux-terminal-dolphin-cli-shim', () => shim)

import { prependDolphinCliDirToChildPath } from './dolphin-cli-child-path'

const USER_DATA = '/data/dolphin'
const SHIM_DIR = join(USER_DATA, 'linux-dolphin-cli-shim')

beforeEach(() => {
  installFakeAppEnvironment()
  shim.ensureLinuxTerminalDolphinCliShimDir.mockReset()
  shim.ensureLinuxTerminalDolphinCliShimDir.mockReturnValue(SHIM_DIR)
})

afterEach(() => installFakeAppEnvironment())

describe('prependDolphinCliDirToChildPath', () => {
  it.each(['linux', 'darwin'] as const)(
    'uses the %s execution host CLI and profile over inherited values',
    (platform) => {
      const launcher = join(USER_DATA, 'cli', 'bin', 'dolphin')
      installFakeAppEnvironment({ getCliLauncherPath: () => launcher })
      const env: Record<string, string> = {
        PATH: `/usr/bin:${join(USER_DATA, 'cli', 'bin')}::/bin`,
        DOLPHIN_USER_DATA_PATH: '/parent/profile',
        DOLPHIN_CLI_COMMAND: '/parent/dolphin',
        DOLPHIN_CLI_BIN_DIR: '/parent/bin'
      }
      expect(
        prependDolphinCliDirToChildPath(env, {
          isPackaged: true,
          userDataPath: USER_DATA,
          resourcesPath: null,
          platform
        })
      ).toBe(launcher)
      expect(env.PATH).toBe(`${join(USER_DATA, 'cli', 'bin')}:/usr/bin:/bin`)
      expect(env.DOLPHIN_USER_DATA_PATH).toBe(USER_DATA)
      expect(env.DOLPHIN_CLI_COMMAND).toBe(launcher)
      expect(env.DOLPHIN_CLI_BIN_DIR).toBe(join(USER_DATA, 'cli', 'bin'))
      expect(shim.ensureLinuxTerminalDolphinCliShimDir).not.toHaveBeenCalled()
    }
  )

  it('puts a Windows execution host CLI first on Path without a POSIX restore dir', () => {
    const binDir = join(USER_DATA, 'cli', 'bin')
    const launcher = join(binDir, 'dolphin.exe')
    installFakeAppEnvironment({ getCliLauncherPath: () => launcher })
    const env: Record<string, string> = {
      Path: `C:\\Windows;${binDir};;C:\\Tools`,
      DOLPHIN_USER_DATA_PATH: 'C:\\parent\\profile',
      DOLPHIN_CLI_COMMAND: 'C:\\parent\\dolphin.exe',
      DOLPHIN_CLI_BIN_DIR: '/parent/bin'
    }
    expect(
      prependDolphinCliDirToChildPath(env, {
        isPackaged: true,
        userDataPath: USER_DATA,
        resourcesPath: null,
        platform: 'win32'
      })
    ).toBe(launcher)
    expect(env).toEqual({
      Path: `${binDir};C:\\Windows;C:\\Tools`,
      DOLPHIN_USER_DATA_PATH: USER_DATA,
      DOLPHIN_CLI_COMMAND: launcher
    })
  })

  it('writes no trailing delimiter when nothing was inherited', () => {
    const env: Record<string, string> = { PATH: '' }
    const inheritedPath = process.env.PATH
    delete process.env.PATH
    try {
      prependDolphinCliDirToChildPath(env, {
        isPackaged: false,
        userDataPath: USER_DATA,
        platform: 'linux'
      })
    } finally {
      if (inheritedPath !== undefined) {
        process.env.PATH = inheritedPath
      }
    }
    // Why: an empty trailing segment resolves as `.` in some shells.
    expect(env.PATH).toBe(join(USER_DATA, 'cli', 'bin'))
  })
})
