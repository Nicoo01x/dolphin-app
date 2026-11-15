// El cliente de un servidor de lenguaje, con un proceso de mentira. Lo que se fija acá son los
// modos de fallar del protocolo: una respuesta que no vuelve, un servidor que se cae con preguntas
// en el aire, y una pregunta del servidor que hay que contestar o se cuelga.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { encuadrar, LectorDeMensajes } from '../../shared/lsp/encuadre'
import { ClienteLsp, TOPE_DE_RESPUESTA_MS, type ProcesoDeServidor } from './cliente-lsp'

type Falso = {
  proceso: ProcesoDeServidor
  /** Lo que el cliente le escribió al servidor, ya parseado. */
  escrito: () => unknown[]
  /** Hace como que el servidor mandó eso. */
  contestar: (mensaje: unknown) => void
  morir: (codigo: number | null) => void
  terminado: () => boolean
}

function procesoFalso(): Falso {
  const lector = new LectorDeMensajes()
  const leidos: unknown[] = []
  let alRecibir: (datos: Buffer) => void = () => {}
  let alSalir: (codigo: number | null) => void = () => {}
  let terminado = false
  return {
    proceso: {
      escribir: (datos) => leidos.push(...lector.recibir(datos)),
      alRecibir: (escuchar) => {
        alRecibir = escuchar
      },
      alSalir: (escuchar) => {
        alSalir = escuchar
      },
      terminar: () => {
        terminado = true
      }
    },
    escrito: () => leidos,
    contestar: (mensaje) => alRecibir(encuadrar(mensaje)),
    morir: (codigo) => alSalir(codigo),
    terminado: () => terminado
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('el cliente de un servidor de lenguaje', () => {
  it('pregunta con un id creciente y resuelve con el resultado', async () => {
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    const respuesta = cliente.preguntar('textDocument/hover', { a: 1 })
    const pregunta = falso.escrito()[0] as { id: number; method: string }
    expect(pregunta.method).toBe('textDocument/hover')
    falso.contestar({ jsonrpc: '2.0', id: pregunta.id, result: { contents: 'hola' } })
    await expect(respuesta).resolves.toEqual({ contents: 'hola' })
  })

  it('un error del servidor llega como error y no como respuesta vacía', async () => {
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    const respuesta = cliente.preguntar('textDocument/definition', {})
    const { id } = falso.escrito()[0] as { id: number }
    falso.contestar({ jsonrpc: '2.0', id, error: { message: 'no hay índice todavía' } })
    await expect(respuesta).rejects.toThrow('no hay índice todavía')
  })

  it('una pregunta que no vuelve se corta sola', async () => {
    vi.useFakeTimers()
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    const respuesta = cliente.preguntar('textDocument/completion', {})
    const fallo = expect(respuesta).rejects.toThrow('no contestó')
    await vi.advanceTimersByTimeAsync(TOPE_DE_RESPUESTA_MS + 1)
    await fallo
  })

  it('si el servidor se cae, lo que estaba esperando se rechaza en vez de quedar colgado', async () => {
    const falso = procesoFalso()
    const caidas: (number | null)[] = []
    const cliente = new ClienteLsp(
      falso.proceso,
      () => {},
      (codigo) => caidas.push(codigo)
    )
    const respuesta = cliente.preguntar('textDocument/hover', {})
    falso.morir(1)
    await expect(respuesta).rejects.toThrow('se cerró')
    expect(caidas).toEqual([1])
    expect(cliente.activo).toBe(false)
    // Y lo que se pregunte después tampoco queda esperando.
    await expect(cliente.preguntar('textDocument/hover', {})).rejects.toThrow('no está corriendo')
  })

  it('contesta las preguntas DEL servidor, que si no lo cuelgan', () => {
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    expect(cliente.activo).toBe(true)
    falso.contestar({ jsonrpc: '2.0', id: 77, method: 'workspace/configuration', params: {} })
    expect(falso.escrito()).toContainEqual({ jsonrpc: '2.0', id: 77, result: null })
  })

  it('los diagnósticos llegan por su propio camino', () => {
    const falso = procesoFalso()
    const avisos: unknown[] = []
    const cliente = new ClienteLsp(falso.proceso, (d) => avisos.push(d))
    expect(cliente.activo).toBe(true)
    falso.contestar({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri: 'file:///a.ts', diagnostics: [{ message: 'mal' }] }
    })
    expect(avisos).toEqual([{ uri: 'file:///a.ts', diagnosticos: [{ message: 'mal' }] }])
  })

  it('la versión de un archivo crece con cada cambio y nunca se repite', () => {
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    cliente.abrirArchivo('file:///a.ts', 'typescript', 'uno')
    cliente.cambioArchivo('file:///a.ts', 'dos')
    cliente.cambioArchivo('file:///a.ts', 'tres')
    const versiones = falso
      .escrito()
      .map(
        (m) =>
          (m as { params?: { textDocument?: { version?: number } } }).params?.textDocument?.version
      )
    expect(versiones).toEqual([1, 2, 3])
    // Y el cambio manda el texto entero: lo incremental se desincroniza sin ruido.
    const ultimo = falso.escrito().at(-1) as { params: { contentChanges: { text: string }[] } }
    expect(ultimo.params.contentChanges).toEqual([{ text: 'tres' }])
  })

  it('apagar saluda, se despide y corta el proceso', async () => {
    const falso = procesoFalso()
    const cliente = new ClienteLsp(falso.proceso, () => {})
    const apagando = cliente.apagar()
    const { id } = falso.escrito()[0] as { id: number }
    falso.contestar({ jsonrpc: '2.0', id, result: null })
    await apagando
    expect((falso.escrito()[1] as { method: string }).method).toBe('exit')
    expect(falso.terminado()).toBe(true)
    expect(cliente.activo).toBe(false)
  })
})
