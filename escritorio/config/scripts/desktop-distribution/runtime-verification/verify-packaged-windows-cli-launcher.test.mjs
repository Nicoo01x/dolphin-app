import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  verifyPackagedWindowsCliLauncher,
  launcherEmbedsName
} = require('./verify-packaged-windows-cli-launcher.cjs')
const { readWindowsExecutableName } = require('../../../windows-executable-name.cjs')

const projectRoot = resolve(import.meta.dirname, '../../../..')
const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function packagedApp({ appBinary, launcherBytes }) {
  const root = mkdtempSync(join(tmpdir(), 'dolphin-packaged-launcher-'))
  roots.push(root)
  mkdirSync(join(root, 'resources', 'bin'), { recursive: true })
  if (appBinary) {
    writeFileSync(join(root, appBinary), 'pe')
  }
  if (launcherBytes) {
    writeFileSync(join(root, 'resources', 'bin', 'dolphin.exe'), launcherBytes)
  }
  return root
}

describe('una sola fuente para el binario de Windows', () => {
  it('el builder y el launcher leen el mismo archivo', () => {
    const name = readWindowsExecutableName()
    expect(name).toBe('DolphinCode')
    const builderConfig = readFileSync(
      join(projectRoot, 'config/electron-builder.config.cjs'),
      'utf8'
    )
    expect(builderConfig).toContain('executableName: windowsExecutableName')
    expect(builderConfig).not.toMatch(/executableName:\s*'DolphinCode'/)
    const launcher = readFileSync(
      join(projectRoot, 'native/windows-cli-launcher/src/app_executable.rs'),
      'utf8'
    )
    expect(launcher).toContain('include_str!("../../../config/windows-executable-name.txt")')
    const main = readFileSync(join(projectRoot, 'native/windows-cli-launcher/src/main.rs'), 'utf8')
    expect(main).not.toContain('"Dolphin.exe"')
  })

  it('rechaza un nombre con .exe o con espacios', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-exe-name-'))
    roots.push(root)
    for (const bad of ['DolphinCode.exe', 'Dolphin Code', '']) {
      const file = join(root, 'name.txt')
      writeFileSync(file, `${bad}\n`)
      expect(() => readWindowsExecutableName(file)).toThrow(/bare file stem/)
    }
  })
})

describe('el chequeo del paquete de Windows', () => {
  it('pasa cuando el binario existe y el launcher lo busca', () => {
    const root = packagedApp({
      appBinary: 'DolphinCode.exe',
      launcherBytes: Buffer.from('MZ....DolphinCode\r\n....Dolphin')
    })
    expect(() => verifyPackagedWindowsCliLauncher(root, 'DolphinCode')).not.toThrow()
  })

  it('falla si el builder generó otro nombre', () => {
    const root = packagedApp({
      appBinary: 'Dolphin.exe',
      launcherBytes: Buffer.from('MZ....DolphinCode')
    })
    expect(() => verifyPackagedWindowsCliLauncher(root, 'DolphinCode')).toThrow(/disagree/)
  })

  it('falla con un launcher viejo que busca Dolphin.exe', () => {
    const root = packagedApp({
      appBinary: 'DolphinCode.exe',
      launcherBytes: Buffer.from('MZ....Unable to locate Dolphin.exe next to')
    })
    expect(() => verifyPackagedWindowsCliLauncher(root, 'DolphinCode')).toThrow(/stale/)
  })

  it('falla si falta el launcher', () => {
    const root = packagedApp({ appBinary: 'DolphinCode.exe' })
    expect(() => verifyPackagedWindowsCliLauncher(root, 'DolphinCode')).toThrow(
      /Missing packaged CLI launcher/
    )
  })

  it('busca los bytes del nombre tal cual', () => {
    expect(launcherEmbedsName(Buffer.from('xxDolphinCodexx'), 'DolphinCode')).toBe(true)
    expect(launcherEmbedsName(Buffer.from('xxDolphin.exexx'), 'DolphinCode')).toBe(false)
  })
})
