#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileWindowsRustExecutable } from './windows-rust-executable-build.mjs'

function readArg(name) {
  const index = process.argv.indexOf(name)
  return index !== -1 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = resolve(import.meta.dirname, '../../../..')
  const crateRoot = join(repoRoot, 'native', 'windows-cli-launcher')
  const iconPath = join(repoRoot, 'resources', 'build', 'icon.ico')
  const output = readArg('--output') ?? join(crateRoot, '.build', 'dolphin.exe')
  for (const binName of ['dolphin', 'dolphin-administrator-restart']) {
    compileWindowsRustExecutable({
      repoRoot,
      crateRoot,
      binName,
      label:
        binName === 'dolphin' ? 'Windows CLI launcher' : 'Windows administrator restart launcher',
      fingerprintInputs: [
        // The launcher embeds the packaged binary's name; a rename must rebuild it.
        join(crateRoot, 'src', 'app_executable.rs'),
        join(repoRoot, 'config', 'windows-executable-name.txt'),
        join(crateRoot, 'src', 'administrator_status.rs'),
        join(crateRoot, 'src', 'administrator_restart.rs'),
        join(crateRoot, 'src', 'administrator_launcher.rs'),
        iconPath,
        join(repoRoot, 'config/scripts/native-build/windows/build-windows-cli-launcher.mjs')
      ],
      arch: readArg('--arch'),
      outputPath: binName === 'dolphin' ? output : join(dirname(output), `${binName}.exe`),
      buildEnv: (version) => ({
        DOLPHIN_LAUNCHER_VERSION: version,
        DOLPHIN_LAUNCHER_ICON: iconPath,
        DOLPHIN_LAUNCHER_FILENAME: `${binName}.exe`
      })
    })
  }
}
