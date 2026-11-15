/**
 * El cliente de un servidor de lenguaje: le habla JSON-RPC por la entrada y la salida estándar.
 *
 * Una instancia por (servidor, raíz del proyecto). Why por raíz y no una sola por lenguaje: un
 * servidor sabe de UN proyecto —su tsconfig, sus dependencias— y preguntarle por un archivo de
 * otro devuelve respuestas de otro mundo.
 *
 * El proceso entra inyectado (`abrirProceso`) para poder probar todo esto sin un servidor real:
 * los errores que importan acá son de protocolo, no de spawn.
 */

import { encuadrar, LectorDeMensajes } from '../../shared/lsp/encuadre'

/** Lo que el cliente necesita de un proceso, y nada más. */
export type ProcesoDeServidor = {
  readonly escribir: (datos: Buffer) => void
  readonly alSalir: (escuchar: (codigo: number | null) => void) => void
  readonly alRecibir: (escuchar: (datos: Buffer) => void) => void
  readonly terminar: () => void
  /** Lo último que escribió en stderr: el motivo cuando se cierra sin contestar el saludo. */
  readonly ultimoError?: () => string
}

export type DiagnosticosDeArchivo = {
  readonly uri: string
  readonly diagnosticos: readonly unknown[]
}

type Pendiente = {
  readonly resolver: (valor: unknown) => void
  readonly rechazar: (error: Error) => void
  readonly vencimiento: ReturnType<typeof setTimeout>
}

/** Cuánto espera una pregunta antes de darse por perdida. */
export const TOPE_DE_RESPUESTA_MS = 15_000

export class ClienteLsp {
  private siguienteId = 1
  private readonly pendientes = new Map<number, Pendiente>()
  private readonly lector = new LectorDeMensajes()
  private vivo = true
  /** Las versiones de cada archivo abierto: LSP exige que crezcan y nunca se repitan. */
  private readonly versiones = new Map<string, number>()

  constructor(
    private readonly proceso: ProcesoDeServidor,
    private readonly alDiagnosticar: (datos: DiagnosticosDeArchivo) => void,
    private readonly alCaerse: (codigo: number | null) => void = () => {}
  ) {
    this.proceso.alRecibir((datos) => this.recibir(datos))
    this.proceso.alSalir((codigo) => {
      this.vivo = false
      // Lo que estaba esperando no va a llegar nunca: se rechaza acá y no se deja colgado, que es
      // como un editor termina sin completado y sin ningún aviso.
      for (const [id, pendiente] of this.pendientes) {
        clearTimeout(pendiente.vencimiento)
        pendiente.rechazar(
          new Error(`el servidor de lenguaje se cerró (${codigo ?? 'sin código'})`)
        )
        this.pendientes.delete(id)
      }
      this.alCaerse(codigo)
    })
  }

  get activo(): boolean {
    return this.vivo
  }

  private recibir(datos: Buffer): void {
    for (const mensaje of this.lector.recibir(datos)) {
      const sobre = mensaje as {
        id?: number
        method?: string
        params?: unknown
        result?: unknown
        error?: { message?: string }
      }
      if (sobre.method === 'textDocument/publishDiagnostics') {
        const params = sobre.params as { uri?: string; diagnostics?: unknown[] } | undefined
        if (params?.uri) {
          this.alDiagnosticar({ uri: params.uri, diagnosticos: params.diagnostics ?? [] })
        }
        continue
      }
      if (sobre.id === undefined) {
        continue
      }
      // Una PREGUNTA del servidor (tiene id y method) se contesta vacío: no implementamos ninguna,
      // y dejarla sin respuesta cuelga a servidores que esperan —rust-analyzer pide configuración
      // apenas arranca—.
      if (sobre.method !== undefined) {
        this.mandar({ jsonrpc: '2.0', id: sobre.id, result: null })
        continue
      }
      const pendiente = this.pendientes.get(sobre.id)
      if (!pendiente) {
        continue
      }
      clearTimeout(pendiente.vencimiento)
      this.pendientes.delete(sobre.id)
      if (sobre.error) {
        pendiente.rechazar(new Error(sobre.error.message ?? 'el servidor de lenguaje falló'))
      } else {
        pendiente.resolver(sobre.result ?? null)
      }
    }
  }

  private mandar(mensaje: unknown): void {
    if (this.vivo) {
      this.proceso.escribir(encuadrar(mensaje))
    }
  }

  /** Una notificación: no espera respuesta. */
  notificar(method: string, params: unknown): void {
    this.mandar({ jsonrpc: '2.0', method, params })
  }

  /** Una pregunta, con su tope: una que no vuelve no puede dejar al editor esperando para siempre. */
  preguntar(method: string, params: unknown): Promise<unknown> {
    if (!this.vivo) {
      return Promise.reject(new Error('el servidor de lenguaje no está corriendo'))
    }
    const id = this.siguienteId++
    return new Promise((resolver, rechazar) => {
      const vencimiento = setTimeout(() => {
        this.pendientes.delete(id)
        rechazar(new Error(`el servidor de lenguaje no contestó ${method}`))
      }, TOPE_DE_RESPUESTA_MS)
      this.pendientes.set(id, { resolver, rechazar, vencimiento })
      this.mandar({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** El saludo: qué sabe hacer el cliente y dónde está el proyecto. */
  async iniciar(raiz: string, uriDeLaRaiz: string): Promise<unknown> {
    const capacidades = await this.preguntar('initialize', {
      processId: null,
      rootPath: raiz,
      rootUri: uriDeLaRaiz,
      workspaceFolders: [{ uri: uriDeLaRaiz, name: raiz }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: false },
          references: {},
          rename: { prepareSupport: false },
          completion: {
            completionItem: {
              snippetSupport: false,
              documentationFormat: ['markdown', 'plaintext']
            }
          },
          publishDiagnostics: { relatedInformation: false },
          formatting: {},
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true }
            }
          },
          // Sin `codeActionLiteralSupport` los servidores contestan sólo comandos, y un comando
          // necesita `workspace/executeCommand`, que este cliente no implementa.
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: { valueSet: ['', 'quickfix', 'refactor', 'source'] }
            }
          }
        },
        workspace: { workspaceFolders: true, workspaceEdit: { documentChanges: true } }
      }
    })
    this.notificar('initialized', {})
    return capacidades
  }

  abrirArchivo(uri: string, lenguaje: string, texto: string): void {
    this.versiones.set(uri, 1)
    this.notificar('textDocument/didOpen', {
      textDocument: { uri, languageId: lenguaje, version: 1, text: texto }
    })
  }

  /**
   * El archivo cambió. Se manda el texto ENTERO y no el pedacito que cambió.
   *
   * Why: un cambio incremental exige que el cliente y el servidor estén de acuerdo, carácter por
   * carácter, sobre el contenido del archivo; cualquier diferencia —un guardado de afuera, un
   * deshacer— los desincroniza sin ruido y el servidor empieza a contestar sobre un texto que ya
   * no existe. Mandar todo cuesta un poco más de CPU y no puede desincronizarse nunca.
   */
  cambioArchivo(uri: string, texto: string): void {
    const version = (this.versiones.get(uri) ?? 1) + 1
    this.versiones.set(uri, version)
    this.notificar('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: texto }]
    })
  }

  cerrarArchivo(uri: string): void {
    this.versiones.delete(uri)
    this.notificar('textDocument/didClose', { textDocument: { uri } })
  }

  /** Lo apaga por las buenas; si no se va, lo corta. */
  async apagar(): Promise<void> {
    if (!this.vivo) {
      return
    }
    try {
      await this.preguntar('shutdown', null)
      this.notificar('exit', null)
    } catch {
      // Un servidor que no contesta el saludo de despedida igual tiene que irse.
    }
    this.vivo = false
    this.proceso.terminar()
  }
}
