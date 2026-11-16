// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccionesDelAviso, Aviso, Importancia } from './cola-de-avisos'

/**
 * El arrastre de verdad lo hace GSAP Draggable, que en happy-dom no tiene puntero que seguir. Se
 * reemplaza por uno que guarda sus callbacks, y el test los llama como los llamaría un arrastre:
 * soltar la ventana a 600 px es lo mismo que tirarla afuera.
 */
const arrastres: { onDragEnd: (this: { x: number; y: number }) => void }[] = []
vi.mock('gsap/Draggable', () => ({
  Draggable: {
    create: (_ventana: unknown, opciones: (typeof arrastres)[number]) => {
      arrastres.push(opciones)
      return [{ kill: () => {}, update: () => {} }]
    }
  }
}))
vi.mock('gsap/InertiaPlugin', () => ({ InertiaPlugin: { getVelocity: () => 0 } }))
vi.mock('@/store', () => ({
  useAppStore: (elegir: (estado: { activeModal: string }) => unknown) =>
    elegir({ activeModal: 'none' })
}))

const { ColaDeAvisos } = await import('./ColaDeAvisos')
const { encolarAviso, vaciarColaDeAvisos } = await import('./avisos-store')

function avisoDePrueba(
  id: string,
  importancia: Importancia,
  espias: { aceptar: () => void; descartado: () => void }
): Aviso {
  return {
    id,
    importancia,
    titulo: () => `Aviso ${id}`,
    alDescartar: espias.descartado,
    contenido: ({ responder }: AccionesDelAviso) => (
      <button type="button" onClick={() => responder(espias.aceptar)}>
        Aceptar {id}
      </button>
    )
  }
}

beforeEach(() => {
  arrastres.length = 0
  vaciarColaDeAvisos()
  // Con «reducir movimiento» la ventana se va sin viaje, así que el cierre es inmediato.
  vi.stubGlobal(
    'matchMedia',
    (consulta: string) =>
      ({
        matches: consulta.includes('reduce'),
        media: consulta,
        addEventListener: () => {},
        removeEventListener: () => {}
      }) as unknown as MediaQueryList
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('la cola de avisos en pantalla', () => {
  it('muestra uno solo, el más importante, centrado en su propio diálogo', () => {
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('tema', 'preferencia', espias))
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    encolarAviso(avisoDePrueba('skills', 'accion', espias))
    render(<ColaDeAvisos />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Aviso chat' })).toBeInTheDocument()
  })

  it('al responder el primero entra el siguiente', () => {
    vi.useFakeTimers()
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    encolarAviso(avisoDePrueba('skills', 'accion', espias))
    render(<ColaDeAvisos />)
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar chat' }))
    expect(espias.aceptar).toHaveBeenCalledTimes(1)
    expect(espias.descartado).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.getByRole('dialog', { name: 'Aviso skills' })).toBeInTheDocument()
  })

  it('cerrarla arrastrándola es «ahora no»: descarta y nunca acepta', () => {
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    render(<ColaDeAvisos />)
    const arrastre = arrastres.at(-1)
    expect(arrastre).toBeDefined()
    act(() => {
      arrastre?.onDragEnd.call({ x: 600, y: 0 })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(espias.descartado).toHaveBeenCalledTimes(1)
    expect(espias.aceptar).not.toHaveBeenCalled()
  })

  it('soltarla cerca la deja en su lugar, sin responder nada', () => {
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    render(<ColaDeAvisos />)
    act(() => {
      arrastres.at(-1)?.onDragEnd.call({ x: 40, y: 10 })
    })
    expect(screen.getByRole('dialog', { name: 'Aviso chat' })).toBeInTheDocument()
    expect(espias.descartado).not.toHaveBeenCalled()
    expect(espias.aceptar).not.toHaveBeenCalled()
  })

  it('Escape también es «ahora no»', () => {
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    render(<ColaDeAvisos />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(espias.descartado).toHaveBeenCalledTimes(1)
    expect(espias.aceptar).not.toHaveBeenCalled()
  })

  it('en pausa no muestra nada, y al salir de la pausa sí', () => {
    const espias = { aceptar: vi.fn(), descartado: vi.fn() }
    encolarAviso(avisoDePrueba('chat', 'uso', espias))
    const { rerender } = render(<ColaDeAvisos enPausa />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<ColaDeAvisos />)
    expect(screen.getByRole('dialog', { name: 'Aviso chat' })).toBeInTheDocument()
  })
})
