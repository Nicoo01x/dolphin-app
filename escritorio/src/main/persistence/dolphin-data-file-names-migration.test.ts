import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrarNombresDeArchivosDeDatos } from './dolphin-data-file-names-migration'

let raiz = ''
afterEach(() => {
  if (raiz) {
    rmSync(raiz, { recursive: true, force: true })
  }
})

describe('migrarNombresDeArchivosDeDatos', () => {
  it('renombra los archivos viejos de la raíz y de cada perfil, y solo una vez', () => {
    raiz = mkdtempSync(join(tmpdir(), 'dolphin-nombres-'))
    mkdirSync(join(raiz, 'profiles', 'p1'), { recursive: true })
    writeFileSync(join(raiz, 'dolphin-profile-index.json'), '{"activo":"p1"}')
    writeFileSync(join(raiz, 'dolphind.lock'), '{"pid":1}')
    writeFileSync(join(raiz, 'profiles', 'p1', 'dolphin-data.json'), '{"repos":[]}')

    const movidos = migrarNombresDeArchivosDeDatos(raiz)

    expect(movidos).toHaveLength(3)
    expect(readFileSync(join(raiz, 'dolphin-profile-index.json'), 'utf8')).toBe('{"activo":"p1"}')
    expect(readFileSync(join(raiz, 'dolphind.lock'), 'utf8')).toBe('{"pid":1}')
    expect(readFileSync(join(raiz, 'profiles', 'p1', 'dolphin-data.json'), 'utf8')).toBe(
      '{"repos":[]}'
    )
    expect(existsSync(join(raiz, 'dolphin-profile-index.json'))).toBe(false)
    expect(migrarNombresDeArchivosDeDatos(raiz)).toEqual([])
  })

  it('si ya existe el nombre nuevo, gana y el viejo no se toca', () => {
    raiz = mkdtempSync(join(tmpdir(), 'dolphin-nombres-'))
    writeFileSync(join(raiz, 'dolphin-stats.json'), 'viejo')
    writeFileSync(join(raiz, 'dolphin-stats.json'), 'nuevo')

    expect(migrarNombresDeArchivosDeDatos(raiz)).toEqual([])
    expect(readFileSync(join(raiz, 'dolphin-stats.json'), 'utf8')).toBe('nuevo')
    expect(readFileSync(join(raiz, 'dolphin-stats.json'), 'utf8')).toBe('viejo')
  })

  it('una carpeta sin nada no falla', () => {
    raiz = mkdtempSync(join(tmpdir(), 'dolphin-nombres-'))
    expect(migrarNombresDeArchivosDeDatos(raiz)).toEqual([])
  })
})
