/**
 * Los servidores de lenguaje que están corriendo, uno por (servidor, raíz del proyecto).
 *
 * Lo que decide todo acá es el ciclo de vida: un servidor de lenguaje es un proceso caro que tarda
 * en indexar, así que se arranca una vez y se reusa; y es un proceso del sistema, así que si la app
 * se va sin apagarlo queda huérfano comiendo memoria.
 *
 * Nada de esto instala nada: se usa el que esté en el PATH. Si no está, se dice y el editor sigue
 * andando — un editor que se cae porque falta una herramienta opcional es peor que uno sin esa
 * herramienta.
 */

import { spawnProcess } from '@dolphin/process-host'
import { rutaExiste } from '../dolphin/ruta-existe'
import { ClienteLsp, type DiagnosticosDeArchivo, type ProcesoDeServidor } from './cliente-lsp'
import { ejecutableDelServidor } from './ejecutable-del-servidor'
import { raizDelProyecto, servidorDe, type ServidorDeLenguaje } from '../../shared/lsp/servidores'
import { uriDeArchivo } from '../../shared/lsp/a-monaco'

export type ServidorListo = {
  readonly cliente: ClienteLsp
  readonly servidor: ServidorDeLenguaje
  readonly raiz: string
}

/** Por qué no hay servidor para un archivo; cada uno se puede decir en pantalla. */
export type SinServidor =
  | { readonly motivo: 'sin-servidor-para-el-lenguaje' }
  | { readonly motivo: 'sin-raiz'; readonly servidor: ServidorDeLenguaje }
  | { readonly motivo: 'no-instalado'; readonly servidor: ServidorDeLenguaje }
  | {
      readonly motivo: 'no-arranco'
      readonly servidor: ServidorDeLenguaje
      readonly detalle: string
    }

/** Abre el proceso del servidor; null es que no está instalado. */
type AbrirProceso = (
  servidor: ServidorDeLenguaje,
  raiz: string
) => ProcesoDeServidor | null | Promise<ProcesoDeServidor | null>

type Dependencias = {
  readonly abrirProceso?: AbrirProceso
  readonly existe?: (ruta: string) => Promise<boolean>
  /**
   * Un servidor que estaba andando se cayó. El editor lo necesita saber para devolverle el hover y
   * el completado al worker de TypeScript de Monaco: sin servidor, mejor el worker que nada.
   */
  readonly alCaerse?: (servidorId: string, raiz: string) => void
}

/** Cuánto de stderr se guarda para decir por qué no arrancó: el final, que es donde está el error. */
const TOPE_DEL_STDERR = 600

function carpetaDe(rutaDelArchivo: string): string {
  return rutaDelArchivo.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
}

async function procesoReal(
  servidor: ServidorDeLenguaje,
  raiz: string
): Promise<ProcesoDeServidor | null> {
  // Why la ruta y no el nombre: el process-host lee el shim de npm sólo si le llega la ruta del
  // `.cmd` (con el nombre pelado, Windows da ENOENT aunque esté en el PATH). Leído el shim,
  // arranca el programa que nombra, que es mejor que `shell: true`: ese concatena los argumentos
  // sin escapar (DEP0190) y deja sin efecto el `windowsHide`, o sea una consola negra robando el
  // foco.
  const ejecutable = await ejecutableDelServidor(servidor)
  if (!ejecutable) {
    return null
  }
  const hijo = spawnProcess({
    program: ejecutable,
    args: [...servidor.argumentos],
    cwd: raiz,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  if (!hijo.stdin || !hijo.stdout) {
    return null
  }
  // Se lee siempre: un stderr entubado que nadie lee llena su buffer y frena al servidor. Y la cola
  // es el motivo cuando se cierra sin contestar (rustup sin el componente, un intérprete que falta).
  let errores = ''
  hijo.stderr?.on('data', (datos: Buffer) => {
    errores = (errores + datos.toString()).slice(-TOPE_DEL_STDERR)
  })
  return {
    ultimoError: () => errores.trim(),
    escribir: (datos) => void hijo.stdin?.write(datos),
    alRecibir: (escuchar) => void hijo.stdout?.on('data', escuchar),
    alSalir: (escuchar) => {
      let avisado = false
      const unaVez = (codigo: number | null): void => {
        if (!avisado) {
          avisado = true
          escuchar(codigo)
        }
      }
      // `close` y no `exit`: llega cuando ya se leyó todo su stderr, que es el motivo de la caída.
      hijo.on('close', (codigo) => unaVez(codigo))
      // Un ejecutable que no existe llega como `error` y nunca como `exit`: sin esto, el cliente
      // se queda esperando una respuesta de un proceso que nunca existió.
      hijo.on('error', () => unaVez(null))
    },
    terminar: () => void hijo.kill()
  }
}

export class ServidoresVivos {
  private readonly vivos = new Map<string, ServidorListo>()
  private readonly arrancando = new Map<string, Promise<ServidorListo | SinServidor>>()
  private readonly abrirProceso: AbrirProceso
  private readonly existe: (ruta: string) => Promise<boolean>
  private readonly alCaerse: (servidorId: string, raiz: string) => void
  /** La raíz de cada carpeta con un archivo abierto, por servidor: la anota `para`. */
  private readonly raices = new Map<string, string | null>()

  constructor(
    private readonly alDiagnosticar: (raiz: string, datos: DiagnosticosDeArchivo) => void,
    deps: Dependencias = {}
  ) {
    this.abrirProceso = deps.abrirProceso ?? procesoReal
    this.existe = deps.existe ?? rutaExiste
    this.alCaerse = deps.alCaerse ?? (() => {})
  }

  private clave(servidor: ServidorDeLenguaje, raiz: string): string {
    return `${servidor.id}\u0000${raiz}`
  }

  /**
   * Why en dos pasadas: `raizDelProyecto` pregunta de a una ruta y en orden; acá se juntan todas
   * las que miraría, se consultan al disco en paralelo sin bloquear main, y después decide con las
   * respuestas. Abrir un archivo vuelve a mirar, así que un tsconfig nuevo se ve al reabrir.
   */
  private async raizDelArchivo(
    rutaDelArchivo: string,
    servidor: ServidorDeLenguaje
  ): Promise<string | null> {
    const consultadas: string[] = []
    raizDelProyecto(rutaDelArchivo, servidor, (ruta) => {
      consultadas.push(ruta)
      return false
    })
    const existen = await Promise.all(consultadas.map((ruta) => this.existe(ruta)))
    const existentes = new Set(consultadas.filter((_, indice) => existen[indice]))
    const raiz = raizDelProyecto(rutaDelArchivo, servidor, (ruta) => existentes.has(ruta))
    this.raices.set(this.clave(servidor, carpetaDe(rutaDelArchivo)), raiz)
    return raiz
  }

  /**
   * El servidor para un archivo, arrancándolo si hace falta.
   *
   * Why se guarda la PROMESA y no sólo el cliente: abrir dos archivos del mismo proyecto a la vez
   * —algo que pasa siempre al restaurar una sesión— arrancaría dos servidores, y el segundo se
   * queda indexando el mismo proyecto para nada.
   */
  async para(rutaDelArchivo: string, lenguaje: string): Promise<ServidorListo | SinServidor> {
    const servidor = servidorDe(lenguaje)
    if (!servidor) {
      return { motivo: 'sin-servidor-para-el-lenguaje' }
    }
    const raiz = await this.raizDelArchivo(rutaDelArchivo, servidor)
    if (raiz === null) {
      return { motivo: 'sin-raiz', servidor }
    }
    const clave = this.clave(servidor, raiz)
    const yaEsta = this.vivos.get(clave)
    if (yaEsta?.cliente.activo) {
      return yaEsta
    }
    const enCamino = this.arrancando.get(clave)
    if (enCamino) {
      return enCamino
    }
    const promesa = this.arrancar(servidor, raiz, clave).finally(() => {
      this.arrancando.delete(clave)
    })
    this.arrancando.set(clave, promesa)
    return promesa
  }

  private async arrancar(
    servidor: ServidorDeLenguaje,
    raiz: string,
    clave: string
  ): Promise<ServidorListo | SinServidor> {
    let proceso: ProcesoDeServidor | null
    try {
      proceso = await this.abrirProceso(servidor, raiz)
    } catch (error) {
      return {
        motivo: 'no-arranco',
        servidor,
        detalle: error instanceof Error ? error.message : String(error)
      }
    }
    if (!proceso) {
      return { motivo: 'no-instalado', servidor }
    }
    const cliente = new ClienteLsp(
      proceso,
      (datos) => this.alDiagnosticar(raiz, datos),
      () => {
        this.vivos.delete(clave)
        this.alCaerse(servidor.id, raiz)
      }
    )
    try {
      await cliente.iniciar(raiz, uriDeArchivo(raiz))
    } catch (error) {
      this.vivos.delete(clave)
      // El ejecutable se encontró y se lanzó: si el saludo falla, el servidor está instalado pero
      // no pudo arrancar (p. ej. typescript-language-server sin un `tsserver.js` que usar). Y si
      // quedó vivo, se lo corta: nadie le va a volver a hablar.
      proceso.terminar()
      const mensaje = error instanceof Error ? error.message : String(error)
      // Si se cerró sin contestar, el «se cerró (1)» del cliente no dice nada; su stderr sí.
      const delServidor = cliente.activo ? '' : (proceso.ultimoError?.() ?? '')
      return { motivo: 'no-arranco', servidor, detalle: delServidor || mensaje }
    }
    const listo: ServidorListo = { cliente, servidor, raiz }
    this.vivos.set(clave, listo)
    return listo
  }

  /**
   * Si hay un servidor andando para ese archivo, sin arrancar ninguno.
   *
   * Why sin mirar el disco: se llama en cada tecla (`lsp:cambio`), y el archivo ya pasó por `para`
   * al abrirse, que dejó anotada la raíz de su carpeta.
   */
  yaAndando(rutaDelArchivo: string, lenguaje: string): ServidorListo | null {
    const servidor = servidorDe(lenguaje)
    if (!servidor) {
      return null
    }
    const raiz = this.raices.get(this.clave(servidor, carpetaDe(rutaDelArchivo)))
    if (!raiz) {
      return null
    }
    const listo = this.vivos.get(this.clave(servidor, raiz))
    return listo?.cliente.activo ? listo : null
  }

  /** Apaga todos: se llama al cerrar la app para no dejar procesos huérfanos. */
  async apagarTodos(): Promise<void> {
    const todos = [...this.vivos.values()]
    this.vivos.clear()
    await Promise.all(todos.map((listo) => listo.cliente.apagar()))
  }

  get cuantos(): number {
    return this.vivos.size
  }
}
