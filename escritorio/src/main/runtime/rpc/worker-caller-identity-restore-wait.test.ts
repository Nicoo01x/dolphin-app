import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../shared/orchestration/orchestration-runtime-capabilities'
import { DolphinRuntimeService } from '../dolphin-runtime'
import { OrchestrationDb } from '../orchestration/db/orchestration-db'
import '../orchestration/db/contract-constants'
import '../orchestration/db/messages/mailbox-routing-page'
import '../orchestration/db/dispatch-row-writer'
import '../orchestration/db/attempt-outcome-projection'
import { createRootDispatch } from '../orchestration/db/root-dispatch-test-fixture'
import type { RpcResponse } from './core'

const REJECTED = {
  ok: true,
  result: { lifecycle: { action: 'rejected', code: 'worker_identity_changed' } }
}
import { RpcDispatcher } from './dispatcher'
import { ORCHESTRATION_METHODS } from './methods/orchestration/orchestration'

const COORDINATOR_PANE = 'tab_coord:11111111-1111-4111-8111-111111111111'
const WORKER_PANE = 'tab_worker:44444444-4444-4444-8444-444444444444'
const WORKER_PROCESS = 'pty_worker:incarnation_1'

/** A worker whose terminal reads as unknown until `restore` publishes the identity Dolphin recovers. */
async function startRestartingDolphin() {
  const db = new OrchestrationDb(':memory:')
  const runtime = new DolphinRuntimeService()
  runtime.setOrchestrationDb(db)
  const restored: { paneKey: string | null; process: string | null } = {
    paneKey: null,
    process: null
  }
  vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
    handle === 'term_coord' ? COORDINATOR_PANE : handle === 'term_worker' ? restored.paneKey : null
  )
  vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation((handle) =>
    runtime.getTerminalPaneKey(handle)
  )
  vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation((handle) =>
    handle === 'term_coord' ? 'pty_coord:1' : handle === 'term_worker' ? restored.process : null
  )
  vi.spyOn(runtime, 'notifyMessageArrived').mockImplementation(() => {})
  const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
  // Startup recovery runs on the first call; seed after it so it cannot settle the worker.
  await dispatcher.dispatch({
    id: 'rpc_warm',
    authToken: 'token',
    method: 'orchestration.runList',
    params: {},
    orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION
  })
  const run = db.createRun({
    objective: 'restart',
    coordinatorHandle: 'term_coord',
    coordinatorPaneKey: COORDINATOR_PANE
  })
  const task = db.createTask({ runId: run.id, spec: 'work' })
  const dispatch = createRootDispatch(
    db,
    task.id,
    'term_worker',
    WORKER_PANE,
    undefined,
    WORKER_PROCESS
  )
  runtime.startupWorkerAuthority.begin()
  const workerDone = (): Promise<RpcResponse> =>
    dispatcher.dispatch({
      id: 'rpc_done',
      authToken: 'token',
      method: 'orchestration.send',
      params: {
        from: 'term_worker',
        subject: 'Done',
        type: 'worker_done',
        payload: JSON.stringify({ taskId: task.id, dispatchId: dispatch.id, outcome: 'succeeded' })
      },
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION
    })
  const restore = async (identity: { paneKey: string; process: string }): Promise<void> => {
    // Let a report that does not wait run to completion first, as it would against a slow restore.
    await settleTurns()
    restored.paneKey = identity.paneKey
    restored.process = identity.process
    runtime.startupWorkerAuthority.finish()
  }
  return { db, runtime, dispatcher, task, dispatch, workerDone, restore }
}

async function settleTurns(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

describe('a worker report during a Dolphin restart', () => {
  let db: OrchestrationDb | undefined
  afterEach(() => {
    vi.useRealTimers()
    db?.close()
    db = undefined
  })

  it('is accepted once the restore rebinds the same terminal process', async () => {
    const dolphin = await startRestartingDolphin()
    db = dolphin.db
    const pending = dolphin.workerDone()
    await dolphin.restore({ paneKey: WORKER_PANE, process: WORKER_PROCESS })

    expect(await pending).toMatchObject({ ok: true, result: { message: { type: 'worker_done' } } })
    expect(
      dolphin.db.db
        .prepare(`SELECT subject, sender_pane_key FROM messages WHERE type = 'worker_done'`)
        .all()
    ).toEqual([{ subject: 'Done', sender_pane_key: WORKER_PANE }])
    expect(dolphin.db.getWorkerDispatch(dolphin.dispatch.id)?.state).not.toBe('dispatched')
  })

  it('is still rejected when the restored terminal runs a respawned process', async () => {
    const dolphin = await startRestartingDolphin()
    db = dolphin.db
    const pending = dolphin.workerDone()
    await dolphin.restore({ paneKey: WORKER_PANE, process: 'pty_worker:incarnation_2' })

    expect(await pending).toMatchObject(REJECTED)
  })

  it('is still rejected when the terminal was handed to another dispatch', async () => {
    const dolphin = await startRestartingDolphin()
    db = dolphin.db
    dolphin.db.failDispatch(dolphin.dispatch.id, 'worker stopped')
    const newerTask = dolphin.db.createTask({ runId: dolphin.task.run_id!, spec: 'newer work' })
    const newer = createRootDispatch(
      dolphin.db,
      newerTask.id,
      'term_worker',
      WORKER_PANE,
      undefined,
      'pty_worker:incarnation_2'
    )
    const pending = dolphin.workerDone()
    await dolphin.restore({ paneKey: WORKER_PANE, process: 'pty_worker:incarnation_2' })

    expect(await pending).toMatchObject(REJECTED)
    expect(dolphin.db.getDispatchContextById(newer.id)?.status).toBe('dispatched')
  })

  it('does not hold ordinary mail from a terminal Dolphin has not restored yet', async () => {
    const dolphin = await startRestartingDolphin()
    db = dolphin.db
    let answered = false
    const pending = dolphin.dispatcher
      .dispatch({
        id: 'rpc_mail',
        authToken: 'token',
        method: 'orchestration.send',
        params: { from: 'term_restoring', to: `dispatch:${dolphin.dispatch.id}`, subject: 'note' },
        orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION
      })
      .finally(() => {
        answered = true
      })
    await settleTurns()

    expect(answered).toBe(true)
    dolphin.runtime.startupWorkerAuthority.finish()
    await pending
  })

  it('is rejected when the terminal is still unknown after the wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const dolphin = await startRestartingDolphin()
    db = dolphin.db
    const pending = dolphin.workerDone()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(await pending).toMatchObject(REJECTED)
  })
})
