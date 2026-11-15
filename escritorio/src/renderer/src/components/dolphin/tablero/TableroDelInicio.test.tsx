// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PedidoDeMoverTarjeta,
  TarjetaDelTablero,
  TarjetaMovida
} from '../../../../../shared/dolphin-tablero-types'
import { TableroDelInicio } from './TableroDelInicio'

afterEach(cleanup)

const idea: TarjetaDelTablero = {
  id: 'a',
  titulo: 'Exportar el informe a PDF',
  columna: 'ideas',
  tipo: 'tarea',
  movida: '2026-11-01T00:00:00.000Z'
}

/** Una lectura nueva del disco: cada vuelta trae un objeto nuevo, aunque diga lo mismo. */
const leido = (tarjetas: TarjetaDelTablero[] = [idea]) => ({ worktreeId: 'w1', tarjetas })

/** Un mover que contesta cuando el test lo dice, como una consola que tarda en arrancar. */
function moverQueEspera() {
  const pendientes: ((movida: TarjetaMovida) => void)[] = []
  const mover = vi.fn(
    (_pedido: PedidoDeMoverTarjeta) =>
      new Promise<TarjetaMovida>((contestar) => pendientes.push(contestar))
  )
  const contestar = async (movida: TarjetaMovida): Promise<void> => {
    await act(async () => pendientes.shift()?.(movida))
  }
  return { mover, contestar }
}

function montar(mover: ReturnType<typeof moverQueEspera>['mover']) {
  const onReleer = vi.fn()
  const props = {
    proyectos: [{ worktreeId: 'w1', repoId: 'r1', nombre: 'dolphin-app' }],
    espacios: [],
    estados: new Map(),
    onElegir: vi.fn(),
    mover,
    onReleer
  }
  const vista = render(<TableroDelInicio tablero={leido()} {...props} />)
  const releer = (tarjetas?: TarjetaDelTablero[]): void =>
    vista.rerender(<TableroDelInicio tablero={leido(tarjetas)} {...props} />)
  return { onReleer, releer }
}

const columna = (nombre: string): HTMLElement => screen.getByRole('region', { name: nombre })

async function moverALaDerecha(): Promise<void> {
  screen.getByRole('button', { name: /Exportar el informe a PDF/ }).focus()
  await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
}

describe('TableroDelInicio: mover una tarjeta', () => {
  it('mientras la consola arranca, la tarjeta espera en su columna nueva, guardándose', async () => {
    const { mover } = moverQueEspera()
    const { releer } = montar(mover)
    await moverALaDerecha()

    const enDestino = within(columna('To do')).getByText('Exportar el informe a PDF')
    expect(enDestino.closest('li')?.getAttribute('aria-busy')).toBe('true')
    expect(within(columna('To do')).getByText('Saving…')).toBeTruthy()
    expect(within(columna('Ideas')).queryByText('Exportar el informe a PDF')).toBeNull()

    // Volver a la ventana relee el disco, que todavía dice Ideas: la tarjeta no vuelve atrás.
    releer()
    expect(within(columna('To do')).getByText('Exportar el informe a PDF')).toBeTruthy()
  })

  it('si la consola no arrancó a tiempo, vuelve a su columna y lo dice en palabras', async () => {
    const { mover, contestar } = moverQueEspera()
    const { onReleer } = montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'timeout', detail: '60' })

    expect(within(columna('Ideas')).getByText('Exportar el informe a PDF')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not move "Exportar el informe a PDF": Dolphin took too long to start. Try again.'
    )
    expect(screen.queryByText(/: 60/)).toBeNull()
    // Lo que haya en disco manda también después de un fallo.
    expect(onReleer).toHaveBeenCalledTimes(1)
  })

  it('Reintentar vuelve a pedir lo mismo, y si sale, el aviso viejo se va', async () => {
    const { mover, contestar } = moverQueEspera()
    const { onReleer } = montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'timeout', detail: '60' })

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mover).toHaveBeenLastCalledWith({ worktreeId: 'w1', id: 'a', columna: 'para-hacer' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(columna('To do')).getByText('Saving…')).toBeTruthy()

    await contestar({ ok: true })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(columna('To do')).queryByText('Saving…')).toBeNull()
    expect(within(columna('To do')).getByText('Exportar el informe a PDF')).toBeTruthy()
    expect(onReleer).toHaveBeenCalledTimes(2)
  })

  it('el aviso sobrevive a la lectura que lo acompaña y se va con la siguiente', async () => {
    const { mover, contestar } = moverQueEspera()
    const { releer } = montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'timeout', detail: '60' })

    releer()
    expect(screen.getByRole('alert')).toBeTruthy()
    // Alguien la movió por fuera (el CLI, un agente): la lectura nueva lo muestra y el aviso se va.
    releer([{ ...idea, columna: 'haciendo' }])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(within(columna('Doing')).getByText('Exportar el informe a PDF')).toBeTruthy()
  })

  it('cuando el núcleo no la acepta, el aviso trae su porqué tal cual', async () => {
    const { mover, contestar } = moverQueEspera()
    montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'rejected', detail: 'una tarjeta necesita un título' })
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not move "Exportar el informe a PDF": una tarjeta necesita un título'
    )
  })

  it('si la tarjeta ya no existe, lo dice en palabras y sin su id interno', async () => {
    // El bug: «No se pudo mover «…»: no hay una tarjeta «tmwcwk1kl97d62c23»».
    const { mover, contestar } = moverQueEspera()
    const { onReleer } = montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'rejected', detail: 'no hay una tarjeta «a»' })
    const aviso = screen.getByRole('alert').textContent ?? ''
    expect(aviso).toBe(
      '"Exportar el informe a PDF" is no longer on the board (its file was deleted or renamed). The board was read again.'
    )
    expect(aviso).not.toContain('«a»')
    expect(onReleer).toHaveBeenCalledTimes(1)
  })

  it('el aviso no empuja el tablero: va encima del renglón del título', async () => {
    const { mover, contestar } = moverQueEspera()
    montar(mover)
    await moverALaDerecha()
    await contestar({ ok: false, code: 'timeout', detail: '60' })
    const aviso = document.querySelector('[data-dolphin-tablero-aviso]')
    // Fuera del flujo (absolute) y anclado a la sección: las columnas quedan donde estaban.
    expect(aviso?.className).toMatch(/\babsolute\b/)
    expect(aviso?.closest('section')?.className).toMatch(/\brelative\b/)
  })

  it('el tablero que se arrastra no deja seleccionar texto', () => {
    montar(moverQueEspera().mover)
    expect(document.querySelector('[data-dolphin-tablero-inicio]')?.className).toContain(
      'select-none'
    )
  })
})
