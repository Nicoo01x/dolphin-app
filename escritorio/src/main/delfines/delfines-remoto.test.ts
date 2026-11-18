import { describe, expect, it } from 'vitest'
import { envolverScript, leerSalidaEnvuelta } from './delfines-remoto'

describe('un comando en el servidor', () => {
  it('corre en un sh de login con el PATH donde suelen estar claude y codex, y dice su código', () => {
    const envuelto = envolverScript("echo 'hola'")
    expect(envuelto.startsWith('sh -lc \'export PATH="$HOME/.local/bin:')).toBe(true)
    expect(envuelto).toContain("echo '\\''hola'\\''")
    expect(envuelto).toContain('DOLPHIN_DELFIN_FIN:')
  })

  it('un no-cero es una respuesta, no una excepción', () => {
    expect(leerSalidaEnvuelta('banner\nError: no\n\nDOLPHIN_DELFIN_FIN:1\n')).toEqual({
      codigo: 1,
      salida: 'banner\nError: no'
    })
    expect(leerSalidaEnvuelta('se cortó')).toEqual({ codigo: 255, salida: 'se cortó' })
  })
})
