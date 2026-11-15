import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  migrateDolphinDevElectronUserData,
  migratePackagedElectronUserData
} from './electron-user-data-migration'

describe('migrateDolphinDevElectronUserData', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('copies the old dev profile without moving it', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca-dev'))
    writeFileSync(join(root, 'orca-dev', 'settings.json'), '{"ok":true}')

    expect(migrateDolphinDevElectronUserData(root)).toBe(true)
    expect(readFileSync(join(root, 'dolphin-dev', 'settings.json'), 'utf8')).toBe('{"ok":true}')
    expect(existsSync(join(root, 'orca-dev', 'settings.json'))).toBe(true)
    expect(migrateDolphinDevElectronUserData(root)).toBe(false)
  })

  it('no copia los cachés que Chromium rehace, pero sí los modelos de voz', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca-dev', 'Code Cache', 'js'), { recursive: true })
    writeFileSync(join(root, 'orca-dev', 'Code Cache', 'js', 'index'), 'x')
    mkdirSync(join(root, 'orca-dev', 'speech-models'))
    writeFileSync(join(root, 'orca-dev', 'speech-models', 'modelo.onnx'), 'm')

    expect(migrateDolphinDevElectronUserData(root)).toBe(true)
    expect(existsSync(join(root, 'dolphin-dev', 'Code Cache'))).toBe(false)
    expect(existsSync(join(root, 'dolphin-dev', 'speech-models', 'modelo.onnx'))).toBe(true)
    expect(existsSync(join(root, 'orca-dev', 'Code Cache', 'js', 'index'))).toBe(true)
  })

  it('un intento cortado a mitad de copia no queda como perfil: se rehace', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca-dev'))
    writeFileSync(join(root, 'orca-dev', 'settings.json'), '{"ok":true}')
    mkdirSync(join(root, 'dolphin-dev.migrando'))
    writeFileSync(join(root, 'dolphin-dev.migrando', 'a-medias'), '')

    expect(migrateDolphinDevElectronUserData(root)).toBe(true)
    expect(existsSync(join(root, 'dolphin-dev', 'a-medias'))).toBe(false)
    expect(readFileSync(join(root, 'dolphin-dev', 'settings.json'), 'utf8')).toBe('{"ok":true}')
    expect(existsSync(join(root, 'dolphin-dev.migrando'))).toBe(false)
  })

  it('migra aunque el runner de dev ya haya creado dolphin-dev/cli, y conserva lo del runner', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca-dev', 'cli'), { recursive: true })
    writeFileSync(join(root, 'orca-dev', 'Local State'), '{"viejo":true}')
    writeFileSync(join(root, 'orca-dev', 'cli', 'shim'), 'viejo')
    mkdirSync(join(root, 'dolphin-dev', 'cli'), { recursive: true })
    writeFileSync(join(root, 'dolphin-dev', 'cli', 'shim'), 'nuevo')

    expect(migrateDolphinDevElectronUserData(root)).toBe(true)
    expect(readFileSync(join(root, 'dolphin-dev', 'Local State'), 'utf8')).toBe('{"viejo":true}')
    expect(readFileSync(join(root, 'dolphin-dev', 'cli', 'shim'), 'utf8')).toBe('nuevo')
  })

  it('no toca un perfil donde Electron ya corrió', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca-dev'))
    writeFileSync(join(root, 'orca-dev', 'Local State'), '{"viejo":true}')
    mkdirSync(join(root, 'dolphin-dev'))
    writeFileSync(join(root, 'dolphin-dev', 'Local State'), '{"propio":true}')

    expect(migrateDolphinDevElectronUserData(root)).toBe(false)
    expect(readFileSync(join(root, 'dolphin-dev', 'Local State'), 'utf8')).toBe('{"propio":true}')
  })
})

describe('migratePackagedElectronUserData', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Why este caso: en desarrollo la migración existía y en el build empaquetado no, así que
  // quien venía de una versión anterior abría la app nueva sin sus repos ni sus
  // conversaciones, con todo intacto en la carpeta del nombre de antes.
  it('trae el perfil de la carpeta anterior sin moverla', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca', 'profiles', 'local-default'), { recursive: true })
    writeFileSync(join(root, 'orca', 'Local State'), '{"viejo":true}')
    writeFileSync(join(root, 'orca', 'profiles', 'local-default', 'estado.db'), 'datos')

    expect(migratePackagedElectronUserData(root)).toBe(true)
    expect(
      readFileSync(join(root, 'dolphin', 'profiles', 'local-default', 'estado.db'), 'utf8')
    ).toBe('datos')
    expect(existsSync(join(root, 'orca', 'profiles', 'local-default', 'estado.db'))).toBe(true)
    // Una segunda vuelta no vuelve a copiar: la marca ya está.
    expect(migratePackagedElectronUserData(root)).toBe(false)
  })

  it('no pisa un perfil nuevo donde la app ya corrió', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    mkdirSync(join(root, 'orca'))
    writeFileSync(join(root, 'orca', 'Local State'), '{"viejo":true}')
    mkdirSync(join(root, 'dolphin'))
    writeFileSync(join(root, 'dolphin', 'Local State'), '{"propio":true}')

    expect(migratePackagedElectronUserData(root)).toBe(false)
    expect(readFileSync(join(root, 'dolphin', 'Local State'), 'utf8')).toBe('{"propio":true}')
  })

  it('sin carpeta anterior no hace nada', () => {
    const root = mkdtempSync(join(tmpdir(), 'dolphin-electron-data-'))
    roots.push(root)
    expect(migratePackagedElectronUserData(root)).toBe(false)
    expect(existsSync(join(root, 'dolphin'))).toBe(false)
  })
})
