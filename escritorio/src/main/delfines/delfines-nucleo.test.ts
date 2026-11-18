import { describe, expect, it } from 'vitest'
import type { ProcessResult, ProcessSpec } from '@dolphin/process-host/process-spec'
import { FalloDelNucleo, jsonDeLaSalida, motivoDelNucleo, nucleoLocal } from './delfines-nucleo'

function resultado(parcial: Partial<ProcessResult>): ProcessResult {
  return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, ...parcial }
}

describe('el núcleo de acá', () => {
  it('lanza `dolphin bots … --json` con el Electron como Node y lee el JSON de la última línea', async () => {
    const specs: ProcessSpec[] = []
    const nucleo = nucleoLocal({
      appPath: 'C:/app',
      env: { PATH: 'x' },
      nodeProgram: 'C:/app/dolphin.exe',
      ubicar: async () => ({ dir: 'C:/core', entry: ['C:/core/dist/dolphin.js'] }),
      correr: async (spec) => {
        specs.push(spec)
        return resultado({ stdout: 'aviso de node\n{"bots":[]}\n' })
      }
    })
    expect(await nucleo.json(['hablar', 'vigia'], { entrada: '-hola' })).toEqual({ bots: [] })
    expect(specs[0]).toMatchObject({
      program: 'C:/app/dolphin.exe',
      args: ['C:/core/dist/dolphin.js', 'bots', 'hablar', 'vigia', '--json'],
      cwd: 'C:/core',
      input: '-hola',
      env: { PATH: 'x', ELECTRON_RUN_AS_NODE: '1' }
    })
  })

  it('sin núcleo falla con «sin-nucleo» y la carpeta donde lo buscó', async () => {
    const nucleo = nucleoLocal({
      appPath: 'C:/app',
      ubicar: async () => ({ dir: 'C:/nada', entry: null })
    })
    await expect(nucleo.json([])).rejects.toMatchObject({ code: 'sin-nucleo', message: 'C:/nada' })
  })

  it('un error del CLI llega como su mensaje, sin el stack de Node', async () => {
    const nucleo = nucleoLocal({
      appPath: 'C:/app',
      ubicar: async () => ({ dir: 'C:/core', entry: ['x'] }),
      correr: async () =>
        resultado({
          code: 1,
          stderr:
            'file:///x.js:12\n  throw new Error(texto);\nError: ya tenés un bot que se llama «Vigía»\n    at error (x.js:1)'
        })
    })
    const fallo = await nucleo.json(['nuevo', 'Vigía']).catch((error: unknown) => error)
    expect(fallo).toBeInstanceOf(FalloDelNucleo)
    expect((fallo as FalloDelNucleo).message).toBe('ya tenés un bot que se llama «Vigía»')
  })

  it('el motivo y el JSON salen aunque haya ruido alrededor', () => {
    expect(motivoDelNucleo('', 'algo raro')).toBe('algo raro')
    expect(() => jsonDeLaSalida('nada')).toThrow('no devolvió JSON')
    expect(jsonDeLaSalida('[{"a":1}]')).toEqual([{ a: 1 }])
  })
})
