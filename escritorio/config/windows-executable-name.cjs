'use strict'

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * The Windows app binary's name, from the one file both sides read.
 *
 * electron-builder takes it as `win.executableName`; the native CLI launcher
 * (`native/windows-cli-launcher/src/app_executable.rs`) embeds the same file at
 * compile time. When the two disagreed (Dolphin.exe vs DolphinCode.exe) every
 * `dolphin` command failed with "Unable to locate Dolphin.exe".
 */
const WINDOWS_EXECUTABLE_NAME_FILE = join(__dirname, 'windows-executable-name.txt')

function readWindowsExecutableName(file = WINDOWS_EXECUTABLE_NAME_FILE) {
  const name = readFileSync(file, 'utf8').trim()
  if (!/^[A-Za-z0-9._-]+$/.test(name) || /\.exe$/i.test(name)) {
    throw new Error(
      `${file} must hold a bare file stem such as "DolphinCode" (no .exe, no spaces); got ${JSON.stringify(name)}`
    )
  }
  return name
}

module.exports = { WINDOWS_EXECUTABLE_NAME_FILE, readWindowsExecutableName }
