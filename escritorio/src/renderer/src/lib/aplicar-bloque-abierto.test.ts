import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  aplicarBloqueEnElEditorAbierto,
  hayDondeAplicar,
  olvidarDestinosDeApply,
  registrarDestinoDeApply,
  type ComoSalioElApply
} from './aplicar-bloque-abierto'

/**
 * Lo que fija esto es a QUIÉN le toca el bloque. Escribirlo en el archivo equivocado es peor que
 * no escribirlo: la persona apretó un botón y el cambio apareció en otro lado, donde no lo mira.
 */

function destino(ruta: string, foco: number, salida: ComoSalioElApply = 'aplicado') {
  const aplicar = vi.fn(() => salida)
  return {
    aplicar,
    registro: { rutaDelArchivo: ruta, ultimoFoco: () => foco, aplicar }
  }
}

afterEach(() => {
  olvidarDestinosDeApply()
})

describe('dónde va un bloque del chat', () => {
  it('sin ningún editor abierto no escribe nada y lo dice', () => {
    expect(hayDondeAplicar()).toBe(false)
    expect(aplicarBloqueEnElEditorAbierto('const a = 1')).toEqual({ estado: 'sin-editor' })
  })

  it('va al editor que tuvo el foco más recientemente, no al último que se abrió', () => {
    const viejo = destino('viejo.ts', 100)
    const reciente = destino('reciente.ts', 900)
    // Se registra primero el reciente: lo que decide es el foco, no el orden.
    registrarDestinoDeApply(reciente.registro)
    registrarDestinoDeApply(viejo.registro)

    expect(aplicarBloqueEnElEditorAbierto('x')).toEqual({
      estado: 'aplicado',
      archivo: 'reciente.ts'
    })
    expect(reciente.aplicar).toHaveBeenCalledWith('x')
    expect(viejo.aplicar).not.toHaveBeenCalled()
  })

  it('pasa tal cual la negativa del editor, con el archivo', () => {
    const uno = destino('uno.ts', 10, 'ambiguo')
    registrarDestinoDeApply(uno.registro)
    expect(aplicarBloqueEnElEditorAbierto('}')).toEqual({ estado: 'ambiguo', archivo: 'uno.ts' })
  })

  it('un editor que se cerró deja de recibir bloques', () => {
    const uno = destino('uno.ts', 10)
    const olvidar = registrarDestinoDeApply(uno.registro)
    olvidar()
    expect(hayDondeAplicar()).toBe(false)
    expect(aplicarBloqueEnElEditorAbierto('x')).toEqual({ estado: 'sin-editor' })
    expect(uno.aplicar).not.toHaveBeenCalled()
  })

  it('el foco se lee en cada uso, no al registrarse', () => {
    let focoDeUno = 10
    const dos = destino('dos.ts', 20)
    const aplicarUno = vi.fn<() => ComoSalioElApply>(() => 'aplicado')
    registrarDestinoDeApply({
      rutaDelArchivo: 'uno.ts',
      ultimoFoco: () => focoDeUno,
      aplicar: aplicarUno
    })
    registrarDestinoDeApply(dos.registro)
    expect(aplicarBloqueEnElEditorAbierto('x')).toEqual({ estado: 'aplicado', archivo: 'dos.ts' })

    // La persona vuelve al primero: el próximo bloque tiene que ir ahí.
    focoDeUno = 99
    expect(aplicarBloqueEnElEditorAbierto('x')).toEqual({ estado: 'aplicado', archivo: 'uno.ts' })
  })
})
