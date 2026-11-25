'use strict'

const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Fails the package when the CLI launcher would not find the app binary.
 *
 * The launcher embeds the binary's name from `config/windows-executable-name.txt`. A stale
 * `native/windows-cli-launcher/.build/dolphin.exe` (built before a rename) still carries the old
 * name, and the installed `dolphin` then fails on every command. So this checks the real files:
 * the binary electron-builder wrote, and that same name inside the launcher it packaged.
 */
function verifyPackagedWindowsCliLauncher(appOutDir, executableName) {
  const appBinary = join(appOutDir, `${executableName}.exe`)
  if (!existsSync(appBinary)) {
    throw new Error(
      `Packaged Windows app binary ${appBinary} is missing; win.executableName and config/windows-executable-name.txt disagree`
    )
  }
  const launcherPath = join(appOutDir, 'resources', 'bin', 'dolphin.exe')
  if (!existsSync(launcherPath)) {
    throw new Error(
      `Missing packaged CLI launcher ${launcherPath}; run node config/scripts/native-build/windows/build-windows-cli-launcher.mjs`
    )
  }
  if (!launcherEmbedsName(readFileSync(launcherPath), executableName)) {
    throw new Error(
      `The packaged CLI launcher ${launcherPath} does not look for ${executableName}.exe; ` +
        'it is stale. Rebuild it with node config/scripts/native-build/windows/build-windows-cli-launcher.mjs'
    )
  }
}

/** `include_str!` stores the name as UTF-8 bytes in the launcher's read-only data. */
function launcherEmbedsName(launcherBytes, executableName) {
  return launcherBytes.includes(Buffer.from(executableName, 'utf8'))
}

module.exports = { verifyPackagedWindowsCliLauncher, launcherEmbedsName }
