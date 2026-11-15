// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import { ColumnasDelTablero } from './ColumnasDelTablero'
import { proyectosDelTablero } from './proyectos-del-tablero'

afterEach(cleanup)

const tarjeta = (parcial: Partial<TarjetaDelTablero> & { id: string }): TarjetaDelTablero => ({
  titulo: `Tarjeta ${parcial.id}`,
  columna: 'ideas',
  tipo: 'tarea',
  movida: `2026-10-${parcial.id.padStart(2, '0')}T00:00:00.000Z`,
  ...parcial
})

const columna = (nombre: string): HTMLElement => screen.getByRole('region', { name: nombre })

describe('ColumnasDelTablero', () => {
  it('con onElegir, las tarjetas de Ideas y Para hacer son botones y las demás no', async () => {
    const onElegir = vi.fn()
    const idea = tarjeta({ id: '1', columna: 'ideas', titulo: 'Una idea' })
    render(
      <ColumnasDelTablero
        onElegir={onElegir}
        tarjetas={[
          idea,
          tarjeta({ id: '2', columna: 'para-hacer', titulo: 'Algo aprobado' }),
          tarjeta({ id: '3', columna: 'haciendo', titulo: 'En curso' }),
          tarjeta({ id: '4', columna: 'hecho', titulo: 'Terminada' })
        ]}
      />
    )
    expect(within(columna('Ideas')).getByRole('button', { name: /Una idea/ })).toBeTruthy()
    expect(within(columna('To do')).getByRole('button', { name: /Algo aprobado/ })).toBeTruthy()
    expect(within(columna('Doing')).queryByRole('button')).toBeNull()
    expect(within(columna('Done')).queryByRole('button')).toBeNull()

    await userEvent.click(within(columna('Ideas')).getByRole('button', { name: /Una idea/ }))
    expect(onElegir).toHaveBeenCalledWith(idea)
  })

  it('una columna vacía muestra sólo su nombre, sin «0», y se achica; la llena cuenta', () => {
    render(
      <ColumnasDelTablero
        tarjetas={[tarjeta({ id: '1', columna: 'ideas' }), tarjeta({ id: '2', columna: 'ideas' })]}
      />
    )
    const ideas = columna('Ideas')
    expect(within(ideas).getByText('2')).toBeTruthy()
    expect(ideas.hasAttribute('data-vacia')).toBe(false)
    const hecho = columna('Done')
    expect(hecho.querySelector('h3')?.textContent).toBe('Done')
    expect(hecho.hasAttribute('data-vacia')).toBe(true)
    expect(hecho.className).toContain('flex-none')
    expect(ideas.className).toContain('flex-1')
  })

  it('en reposo ninguna columna es una caja: no tiene fondo propio', () => {
    render(<ColumnasDelTablero tarjetas={[tarjeta({ id: '1' })]} />)
    for (const seccion of screen.getAllByRole('region')) {
      expect(seccion.className).not.toMatch(/\bbg-/)
    }
  })

  it('con la tarjeta de ejemplo las cinco columnas van parejas', () => {
    render(
      <ColumnasDelTablero
        tarjetas={[tarjeta({ id: 'e' })]}
        ejemplo={{ id: 'e', llenas: 0, visible: true }}
      />
    )
    for (const seccion of screen.getAllByRole('region')) {
      expect(seccion.className).toContain('flex-1')
    }
  })

  it('sin onElegir ninguna tarjeta es un botón', () => {
    render(<ColumnasDelTablero tarjetas={[tarjeta({ id: '1' })]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lista todas las tarjetas de la columna, aunque sean cuarenta, en su propio scroll', () => {
    const cuarenta = Array.from({ length: 40 }, (_, i) => tarjeta({ id: String(i + 1) }))
    render(<ColumnasDelTablero tarjetas={cuarenta} />)
    const ideas = columna('Ideas')
    expect(within(ideas).getAllByRole('listitem')).toHaveLength(40)
    expect(within(ideas).getByRole('list').className).toContain('overflow-y-auto')
  })

  it('dice quién tiene la tarjeta y en qué anda el espacio que la trabaja', () => {
    const conRama = tarjeta({ id: '1', columna: 'haciendo', quien: 'agentes', rama: 'feat/x' })
    render(
      <ColumnasDelTablero
        tarjetas={[conRama, tarjeta({ id: '2', columna: 'para-hacer', rama: 'feat/y' })]}
        estadoDe={(t) => (t.id === '1' ? { estado: 'working', etiqueta: 'Working' } : undefined)}
      />
    )
    expect(within(columna('Doing')).getByText('agentes · Working')).toBeTruthy()
    // Sin un espacio que la trabaje, la rama dice dónde va a caer.
    expect(within(columna('To do')).getByText('feat/y')).toBeTruthy()
  })

  it('aguanta un título larguísimo sin cortarlo del todo: queda entero en el title', () => {
    const titulo = 'Una tarea con un título muy largo '.repeat(8).trim()
    render(<ColumnasDelTablero tarjetas={[tarjeta({ id: '1', titulo })]} />)
    expect(screen.getByTitle(titulo).className).toContain('line-clamp-2')
  })

  it('dibuja la tira del portón sólo en las tarjetas con rama y dato del portón', () => {
    render(
      <ColumnasDelTablero
        tarjetas={[
          tarjeta({
            id: '1',
            columna: 'para-revisar',
            rama: 'feat/x',
            porton: [
              { fase: 'tipos', estado: 'paso' },
              { fase: 'test', estado: 'fallo' }
            ]
          }),
          tarjeta({ id: '2', columna: 'para-revisar', rama: 'feat/y' })
        ]}
      />
    )
    expect(screen.getAllByTitle('Gate: bounced at test')).toHaveLength(1)
    expect(document.querySelectorAll('[data-dolphin-tira-porton]')).toHaveLength(1)
  })

  it('con Alt+flecha la tarjeta pasa a la columna de al lado y se anuncia', async () => {
    const onMover = vi.fn()
    const idea = tarjeta({ id: '1', columna: 'ideas', titulo: 'Una idea' })
    render(<ColumnasDelTablero tarjetas={[idea]} onMover={onMover} />)
    within(columna('Ideas')).getByLabelText('Una idea').focus()
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(onMover).toHaveBeenCalledWith(idea, 'para-hacer')
    expect(screen.getByText('Moved to To do')).toBeTruthy()
    // En el borde del tablero no hay adónde ir.
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(onMover).toHaveBeenCalledTimes(1)
  })

  it('la tarjeta de ejemplo no se toca ni se arrastra, y las columnas no cuentan', () => {
    const ejemplo = tarjeta({ id: 'e', columna: 'ideas', titulo: 'Ejemplo' })
    render(
      <ColumnasDelTablero
        tarjetas={[ejemplo]}
        onElegir={vi.fn()}
        onMover={vi.fn()}
        ejemplo={{ id: 'e', llenas: 0, visible: true }}
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(within(columna('Ideas')).queryByText('1')).toBeNull()
  })
})

describe('proyectosDelTablero', () => {
  it('uno por repo con el primer espacio de trabajo, y sin los repos sin espacios', () => {
    expect(
      proyectosDelTablero(
        [
          { id: 'r1', displayName: 'dolphin-app' },
          { id: 'r2', displayName: 'vacío' },
          { id: 'r3', displayName: 'tienda-web' }
        ],
        { r1: [{ id: 'w1' }, { id: 'w2' }], r2: [], r3: [{ id: 'w3' }] }
      )
    ).toEqual([
      { worktreeId: 'w1', repoId: 'r1', nombre: 'dolphin-app' },
      { worktreeId: 'w3', repoId: 'r3', nombre: 'tienda-web' }
    ])
  })
})
