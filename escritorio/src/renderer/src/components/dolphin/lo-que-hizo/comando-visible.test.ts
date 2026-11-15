import { describe, expect, it } from 'vitest'
import { comandoVisible } from './comando-visible'

const PWSH = 'C:\\Users\\ana-dev\\AppData\\Local\\Programs\\pwsh\\pwsh.exe'

describe('comandoVisible', () => {
  it('saca el pwsh -Command de la línea que manda Codex en Windows', () => {
    const linea = `"${PWSH.replaceAll('\\', '\\\\')}" -Command 'Get-Content src/catalogo.ts; npm test'`
    expect(comandoVisible({ command: linea })).toBe('Get-Content src/catalogo.ts; npm test')
  })

  it('y del argv, con las opciones sin valor antes del -Command', () => {
    expect(comandoVisible({ command: [PWSH, '-NoProfile', '-Command', 'npm test'] })).toBe(
      'npm test'
    )
  })

  it('el script de un shell POSIX con -lc', () => {
    expect(comandoVisible({ command: ['/bin/bash', '-lc', 'npm run typecheck'] })).toBe(
      'npm run typecheck'
    )
  })

  it('no toca un comando que no es un lanzamiento', () => {
    expect(comandoVisible({ command: 'npm test -- --run' })).toBe('npm test -- --run')
    expect(comandoVisible({ command: ['git', 'status', '--short'] })).toBe('git status --short')
  })

  it('un pwsh con -File no tiene script para mostrar: queda como vino', () => {
    expect(comandoVisible({ command: [PWSH, '-File', 'build.ps1'] })).toBe(
      `${PWSH} -File build.ps1`
    )
  })

  it('null sin comando', () => {
    expect(comandoVisible({})).toBeNull()
    expect(comandoVisible({ command: '   ' })).toBeNull()
  })
})
