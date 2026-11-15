import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import { ordenarParaIsla, resumirIsla } from './resumen-isla'

const tarjeta = (paneKey: string, bucket: DashboardCard['bucket']): DashboardCard =>
  ({
    paneKey,
    ptyId: null,
    agentType: 'claude',
    bucket,
    dotState: bucket === 'attention' ? 'waiting' : bucket === 'working' ? 'working' : 'done',
    task: paneKey,
    repoId: 'r',
    worktreeId: 'w',
    tabId: 't',
    leafId: null,
    repoName: 'repo',
    worktreeName: 'master'
  }) as DashboardCard

describe('la isla', () => {
  it('cuenta cuántos te esperan, trabajan y terminaron, y destaca primero al que te espera', () => {
    const resumen = resumirIsla([
      tarjeta('a', 'working'),
      tarjeta('b', 'done'),
      tarjeta('c', 'attention'),
      tarjeta('d', 'idle')
    ])
    expect(resumen).toMatchObject({ esperan: 1, trabajan: 1, listos: 1 })
    expect(resumen.destacado?.paneKey).toBe('c')
  })

  it('la lista abierta va por urgencia y no muestra los que ya quedaron quietos', () => {
    const orden = ordenarParaIsla([
      tarjeta('listo', 'done'),
      tarjeta('quieto', 'idle'),
      tarjeta('corre', 'working'),
      tarjeta('espera', 'attention')
    ]).map((card) => card.paneKey)
    expect(orden).toEqual(['espera', 'corre', 'listo'])
  })

  it('sin agentes no destaca a nadie', () => {
    expect(resumirIsla([]).destacado).toBeNull()
  })
})
