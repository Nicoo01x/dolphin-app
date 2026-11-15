import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { runProcessSync } from '@dolphin/process-host'
import { DOLPHIND_WINDOWS_CLI_LAUNCHER_FILENAME } from '../../../../src/shared/dolphind-artifacts.ts'

const { PE_MACHINE, describePeMachine, readPeMachine } = createRequire(import.meta.url)(
  '../../native-build/windows/windows-pe-machine.cjs'
)

export function dolphindWindowsCliLauncherSource(root, arch) {
  return join(root, '.build', 'windows-cli-launcher', arch, 'dolphin.exe')
}

/** A Windows slot's `dolphin` command; a Windows build host compiles a missing one. */
export function stageDolphindWindowsCliLauncher(
  root,
  outputDir,
  target,
  host = { platform: process.platform },
  compile = compileDolphindWindowsCliLauncher
) {
  if (!target.startsWith('win32-')) {
    return
  }
  const arch = target.slice('win32-'.length)
  const source = dolphindWindowsCliLauncherSource(root, arch)
  if (!existsSync(source)) {
    if (host.platform !== 'win32') {
      throw new Error(
        `Dolphind ${target} requires the native CLI launcher. On Windows, run: ` +
          `node config/scripts/native-build/windows/build-windows-cli-launcher.mjs --arch ${arch} --output ${source}`
      )
    }
    compile(root, arch, source)
  }
  const machine = readPeMachine(source)
  if (machine !== PE_MACHINE[arch]) {
    throw new Error(`Dolphind ${target} CLI launcher has ${describePeMachine(machine)}`)
  }
  const destination = join(outputDir, ...DOLPHIND_WINDOWS_CLI_LAUNCHER_FILENAME.split('/'))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}

function compileDolphindWindowsCliLauncher(root, arch, output) {
  const result = runProcessSync({
    program: process.execPath,
    args: [
      join(root, 'config/scripts/native-build/windows/build-windows-cli-launcher.mjs'),
      '--arch',
      arch,
      '--output',
      output
    ],
    cwd: root,
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(`Windows CLI launcher build for ${arch} failed with exit ${result.code}`)
  }
}
