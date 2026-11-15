// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EspacioConEstado } from './estado-del-inicio'
import { FranjaDeHoy } from './FranjaDeHoy'

afterEach(cleanup)

const AHORA = Date.parse('2026-11-11T15:00:00')

const HOY: EspacioConEstado[] = [
  {
    espacio: {
      id: 'w1',
      repoId: 'r1',
      nombre: 'buscador-ajustes',
      proyecto: 'tienda-web',
      rama: 'dolphin/buscador-ajustes',
      ultimaActividad: AHORA - 600_000,
      creado: AHORA - 86_400_000
    },
    estado: 'working'
  }
]

describe('FranjaDeHoy', () => {
  it('sin nada de hoy no dibuja nada, ni el mapa', () => {
    const { container } = render(
      <FranjaDeHoy hoy={[]} ahora={AHORA} cuandoTrabajaste={[AHORA - 3_600_000]} conMapa />
    )
    expect(container.innerHTML).toBe('')
  })

  it('con algo de hoy y el mapa en cero, sólo la lista: sin «Activity» ni «0 in all»', () => {
    render(<FranjaDeHoy hoy={HOY} ahora={AHORA} cuandoTrabajaste={[]} conMapa />)
    expect(screen.getByRole('heading', { name: /Today/ })).toBeTruthy()
    expect(screen.getByText('buscador-ajustes')).toBeTruthy()
    expect(screen.queryByText('Activity')).toBeNull()
    expect(screen.queryByText(/in all/)).toBeNull()
  })

  it('con actividad, el mapa va al lado con su total', () => {
    render(
      <FranjaDeHoy
        hoy={HOY}
        ahora={AHORA}
        cuandoTrabajaste={[AHORA - 3_600_000, AHORA - 2 * 86_400_000]}
        conMapa
      />
    )
    expect(screen.getByText('Activity')).toBeTruthy()
    expect(screen.getByText('2 in all')).toBeTruthy()
  })
})
