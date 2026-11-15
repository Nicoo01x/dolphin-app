import { describe, expect, it } from 'vitest'
import {
  FONDO_DEL_CHAT_DE_FABRICA,
  fondoDelChat,
  nombreDeFondoPropioValido,
  OSCURIDAD_DE_PANEL,
  VELO_MAXIMO,
  VELO_MINIMO,
  veloDePanel
} from './fondo-del-chat'

describe('fondoDelChat', () => {
  it('sin ajuste guardado viene el óleo de fábrica', () => {
    expect(fondoDelChat(undefined)).toEqual(FONDO_DEL_CHAT_DE_FABRICA)
    expect(FONDO_DEL_CHAT_DE_FABRICA.fuente).toEqual({ tipo: 'incluido', id: 'merced' })
  })

  it('«Ninguno» se respeta: no vuelve solo al de fábrica', () => {
    expect(fondoDelChat({ fuente: { tipo: 'ninguno' }, velo: 0.7 }).fuente).toEqual({
      tipo: 'ninguno'
    })
  })

  it('un óleo que no existe o una fuente rota vuelven al de fábrica', () => {
    expect(fondoDelChat({ fuente: { tipo: 'incluido', id: 'monalisa' } }).fuente).toEqual(
      FONDO_DEL_CHAT_DE_FABRICA.fuente
    )
    expect(fondoDelChat({ fuente: 'merced' }).fuente).toEqual(FONDO_DEL_CHAT_DE_FABRICA.fuente)
  })

  it('el velo queda dentro del rango del deslizador', () => {
    expect(fondoDelChat({ velo: 0.1 }).velo).toBe(VELO_MINIMO)
    expect(fondoDelChat({ velo: 2 }).velo).toBe(VELO_MAXIMO)
    expect(fondoDelChat({ velo: Number.NaN }).velo).toBe(FONDO_DEL_CHAT_DE_FABRICA.velo)
  })

  it('una imagen propia sólo con un nombre de archivo nuestro, nunca una ruta', () => {
    expect(fondoDelChat({ fuente: { tipo: 'propio', nombre: 'a1b2.webp' } }).fuente).toEqual({
      tipo: 'propio',
      nombre: 'a1b2.webp'
    })
    expect(nombreDeFondoPropioValido('../../perfil.db')).toBe(false)
    expect(nombreDeFondoPropioValido(String.raw`C:\fotos\cielo.png`)).toBe(false)
    expect(nombreDeFondoPropioValido('cielo.exe')).toBe(false)
    expect(nombreDeFondoPropioValido('a..b.png')).toBe(false)
  })
})

describe('veloDePanel', () => {
  it('el panel completa lo que le falta a la ventana para llegar siempre a la misma oscuridad', () => {
    for (const velo of [VELO_MINIMO, 0.64, 0.75]) {
      const panel = veloDePanel(velo)
      expect(1 - (1 - velo) * (1 - panel)).toBeCloseTo(OSCURIDAD_DE_PANEL, 6)
    }
    // Más oscura que eso, la ventana ya alcanza sola.
    expect(veloDePanel(VELO_MAXIMO)).toBe(0)
  })
})
