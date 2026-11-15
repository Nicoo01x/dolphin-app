// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type {
  EscrituraDesdeIsla,
  ResultadoDeEscritura
} from '../../../../../shared/dolphin-isla-types'

vi.mock('@/components/agent/icons/AgentIcon', () => ({ AgentIcon: () => null }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_clave: string, texto: string, valores?: Record<string, string>) =>
    texto.replace(/\{\{(\w+)\}\}/g, (_todo, clave: string) => valores?.[clave] ?? '')
}))

import { IslaAgentes } from './IslaAgentes'

const escribirDesdeIsla = vi.fn<(escritura: EscrituraDesdeIsla) => Promise<ResultadoDeEscritura>>()
const orquestacionTablero = vi.fn().mockResolvedValue({ disponible: false as const })

const tarjeta = (
  nombre: string,
  ptyId: string | null,
  bucket: DashboardCard['bucket'] = 'working'
): DashboardCard =>
  ({
    paneKey: `tab:${nombre}`,
    ptyId,
    agentType: 'claude',
    bucket,
    dotState: bucket === 'attention' ? 'waiting' : 'working',
    task: `la tarea de ${nombre}`,
    repoId: 'r',
    worktreeId: 'w',
    tabId: 't',
    leafId: null,
    repoName: 'repo',
    worktreeName: nombre
  }) as DashboardCard

beforeEach(() => {
  escribirDesdeIsla.mockReset()
  Object.assign(window, {
    api: { dolphin: { escribirDesdeIsla, orquestacionTablero }, dashboard: {} }
  })
})
afterEach(cleanup)

function escribir(nombre: string, texto: string): void {
  fireEvent.click(screen.getByRole('button', { name: `Reply to ${nombre}` }))
  fireEvent.change(screen.getByRole('textbox', { name: `Write to ${nombre}…` }), {
    target: { value: texto }
  })
}
const mandar = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('responderle a un agente desde la isla', () => {
  it('manda lo escrito con su pane y su terminal, avisa que llegó y queda abierta', async () => {
    escribirDesdeIsla.mockResolvedValue({ ok: true })
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)

    escribir('master', 'dale, seguí')
    mandar()

    expect(escribirDesdeIsla).toHaveBeenCalledWith({
      paneKey: 'tab:master',
      ptyId: 'pty-1',
      texto: 'dale, seguí'
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Sent to master'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('a uno que espera una aprobación no se le ofrece responder: la contestaría', () => {
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1', 'attention')]} onIr={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Reply to master' })).toBeNull()
  })

  it('si main dice que espera una aprobación, lo explica y deja el texto', async () => {
    escribirDesdeIsla.mockResolvedValue({ ok: false, motivo: 'aprobacion' })
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)

    escribir('master', 'no, pará')
    mandar()

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('approve or choose')
    )
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('no, pará')
  })

  it('si la tarjeta se va mientras se responde, la fila y el texto se quedan', async () => {
    escribirDesdeIsla.mockResolvedValue({ ok: false, motivo: 'no-esta' })
    const { rerender } = render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', '¿seguís?')

    rerender(<IslaAgentes lista={[]} onIr={vi.fn()} />)

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('¿seguís?')
    mandar()
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('no longer on the board')
    )
  })

  it('mientras se responde el orden no cambia: las nuevas van al final', () => {
    const a = tarjeta('a', 'pty-a')
    const b = tarjeta('b', 'pty-b')
    const { rerender } = render(<IslaAgentes lista={[a, b]} onIr={vi.fn()} />)
    escribir('b', 'hola')

    rerender(<IslaAgentes lista={[tarjeta('c', 'pty-c', 'attention'), b, a]} onIr={vi.fn()} />)

    const orden = screen.getAllByRole('listitem').map((li) => li.textContent?.slice(0, 1))
    expect(orden).toEqual(['a', 'b', 'c'])
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hola')
  })

  it('al confirmar se saca lo mandado y queda lo que se siguió escribiendo', async () => {
    let confirmar: (resultado: ResultadoDeEscritura) => void = () => {}
    escribirDesdeIsla.mockReturnValue(new Promise((listo) => (confirmar = listo)))
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', 'dale')
    mandar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dale y corré los tests' } })

    confirmar({ ok: true })

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Sent to master'))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('y corré los tests')
  })

  it('si no se sabe si llegó, lo dice para no mandarlo dos veces', async () => {
    escribirDesdeIsla.mockResolvedValue({ ok: false, motivo: 'sin-confirmar' })
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', 'hola')
    mandar()
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('check the chat before sending')
    )
  })

  it('al cerrar la respuesta el foco vuelve al botón de responder de esa fila', async () => {
    render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', 'hola')

    fireEvent.click(screen.getByRole('button', { name: 'Close the reply' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reply to master' }))
    )
  })

  it('una tarjeta que se quedó sin terminal lo dice en vez de no hacer nada', async () => {
    const { rerender } = render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', 'hola')
    rerender(<IslaAgentes lista={[tarjeta('master', null)]} onIr={vi.fn()} />)

    mandar()

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('no longer on the board')
    )
    expect(escribirDesdeIsla).not.toHaveBeenCalled()
  })
})

describe('lo que espera de vos', () => {
  it('la fila muestra la pregunta, no el JSON que trae el tablero', () => {
    const card = {
      ...tarjeta('master', 'pty-1', 'attention'),
      askSummary: JSON.stringify({
        questions: [
          {
            question: '¿Preferís mate o café?',
            multiSelect: false,
            options: [{ label: 'Mate' }, { label: 'Café' }]
          }
        ]
      })
    }
    render(<IslaAgentes lista={[card]} onIr={vi.fn()} />)
    expect(screen.getByText('¿Preferís mate o café?')).toBeTruthy()
    expect(screen.queryByText(/questions/)).toBeNull()
  })

  it('si pasa a esperar mientras le escribís, no se manda: el texto queda y se dice por qué', () => {
    const { rerender } = render(<IslaAgentes lista={[tarjeta('master', 'pty-1')]} onIr={vi.fn()} />)
    escribir('master', 'dale')
    rerender(<IslaAgentes lista={[tarjeta('master', 'pty-1', 'attention')]} onIr={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('waiting for you to approve')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('dale')
    mandar()
    expect(escribirDesdeIsla).not.toHaveBeenCalled()
  })
})

describe('resumen de orquestación', () => {
  it('sin corrida activa no muestra el resumen', async () => {
    orquestacionTablero.mockResolvedValue({
      disponible: true,
      runs: [
        {
          id: 'run-1',
          objective: 'listo',
          createdAt: '',
          coordinatorHandle: null,
          tasks: [
            {
              id: 'task-1',
              title: 'listo',
              status: 'completed',
              deps: [],
              parentId: null,
              dispatch: null
            }
          ],
          gates: [],
          messages: []
        }
      ]
    })
    render(<IslaAgentes lista={[]} onIr={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText(/Orchestration/)).toBeNull())
  })
})

describe('el «Responder» de un aviso', () => {
  const lista = [tarjeta('master', 'pty-1', 'done'), tarjeta('otro', 'pty-2')]

  it('abre la respuesta de ese agente una sola vez por pedido', () => {
    const pedido = { paneKey: 'tab:master', vez: 1 }
    const { rerender } = render(<IslaAgentes lista={lista} onIr={vi.fn()} responderA={pedido} />)
    expect(screen.getByRole('textbox', { name: 'Write to master…' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close the reply' }))
    rerender(<IslaAgentes lista={[...lista]} onIr={vi.fn()} responderA={pedido} />)
    expect(screen.queryByRole('textbox')).toBeNull()

    rerender(<IslaAgentes lista={lista} onIr={vi.fn()} responderA={{ ...pedido, vez: 2 }} />)
    expect(screen.getByRole('textbox', { name: 'Write to master…' })).toBeTruthy()
  })

  it('avisa que ya lo usó, para que la lista vuelta a montar no lo repita', () => {
    const onPedidoAtendido = vi.fn()
    render(
      <IslaAgentes
        lista={lista}
        onIr={vi.fn()}
        responderA={{ paneKey: 'tab:master', vez: 1 }}
        onPedidoAtendido={onPedidoAtendido}
      />
    )
    expect(onPedidoAtendido).toHaveBeenCalledTimes(1)
  })

  it('a uno que pasó a esperar una aprobación no le abre nada', () => {
    render(
      <IslaAgentes
        lista={[tarjeta('master', 'pty-1', 'attention')]}
        onIr={vi.fn()}
        responderA={{ paneKey: 'tab:master', vez: 1 }}
      />
    )
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
