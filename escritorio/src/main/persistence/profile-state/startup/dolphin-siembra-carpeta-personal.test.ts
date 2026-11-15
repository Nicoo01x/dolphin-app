import { describe, expect, it } from 'vitest'
import { DOLPHIN_SIEMBRA_CARPETA_PERSONAL } from '../../../../shared/dolphin-brand'
import { debeSembrarCarpetaPersonal } from './dolphin-siembra-carpeta-personal'

describe('la carpeta personal en un perfil nuevo', () => {
  it('en Dolphin no se siembra: el punto de partida es el inicio con «Agregar proyecto»', () => {
    expect(DOLPHIN_SIEMBRA_CARPETA_PERSONAL).toBe(false)
    expect(debeSembrarCarpetaPersonal(true)).toBe(false)
    expect(debeSembrarCarpetaPersonal(false)).toBe(false)
    expect(debeSembrarCarpetaPersonal(undefined)).toBe(false)
  })

  it('con la bandera prendida vuelve a lo de la base: se siembra cuando la base la pide', () => {
    expect(debeSembrarCarpetaPersonal(true, true)).toBe(true)
    expect(debeSembrarCarpetaPersonal(false, true)).toBe(false)
    expect(debeSembrarCarpetaPersonal(undefined, true)).toBe(false)
  })
})
