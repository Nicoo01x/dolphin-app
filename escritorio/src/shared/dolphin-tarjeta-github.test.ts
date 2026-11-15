import { describe, expect, it } from 'vitest'
import {
  claseDeCheck,
  conExtraDeTarjeta,
  extraDesdeGraphql,
  leerExtraDeTarjeta
} from './dolphin-tarjeta-github'

describe('extraDesdeGraphql', () => {
  it('de un issue cerrado saca el motivo, el hito y el PR mergeado que lo cerró', () => {
    const extra = extraDesdeGraphql({
      __typename: 'Issue',
      stateReason: 'NOT_PLANNED',
      milestone: { title: 'v1.2', dueOn: '2026-12-01T00:00:00Z' },
      closedByPullRequestsReferences: {
        nodes: [
          { number: 7, title: 'Intento', state: 'CLOSED', isDraft: false },
          { number: 9, title: 'El bueno', state: 'MERGED', isDraft: false }
        ]
      }
    })
    expect(extra).toEqual({
      motivoDeCierre: 'no-planeado',
      hito: { titulo: 'v1.2', vence: '2026-12-01T00:00:00Z' },
      cierraCon: { numero: 9, titulo: 'El bueno', estado: 'merged' }
    })
  })

  it('un issue sin nada de eso devuelve un extra vacío, sin campos en undefined', () => {
    const extra = extraDesdeGraphql({ __typename: 'Issue', milestone: null })
    expect(extra).toEqual({})
  })

  it('de un PR cuenta los checks por clase y nombra el primero que falló', () => {
    const extra = extraDesdeGraphql({
      __typename: 'PullRequest',
      reviewDecision: 'CHANGES_REQUESTED',
      comments: { totalCount: 3 },
      latestReviews: { nodes: [{ state: 'APPROVED', author: { login: 'ana', avatarUrl: 'x' } }] },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                contexts: {
                  totalCount: 6,
                  nodes: [
                    {
                      __typename: 'CheckRun',
                      name: 'lint',
                      status: 'COMPLETED',
                      conclusion: 'SUCCESS'
                    },
                    {
                      __typename: 'CheckRun',
                      name: 'test',
                      status: 'COMPLETED',
                      conclusion: 'FAILURE'
                    },
                    {
                      __typename: 'CheckRun',
                      name: 'e2e',
                      status: 'IN_PROGRESS',
                      conclusion: null
                    },
                    {
                      __typename: 'CheckRun',
                      name: 'docs',
                      status: 'COMPLETED',
                      conclusion: 'SKIPPED'
                    },
                    { __typename: 'StatusContext', context: 'ci/legacy', state: 'ERROR' }
                  ]
                }
              }
            }
          }
        ]
      }
    })
    expect(extra?.checks).toEqual({
      pasaron: 1,
      fallaron: 2,
      corriendo: 1,
      // Uno de los seis no vino en la página: cuenta como pendiente, nunca como pasado.
      pendientes: 1,
      omitidos: 1,
      total: 6,
      primeroQueFallo: 'test'
    })
    expect(extra?.reviewDecision).toBe('CHANGES_REQUESTED')
    expect(extra?.comentarios).toBe(3)
    expect(extra?.latestReviews).toEqual([{ login: 'ana', state: 'APPROVED', avatarUrl: 'x' }])
  })

  it('sin checks no inventa una cuenta en cero', () => {
    const extra = extraDesdeGraphql({
      __typename: 'PullRequest',
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] }
    })
    expect(extra?.checks).toBeUndefined()
  })

  it('una respuesta que no es un objeto es null', () => {
    expect(extraDesdeGraphql(null)).toBeNull()
    expect(extraDesdeGraphql('x')).toBeNull()
  })
})

describe('claseDeCheck', () => {
  it('un StatusContext pendiente está corriendo; uno esperado, pendiente', () => {
    expect(claseDeCheck({ state: 'PENDING' })).toBe('corriendo')
    expect(claseDeCheck({ state: 'EXPECTED' })).toBe('pendientes')
    expect(claseDeCheck({ status: 'QUEUED' })).toBe('pendientes')
    expect(claseDeCheck({ status: 'COMPLETED', conclusion: 'CANCELLED' })).toBe('omitidos')
    expect(claseDeCheck({ status: 'COMPLETED', conclusion: 'TIMED_OUT' })).toBe('fallaron')
  })
})

describe('conExtraDeTarjeta / leerExtraDeTarjeta', () => {
  it('ida y vuelta sin tocar el resto del item', () => {
    const item = { id: 'pr:1', title: 'x' }
    const con = conExtraDeTarjeta(item, { comentarios: 2 })
    expect(con).toMatchObject(item)
    expect(leerExtraDeTarjeta(con)).toEqual({ comentarios: 2 })
    expect(item).not.toHaveProperty('dolphinTarjeta')
  })

  it('un extra vacío o ausente no agrega el campo, y leerlo da un objeto vacío', () => {
    expect(conExtraDeTarjeta({ id: 'a' }, {})).toEqual({ id: 'a' })
    expect(conExtraDeTarjeta({ id: 'a' }, null)).toEqual({ id: 'a' })
    expect(leerExtraDeTarjeta({ id: 'a' })).toEqual({})
    expect(leerExtraDeTarjeta({ dolphinTarjeta: 'basura' })).toEqual({})
  })
})
