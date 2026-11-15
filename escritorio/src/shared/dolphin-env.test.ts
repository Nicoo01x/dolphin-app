import { describe, expect, it } from 'vitest'
import {
  borrarEnvDolphin,
  leerEnvDolphin,
  leerEnvDolphinNoVacio,
  ponerEnvDolphin
} from './dolphin-env'

/**
 * Acá había además una batería sobre el nombre viejo —que se prefería el nuevo, que se caía al
 * viejo, y un barrido que sacaba de la terminal la identidad heredada de un DOLPHIN de verdad—. Se
 * fueron con lo que probaban: desde el 08/11/2026 Dolphin lee y escribe un solo nombre, y el hook
 * nativo de Windows, que era el único programa que leía el viejo sin respaldo, lee el nuevo.
 */
describe('leerEnvDolphin', () => {
  it('reads the Dolphin variable', () => {
    expect(leerEnvDolphin('GITEA_TOKEN', { DOLPHIN_GITEA_TOKEN: 'token' })).toBe('token')
  })

  it("never reads the bare variable: the user's CODEX_HOME is not Dolphin's overlay", () => {
    const env = { CODEX_HOME: '/home/me/.codex', NODE_OPTIONS: '--inspect' }
    expect(leerEnvDolphin('CODEX_HOME', env)).toBeUndefined()
    expect(leerEnvDolphin('NODE_OPTIONS', env)).toBeUndefined()
    expect(leerEnvDolphin('CODEX_HOME', { ...env, DOLPHIN_CODEX_HOME: '/d' })).toBe('/d')
    // El prefijo que escriba quien llama no cambia el nombre que se lee.
    expect(leerEnvDolphin('DOLPHIN_CODEX_HOME', { DOLPHIN_CODEX_HOME: '/o' })).toBe('/o')
  })

  it('treats an empty value as not configured', () => {
    expect(leerEnvDolphinNoVacio('GITEA_TOKEN', { DOLPHIN_GITEA_TOKEN: '  ' })).toBeNull()
  })

  it('returns undefined with no environment at all', () => {
    expect(leerEnvDolphin('GITEA_TOKEN', {})).toBeUndefined()
  })
})

describe('ponerEnvDolphin y borrarEnvDolphin', () => {
  it('writes and removes one single name', () => {
    // Why se afirma la forma entera y no sólo la clave nueva: lo que se fue de acá fue un alias con
    // el nombre viejo, y un `toEqual` es lo que se cae si alguien lo vuelve a escribir.
    const env: Record<string, string> = {}
    ponerEnvDolphin(env, 'PANE_KEY', 'pane-1')
    expect(env).toEqual({ DOLPHIN_PANE_KEY: 'pane-1' })

    borrarEnvDolphin(env, 'PANE_KEY')
    expect(env).toEqual({})
  })
})
