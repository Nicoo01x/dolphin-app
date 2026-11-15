// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { DolphinChoque } from '../../../../../shared/dolphin-choques'
import type { Aviso, TipoDeAviso } from './avisos-isla'

vi.mock('@/components/agent/icons/AgentIcon', () => ({ AgentIcon: () => null }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_clave: string, texto: string, valores?: Record<string, string>) =>
    texto.replace(/\{\{(\w+)\}\}/g, (_todo, clave: string) => valores?.[clave] ?? '')
}))

import { IslaAviso } from './IslaAviso'

afterEach(cleanup)

const aviso = (tipo: TipoDeAviso, ptyId: string | null = 'pty-1'): Aviso => ({
  id: `tab:master:${tipo}`,
  tipo,
  detectadoEn: 0,
  card: {
    paneKey: 'tab:master',
    ptyId,
    agentType: 'claude',
    bucket: tipo === 'termino' ? 'done' : 'attention',
    worktreeName: 'master',
    task: 'la tarea'
  } as DashboardCard
})

const mostrar = (cual: Aviso, puedeResponder = true): void => {
  render(
    <IslaAviso
      aviso={cual}
      cuantosMas={0}
      puedeResponder={puedeResponder}
      onAbrir={vi.fn()}
      onResponder={vi.fn()}
      onDescartar={vi.fn()}
    />
  )
}

const choque: Aviso = {
  id: 'choque:worktree-a:worktree-b',
  tipo: 'choque',
  choque: {
    a: 'worktree-a',
    b: 'worktree-b',
    archivos: ['one.ts', 'two.ts']
  } satisfies DolphinChoque,
  detectadoEn: 0
}

describe('un aviso de la isla', () => {
  it('a uno que terminó se le puede responder', () => {
    mostrar(aviso('termino'))
    expect(screen.getByText('master finished')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()
  })

  it('con la sección Agentes oculta no ofrece responder: no habría dónde', () => {
    mostrar(aviso('termino'), false)
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })

  it('al que te necesita no: un Enter desde acá contestaría lo que pregunta', () => {
    mostrar(aviso('te-necesita'))
    expect(screen.getByText('master needs you')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })

  it('muestra cuántos archivos chocan y ofrece verlos', () => {
    mostrar(choque)
    expect(screen.getByText('worktree-a and worktree-b will conflict in 2 files')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy()
  })
})
