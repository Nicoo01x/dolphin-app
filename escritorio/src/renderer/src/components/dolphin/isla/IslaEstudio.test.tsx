// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { EstudioDeIsla } from '../../../../../shared/dolphin-isla-types'

vi.mock('@/components/agent/icons/AgentIcon', () => ({ AgentIcon: () => null }))
vi.mock('@/lib/agent-catalog/agent-catalog', () => ({ getAgentLabel: () => 'Claude' }))
vi.mock('@/i18n/i18n', () => ({ translate: (_clave: string, texto: string) => texto }))

import { IslaEstudio } from './IslaEstudio'

const estudioDeIsla = vi.fn<() => Promise<EstudioDeIsla>>()
const revealAgent = vi.fn()

const tarjeta = {
  paneKey: 'tab:master',
  ptyId: 'pty-1',
  agentType: 'claude',
  bucket: 'done',
  dotState: 'done',
  task: 'la tarea',
  repoId: 'r',
  worktreeId: 'w',
  tabId: 't',
  leafId: null,
  repoName: 'repo',
  worktreeName: 'master'
} as unknown as DashboardCard

beforeEach(() => {
  estudioDeIsla.mockReset()
  revealAgent.mockReset()
  Object.assign(window, { api: { dolphin: { estudioDeIsla }, dashboard: { revealAgent } } })
})
afterEach(cleanup)

describe('la sección Estudio de la isla', () => {
  it('muestra por agente el nombre de cada archivo, con la ruta entera en el title', async () => {
    estudioDeIsla.mockResolvedValue({
      disponible: true,
      agentes: [
        {
          paneKey: 'tab:master',
          archivos: [
            { ruta: 'D:\\repo\\notas\\otro.md', accion: 'creado' },
            { ruta: 'D:\\repo\\src\\app.ts', accion: 'editado' }
          ]
        }
      ]
    })
    render(<IslaEstudio cards={[tarjeta]} tablero={1} onIr={() => {}} />)

    const archivo = await screen.findByTitle('D:\\repo\\notas\\otro.md')
    expect(archivo.textContent).toBe('otro.md')
    expect(screen.getByTitle('D:\\repo\\src\\app.ts').textContent).toBe('app.ts')
    expect(screen.getByText('· master')).toBeTruthy()
  })

  it('tocar un archivo lleva al agente', async () => {
    const onIr = vi.fn()
    estudioDeIsla.mockResolvedValue({
      disponible: true,
      agentes: [{ paneKey: 'tab:master', archivos: [{ ruta: 'a.ts', accion: 'editado' }] }]
    })
    render(<IslaEstudio cards={[tarjeta]} tablero={1} onIr={onIr} />)

    fireEvent.click(await screen.findByTitle('a.ts'))
    expect(revealAgent).toHaveBeenCalledWith(expect.objectContaining({ tabId: 't' }))
    expect(onIr).toHaveBeenCalled()
  })

  it('sin la ventana principal lo dice, y sin archivos invita a esperar', async () => {
    estudioDeIsla.mockResolvedValueOnce({ disponible: false, agentes: [] })
    const { unmount } = render(<IslaEstudio cards={[tarjeta]} tablero={1} onIr={() => {}} />)
    expect(await screen.findByText('There is no studio data right now.')).toBeTruthy()
    unmount()

    estudioDeIsla.mockResolvedValueOnce({ disponible: true, agentes: [] })
    render(<IslaEstudio cards={[tarjeta]} tablero={2} onIr={() => {}} />)
    expect(await screen.findByText('When an agent touches files, they show up here.')).toBeTruthy()
  })
})
