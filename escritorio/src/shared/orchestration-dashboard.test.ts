import { describe, expect, it } from 'vitest'
import {
  buildOrchestrationDashboard,
  countOrchestrationTasks,
  parseWorkerStartOptions,
  repoIdFromWorktreeId
} from './orchestration-dashboard'

const base = {
  runs: [
    { id: 'run-1', objective: 'Objetivo', created_at: '2026-01-01', coordinator_handle: 'coord' }
  ],
  tasks: [
    {
      id: 'child',
      run_id: 'run-1',
      task_title: 'Hijo',
      display_name: null,
      status: 'ready',
      deps: '["root"]',
      parent_id: 'root'
    },
    {
      id: 'root',
      run_id: 'run-1',
      task_title: 'Raíz',
      display_name: null,
      status: 'completed',
      deps: '[]',
      parent_id: null
    }
  ],
  gates: [
    {
      id: 'gate-1',
      run_id: 'run-1',
      question: '¿Seguimos?',
      options: '["Sí","No"]',
      status: 'pending'
    }
  ],
  messages: Array.from({ length: 25 }, (_, index) => ({
    run_id: 'run-1',
    type: 'question' as const,
    subject: `m${index}`,
    from_handle: 'worker',
    created_at: `${index}`
  }))
}

describe('buildOrchestrationDashboard', () => {
  it('orders tasks topologically and caps runs, messages, and pending gates', () => {
    const result = buildOrchestrationDashboard({
      ...base,
      runs: [
        base.runs[0],
        ...Array.from({ length: 11 }, (_, i) => ({ ...base.runs[0], id: `run-${i + 2}` }))
      ]
    })
    expect(result.disponible).toBe(true)
    if (result.disponible) {
      expect(result.runs).toHaveLength(10)
      expect(result.runs[0].tasks.map((task) => task.id)).toEqual(['root', 'child'])
      expect(result.runs[0].messages).toHaveLength(20)
      expect(result.runs[0].gates).toEqual([
        { id: 'gate-1', question: '¿Seguimos?', options: ['Sí', 'No'] }
      ])
    }
  })
})

describe('orchestration dashboard helpers', () => {
  it.each([
    [
      '{"agent":"codex","launch":{"effective":{"model":"gpt-reserve"}}}',
      { agent: 'codex', model: 'gpt-reserve' }
    ],
    ['{broken', { agent: null, model: null }],
    ['{}', { agent: null, model: null }]
  ])('parses worker start options safely', (raw, expected) => {
    expect(parseWorkerStartOptions(raw)).toEqual(expected)
  })

  it('takes the repository id from a worktree id', () => {
    expect(repoIdFromWorktreeId('repo-1::C:/work/feature')).toBe('repo-1')
  })
})

describe('countOrchestrationTasks', () => {
  it('cuenta lista para lanzar como esperando: solo corre la que tiene worker', () => {
    expect(
      countOrchestrationTasks([
        { status: 'dispatched' },
        { status: 'ready' },
        { status: 'pending' },
        { status: 'blocked' },
        { status: 'completed' },
        { status: 'failed' }
      ])
    ).toEqual({ running: 1, waiting: 3, done: 1, failed: 1 })
  })
})
