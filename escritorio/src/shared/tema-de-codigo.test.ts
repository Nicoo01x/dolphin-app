import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO_DOLPHIN } from './default-global-settings-dolphin'
import {
  PALETA_NOCHE_CLARA,
  PALETA_NOCHE_OSCURA,
  paletaDeFabrica,
  temaDeCodigo,
  TEMA_DE_CODIGO_ANTERIOR
} from './tema-de-codigo'
import { PALETA_OSCURA } from './paleta-de-codigo'

function luz(hex: string): number {
  const canal = (i: number): number => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luz(a), luz(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (oscuro! + 0.05)
}

describe('el tema de código', () => {
  it('un perfil nuevo nace con Noche', () => {
    expect(AJUSTES_POR_DEFECTO_DOLPHIN.temaDeCodigo).toBe('noche')
  })

  it('un perfil que nunca eligió (o con un valor roto) sigue con el de antes', () => {
    expect(temaDeCodigo(undefined)).toBe(TEMA_DE_CODIGO_ANTERIOR)
    expect(temaDeCodigo('flúor')).toBe('dolphin')
    expect(temaDeCodigo('noche')).toBe('noche')
  })

  it('el de siempre no cambia', () => {
    expect(paletaDeFabrica('dolphin', true)).toBe(PALETA_OSCURA)
  })

  it.each([
    ['oscura', PALETA_NOCHE_OSCURA, '0e0e0e'],
    ['clara', PALETA_NOCHE_CLARA, 'fcfcfc']
  ])('cada tinta de Noche %s llega a AA sobre su lienzo', (_nombre, paleta, lienzo) => {
    for (const [rol, tinta] of Object.entries(paleta)) {
      expect(contraste(tinta.color, lienzo), rol).toBeGreaterThanOrEqual(4.5)
    }
  })
})
