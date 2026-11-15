import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcessWithoutNullStreams as PipedChildProcess } from 'node:child_process'
import type { PipedProcessSpec } from '@dolphin/process-host/process-spec'
import { DOLPHIN_BUG_TIMEOUT_MS, detenerDolphinBug, iniciarDolphinBug } from './dolphin-bug'

const hijos: EventEmitter[] = []

afterEach(() => {
  detenerDolphinBug()
  vi.useRealTimers()
  hijos.length = 0
})

async function fakeDolphinDir(): Promise<string> {
  const dir = await mkdtemp(join(process.env.TEMP ?? '/tmp', 'dolphin-bug-'))
  await mkdir(join(dir, 'src'), { recursive: true })
  await mkdir(join(dir, 'node_modules', 'tsx'), { recursive: true })
  await writeFile(join(dir, 'src', 'dolphin.ts'), '')
  await writeFile(join(dir, 'node_modules', 'tsx', 'package.json'), '{}')
  return dir
}

function fakeSpawn(specs: PipedProcessSpec[]): (spec: PipedProcessSpec) => PipedChildProcess {
  return (spec) => {
    specs.push(spec)
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    hijos.push(child)
    return child as unknown as PipedChildProcess
  }
}

describe('reporte de bug de X-ray', () => {
  it('inyecta el lanzador, conserva comillas y saltos, y arma argumentos sin shell', async () => {
    const dolphinDir = await fakeDolphinDir()
    try {
      const specs: PipedProcessSpec[] = []
      const terminado = vi.fn()
      await iniciarDolphinBug(
        {
          id: 'bug-1',
          repoPath: 'C:/proyecto con espacios',
          que: 'El botón dice "listo"\ny no cambia',
          elemento: 'Botón «Guardar "ahora"»\nVentana: Tienda'
        },
        {
          appPath: 'C:/escritorio',
          dolphinDir,
          nodeProgram: 'node-probe',
          spawn: fakeSpawn(specs),
          onFinished: terminado
        }
      )

      expect(specs).toHaveLength(1)
      expect(specs[0]).toMatchObject({
        program: 'node-probe',
        cwd: dolphinDir,
        stdio: 'pipe'
      })
      expect(specs[0]?.args).toEqual([
        '--import',
        'tsx',
        join(dolphinDir, 'src', 'dolphin.ts'),
        'bug',
        '--que=El botón dice "listo"\ny no cambia',
        '--elemento=Botón «Guardar "ahora"»\nVentana: Tienda',
        `--repo=${resolve('C:/proyecto con espacios')}`,
        '--agente=claude'
      ])

      const child = hijos[0] as EventEmitter & { stdout: PassThrough; stderr: PassThrough }
      child.stdout.write('Escribo la prueba\n')
      child.stderr.write('Último renglón\n')
      child.emit('exit', 0)
      expect(terminado).toHaveBeenCalledWith({
        id: 'bug-1',
        codigo: 0,
        lineaFinal: 'Último renglón'
      })
    } finally {
      await rm(dolphinDir, { recursive: true, force: true })
    }
  })

  it('conserva el código 1 y el renglón final cuando el bug sigue', async () => {
    const dolphinDir = await fakeDolphinDir()
    try {
      const terminado = vi.fn()
      await iniciarDolphinBug(
        { id: 'bug-2', repoPath: '/repo', que: 'No anda', elemento: 'Botón' },
        { appPath: '/app', dolphinDir, spawn: fakeSpawn([]), onFinished: terminado }
      )
      const child = hijos[0] as EventEmitter & { stdout: PassThrough; stderr: PassThrough }
      child.stdout.write('No pude arreglarlo')
      child.emit('exit', 1)
      expect(terminado).toHaveBeenCalledWith({
        id: 'bug-2',
        codigo: 1,
        lineaFinal: 'No pude arreglarlo'
      })
    } finally {
      await rm(dolphinDir, { recursive: true, force: true })
    }
  })

  it('no lanza un segundo reporte mientras el primero sigue corriendo', async () => {
    const dolphinDir = await fakeDolphinDir()
    try {
      const specs: PipedProcessSpec[] = []
      const terminar = vi.fn()
      const options = {
        appPath: '/app',
        dolphinDir,
        spawn: fakeSpawn(specs),
        terminate: vi.fn().mockResolvedValue(true),
        onFinished: terminar
      }
      await expect(
        iniciarDolphinBug(
          { id: 'bug-3', repoPath: '/repo', que: 'No anda', elemento: 'Botón' },
          options
        )
      ).resolves.toBe(true)
      await expect(
        iniciarDolphinBug(
          { id: 'bug-4', repoPath: '/repo', que: 'Tampoco', elemento: 'Menú' },
          options
        )
      ).resolves.toBe(false)
      expect(specs).toHaveLength(1)

      const child = hijos[0] as EventEmitter
      child.emit('exit', 0)
      expect(terminar).toHaveBeenCalledTimes(1)
    } finally {
      await rm(dolphinDir, { recursive: true, force: true })
    }
  })

  it('no lanza un segundo reporte mientras el primero todavía busca Dolphin', async () => {
    const dolphinDir = await fakeDolphinDir()
    try {
      const specs: PipedProcessSpec[] = []
      const options = {
        appPath: '/app',
        dolphinDir,
        spawn: fakeSpawn(specs),
        terminate: vi.fn().mockResolvedValue(true)
      }
      const primero = iniciarDolphinBug(
        { id: 'bug-6', repoPath: '/repo', que: 'No anda', elemento: 'Botón' },
        options
      )
      const segundo = iniciarDolphinBug(
        { id: 'bug-7', repoPath: '/repo', que: 'Tampoco', elemento: 'Menú' },
        options
      )
      await expect(segundo).resolves.toBe(false)
      await expect(primero).resolves.toBe(true)
      expect(specs).toHaveLength(1)
    } finally {
      await rm(dolphinDir, { recursive: true, force: true })
    }
  })

  it('mata el árbol si el reporte supera los treinta minutos', async () => {
    vi.useFakeTimers()
    const dolphinDir = await fakeDolphinDir()
    try {
      const terminar = vi.fn()
      const terminate = vi.fn().mockResolvedValue(true)
      await iniciarDolphinBug(
        { id: 'bug-5', repoPath: '/repo', que: 'No anda', elemento: 'Botón' },
        {
          appPath: '/app',
          dolphinDir,
          spawn: fakeSpawn([]),
          terminate,
          onFinished: terminar
        }
      )

      await vi.advanceTimersByTimeAsync(DOLPHIN_BUG_TIMEOUT_MS)
      expect(terminate).toHaveBeenCalledTimes(1)
      expect(terminar).toHaveBeenCalledWith({ id: 'bug-5', codigo: 1, lineaFinal: '' })
    } finally {
      await rm(dolphinDir, { recursive: true, force: true })
    }
  })
})
