import { describe, expect, it } from 'vitest'
import {
  ALFA_MINIMO_DEL_VIDRIO,
  alfaDelVidrio,
  ATENUADO_SOBRE_VIDRIO_CLARO,
  ATENUADO_SOBRE_VIDRIO_OSCURO,
  colorDelVidrio,
  contraste,
  EXTREMOS,
  FONDO_DEL_CHAT_DE_FABRICA,
  fondoDelChat,
  luminancia,
  luzDelVidrio,
  mezcla,
  nombreDeFondoPropioValido,
  PISO_DEL_VIDRIO_CLARO,
  TECHO_DEL_VIDRIO_OSCURO,
  TINTA_DEL_VIDRIO_CLARO,
  TINTA_DEL_VIDRIO_OSCURO,
  VELO_MAXIMO,
  VELO_MINIMO
} from './fondo-del-chat'

describe('fondoDelChat', () => {
  it('sin ajuste guardado viene el óleo de fábrica', () => {
    expect(fondoDelChat(undefined)).toEqual(FONDO_DEL_CHAT_DE_FABRICA)
    // El mismo óleo de la referencia: «Among the Sierra Nevada, California», de Bierstadt.
    expect(FONDO_DEL_CHAT_DE_FABRICA.fuente).toEqual({
      tipo: 'incluido',
      id: 'sierra'
    })
    expect(FONDO_DEL_CHAT_DE_FABRICA.panelesOpacos).toBe(false)
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
    // Los que ya venían siguen ahí para quien los eligió.
    expect(fondoDelChat({ fuente: { tipo: 'incluido', id: 'merced' } }).fuente).toEqual({
      tipo: 'incluido',
      id: 'merced'
    })
  })

  it('el velo queda dentro del rango del deslizador', () => {
    expect(fondoDelChat({ velo: 0.1 }).velo).toBe(VELO_MINIMO)
    expect(fondoDelChat({ velo: 2 }).velo).toBe(VELO_MAXIMO)
    expect(fondoDelChat({ velo: Number.NaN }).velo).toBe(FONDO_DEL_CHAT_DE_FABRICA.velo)
  })

  // Lo elige la persona; no lo decide el sistema (los «Efectos de transparencia» de Windows).
  it('«Paneles opacos» sólo si se eligió', () => {
    expect(fondoDelChat({ panelesOpacos: true }).panelesOpacos).toBe(true)
    expect(fondoDelChat({ panelesOpacos: 'sí' }).panelesOpacos).toBe(false)
    expect(fondoDelChat({}).panelesOpacos).toBe(false)
  })

  // Hubo un interruptor «Ventana flotante» (margen de pintura alrededor) que ya no existe: lo que
  // haya quedado guardado se ignora y no viaja en el valor leído.
  it('un «ventanaFlotante» guardado de antes se ignora', () => {
    const leido = fondoDelChat({ ventanaFlotante: true, panelesOpacos: false })
    expect(leido).not.toHaveProperty('ventanaFlotante')
    expect(leido).toEqual({ ...FONDO_DEL_CHAT_DE_FABRICA, fuente: leido.fuente })
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

describe('el vidrio de los paneles', () => {
  it('la curva lleva el blanco al techo y el negro al piso, y conserva el orden de las luces', () => {
    expect(luzDelVidrio(1, 'oscuro')).toBeCloseTo(TECHO_DEL_VIDRIO_OSCURO, 9)
    expect(luzDelVidrio(0, 'oscuro')).toBe(0)
    expect(luzDelVidrio(0, 'claro')).toBeCloseTo(PISO_DEL_VIDRIO_CLARO, 9)
    expect(luzDelVidrio(1, 'claro')).toBe(1)
    // El dibujo se conserva: lo más claro sigue más claro, en los dos temas.
    for (const tema of ['oscuro', 'claro'] as const) {
      expect(luzDelVidrio(0.2, tema)).toBeLessThan(luzDelVidrio(0.5, tema))
      expect(luzDelVidrio(0.5, tema)).toBeLessThan(luzDelVidrio(0.9, tema))
    }
  })

  it('el texto atenuado llega a 4,5:1 sobre el peor punto que deja pasar el vidrio, de cualquier color', () => {
    for (const color of EXTREMOS) {
      const luz = colorDelVidrio(color, 'oscuro')
      expect(luminancia(luz)).toBeLessThanOrEqual(TECHO_DEL_VIDRIO_OSCURO + 1e-3)
      const fondo = mezcla(TINTA_DEL_VIDRIO_OSCURO, ALFA_MINIMO_DEL_VIDRIO.oscuro, luz)
      expect(contraste(fondo, ATENUADO_SOBRE_VIDRIO_OSCURO)).toBeGreaterThanOrEqual(4.5)
    }
    for (const color of EXTREMOS) {
      const sombra = colorDelVidrio(color, 'claro')
      expect(luminancia(sombra)).toBeGreaterThanOrEqual(PISO_DEL_VIDRIO_CLARO - 1e-3)
      const fondo = mezcla(TINTA_DEL_VIDRIO_CLARO, ALFA_MINIMO_DEL_VIDRIO.claro, sombra)
      expect(contraste(fondo, ATENUADO_SOBRE_VIDRIO_CLARO)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('deja ver la pintura: la tinta mínima es liviana, no un panel opaco', () => {
    expect(ALFA_MINIMO_DEL_VIDRIO.oscuro).toBeLessThan(0.35)
    expect(ALFA_MINIMO_DEL_VIDRIO.claro).toBeLessThan(0.35)
  })

  it('el deslizador suma tinta desde la mínima, sin pasarse', () => {
    expect(alfaDelVidrio(VELO_MINIMO, 'oscuro')).toBe(ALFA_MINIMO_DEL_VIDRIO.oscuro)
    expect(alfaDelVidrio(0, 'claro')).toBe(ALFA_MINIMO_DEL_VIDRIO.claro)
    expect(alfaDelVidrio(VELO_MAXIMO, 'oscuro')).toBeCloseTo(ALFA_MINIMO_DEL_VIDRIO.oscuro + 0.5, 6)
    expect(alfaDelVidrio(FONDO_DEL_CHAT_DE_FABRICA.velo, 'oscuro')).toBeGreaterThan(
      ALFA_MINIMO_DEL_VIDRIO.oscuro
    )
  })
})
