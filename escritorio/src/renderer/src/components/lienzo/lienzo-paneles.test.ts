import { describe, expect, it } from 'vitest'
import { agrandarOVolver, conRect, losOtros, traerAlFrente } from './lienzo-paneles'
import type { PanelDelLienzo } from './lienzo-paneles'

const uno = (id: string, x: number): PanelDelLienzo => ({
  id,
  tipo: 'consola',
  titulo: id,
  rect: { x, y: 0, width: 400, height: 300 }
})

const TODA_LA_VISTA = { x: 0, y: 0, width: 1200, height: 700 }

describe('las ventanas del lienzo', () => {
  it('la tocada pasa al final de la lista, que es la que se dibuja arriba', () => {
    const paneles = [uno('a', 0), uno('b', 500), uno('c', 1000)]
    expect(traerAlFrente(paneles, 'a').map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('el imán mira a todas menos a la que se está moviendo', () => {
    const paneles = [uno('a', 0), uno('b', 500)]
    expect(losOtros(paneles, 'a')).toEqual([paneles[1]!.rect])
  })

  it('agrandar guarda dónde estaba y volver la devuelve ahí', () => {
    const paneles = [uno('a', 120)]
    const grande = agrandarOVolver(paneles, 'a', TODA_LA_VISTA)
    expect(grande[0]!.rect).toEqual(TODA_LA_VISTA)
    expect(grande[0]!.antesDeAgrandar).toEqual(paneles[0]!.rect)

    const chica = agrandarOVolver(grande, 'a', TODA_LA_VISTA)
    expect(chica[0]!.rect).toEqual(paneles[0]!.rect)
    // Y deja de estar agrandada: si no, el botón quedaría diciendo «volver» para siempre.
    expect(chica[0]!.antesDeAgrandar).toBeUndefined()
  })

  it('moverla cuando está agrandada la deja de agrandar', () => {
    // Si no, el botón de volver la mandaría a un lugar que ya no tiene nada que ver.
    const grande = agrandarOVolver([uno('a', 120)], 'a', TODA_LA_VISTA)
    const movida = conRect(grande, 'a', { x: 50, y: 50, width: 400, height: 300 })
    expect(movida[0]!.antesDeAgrandar).toBeUndefined()
    expect(movida[0]!.rect).toEqual({ x: 50, y: 50, width: 400, height: 300 })
  })

  it('agrandar una no toca a las otras', () => {
    const paneles = [uno('a', 0), uno('b', 500)]
    const grande = agrandarOVolver(paneles, 'a', TODA_LA_VISTA)
    expect(grande[1]).toBe(paneles[1])
  })
})
