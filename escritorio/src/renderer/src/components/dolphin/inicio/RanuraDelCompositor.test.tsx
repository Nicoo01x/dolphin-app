// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RanuraDelCompositor } from './RanuraDelCompositor'

afterEach(cleanup)

const compositor = <textarea aria-label="Compositor de verdad" />
const hueco = (): Element | null => document.querySelector('[data-dolphin-hueco-compositor]')

describe('RanuraDelCompositor', () => {
  it('mientras carga guarda el lugar del compositor sin montarlo', () => {
    render(<RanuraDelCompositor listo={false} perfilNuevo={false} compositor={compositor} />)
    expect(hueco()).not.toBeNull()
    expect(screen.queryByLabelText('Compositor de verdad')).toBeNull()
    // El hueco no se puede usar ni se anuncia: no es un compositor.
    expect(hueco()?.getAttribute('aria-hidden')).toBe('true')
    const cuadro = hueco()?.querySelector('textarea')
    expect(cuadro?.disabled).toBe(true)
    expect(cuadro?.tabIndex).toBe(-1)
  })

  it('el hueco y el compositor van en la misma ranura, así ocupan el mismo lugar', () => {
    const vista = render(
      <RanuraDelCompositor listo={false} perfilNuevo={false} compositor={compositor} />
    )
    const ranuraCargando = hueco()?.parentElement?.parentElement?.className
    vista.rerender(<RanuraDelCompositor listo perfilNuevo={false} compositor={compositor} />)
    expect(hueco()).toBeNull()
    const ranuraLista = screen.getByLabelText('Compositor de verdad').parentElement?.parentElement
    expect(ranuraLista?.className).toBe(ranuraCargando)
  })

  it('en un perfil nuevo, ya cargado, no va nada: el tablero de ejemplo usa ese alto', () => {
    const { container } = render(<RanuraDelCompositor listo perfilNuevo compositor={compositor} />)
    expect(container.childElementCount).toBe(0)
  })

  it('con el botón flotante encima, la ranura le deja lugar en vez de taparlo', () => {
    // El botón de la base está en el body, como en la app (va `fixed`, fuera del inicio).
    const boton = document.createElement('button')
    boton.setAttribute('data-floating-terminal-toggle', '')
    document.body.append(boton)
    const caja = (left: number, right: number, top: number, bottom: number): DOMRect =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: la ranura sólo lee los cuatro bordes.
      ({ left, right, top, bottom, width: right - left, height: bottom - top }) as DOMRect
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this === boton) {
        return caja(740, 776, 649, 685)
      }
      return this.hasAttribute('data-dolphin-ranura-compositor')
        ? caja(280, 800, 627, 757)
        : original.call(this)
    }
    try {
      render(<RanuraDelCompositor listo perfilNuevo={false} compositor={compositor} />)
      const ranura = document.querySelector<HTMLElement>('[data-dolphin-ranura-compositor]')
      expect(ranura?.style.paddingRight).toBe('72px')
    } finally {
      Element.prototype.getBoundingClientRect = original
      boton.remove()
    }
  })

  it('sin compositor no reserva lugar', () => {
    const { container } = render(<RanuraDelCompositor listo={false} perfilNuevo={false} />)
    expect(container.childElementCount).toBe(0)
  })
})
