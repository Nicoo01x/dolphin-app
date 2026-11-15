// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenciaViva } from './ReferenciaViva'

/**
 * El repo activo y la API de GitHub, de mentira: acá se prueba la pastilla, no el `gh`.
 *
 * `useActiveRepo` se mockea porque trae el store entero del escritorio, y `window.api` porque en
 * un test no hay preload.
 */
vi.mock('@/store/repos/use-repository-catalog', () => ({
  useActiveRepo: () => ({ path: 'D:/repo' })
}))

const workItem = vi.fn()
const openUrl = vi.fn()

beforeEach(() => {
  workItem.mockReset()
  openUrl.mockReset()
  workItem.mockResolvedValue({
    title: 'La cola de Telegram falla con dos drenados a la vez',
    state: 'open',
    author: 'ana-dev',
    labels: ['Bug'],
    url: 'https://github.com/o/r/issues/412'
  })
  ;(globalThis as { window?: unknown }).window = Object.assign(globalThis.window ?? {}, {
    api: { gh: { workItem }, shell: { openUrl } }
  })
})

afterEach(cleanup)

describe('la pastilla de una referencia del chat', () => {
  it('se dibuja con el rótulo que le pasan y no pide nada todavía', () => {
    render(
      <ReferenciaViva clase="issue" id="412" texto="#412">
        #412
      </ReferenciaViva>
    )
    expect(screen.getByRole('button')).toHaveTextContent('#412')
    // Lo importante: pintar un mensaje con quince referencias no son quince llamadas a GitHub.
    expect(workItem).not.toHaveBeenCalled()
  })

  it('al pasar por encima muestra la tarjeta con el issue', async () => {
    vi.useFakeTimers()
    render(
      <ReferenciaViva clase="issue" id="412" texto="#412">
        #412
      </ReferenciaViva>
    )
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!)
    // La tarjeta espera una pausa corta: sin eso, cruzar un párrafo abre tres tarjetas.
    expect(screen.queryByRole('tooltip')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    vi.useRealTimers()
    await act(async () => {
      await Promise.resolve()
    })
    expect(workItem).toHaveBeenCalledWith({ repoPath: 'D:/repo', number: 412, type: 'issue' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'La cola de Telegram falla con dos drenados a la vez'
    )
  })

  it('al tocarla abre el issue, aunque nunca se haya pasado por encima', async () => {
    render(
      <ReferenciaViva clase="issue" id="412" texto="#412">
        #412
      </ReferenciaViva>
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/issues/412')
  })

  it('una rama no se puede abrir, así que no es un botón', () => {
    render(
      <ReferenciaViva clase="rama" id="dolphin/4e2/u1" texto="dolphin/4e2/u1">
        dolphin/4e2/u1
      </ReferenciaViva>
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(workItem).not.toHaveBeenCalled()
  })

  it('si el issue no existe, la tarjeta lo dice en vez de quedarse en blanco', async () => {
    workItem.mockResolvedValue(null)
    render(
      <ReferenciaViva clase="issue" id="9999" texto="#9999">
        #9999
      </ReferenciaViva>
    )
    fireEvent.mouseEnter(screen.getByRole('button').parentElement!)
    // Se espera a que la tarjeta lo diga, no un tiempo fijo: la pausa del hover es de 400 ms.
    await waitFor(
      () => {
        expect(screen.getByRole('tooltip')).toHaveTextContent("I couldn't find it in this repo.")
      },
      { timeout: 2_000 }
    )
  })
})
