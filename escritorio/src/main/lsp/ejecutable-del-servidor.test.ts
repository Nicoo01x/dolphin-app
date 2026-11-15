// Dónde está el servidor de lenguaje. El caso que importa es Windows: npm instala un `.cmd` y un
// script sin extensión, y lanzar el nombre pelado daba ENOENT con el servidor en el PATH.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ejecutableDelServidor } from './ejecutable-del-servidor'

const carpetas: string[] = []
function carpetaNueva(): string {
  const carpeta = mkdtempSync(join(tmpdir(), 'dolphin-lsp-'))
  carpetas.push(carpeta)
  return carpeta
}

afterEach(() => {
  for (const carpeta of carpetas.splice(0)) {
    rmSync(carpeta, { recursive: true, force: true })
  }
})

describe('el ejecutable de un servidor de lenguaje', () => {
  it('en Windows encuentra el .cmd que instala npm, no el script sin extensión', async () => {
    const bin = carpetaNueva()
    // Lo que deja `npm i -g typescript-language-server` en %APPDATA%\npm.
    writeFileSync(join(bin, 'typescript-language-server'), '#!/bin/sh\n')
    writeFileSync(join(bin, 'typescript-language-server.cmd'), '@ECHO off\r\n')
    writeFileSync(join(bin, 'typescript-language-server.ps1'), '')
    const ruta = await ejecutableDelServidor(
      { comando: 'typescript-language-server' },
      // Un home vacío: que no aparezca uno instalado de verdad en esta máquina.
      { platform: 'win32', pathEnv: bin, homePath: carpetaNueva() }
    )
    expect(ruta).toBe(join(bin, 'typescript-language-server.cmd'))
  })

  it('en Windows también encuentra un .exe (rust-analyzer, gopls)', async () => {
    const bin = carpetaNueva()
    writeFileSync(join(bin, 'gopls.exe'), '')
    const ruta = await ejecutableDelServidor(
      { comando: 'gopls' },
      { platform: 'win32', pathEnv: bin, homePath: carpetaNueva() }
    )
    expect(ruta).toBe(join(bin, 'gopls.exe'))
  })

  it('si no está en ningún lado devuelve null, no el nombre pelado', async () => {
    const ruta = await ejecutableDelServidor(
      { comando: 'servidor-de-lenguaje-que-no-existe-en-dolphin' },
      { platform: 'win32', pathEnv: carpetaNueva(), homePath: carpetaNueva() }
    )
    expect(ruta).toBeNull()
  })
})
