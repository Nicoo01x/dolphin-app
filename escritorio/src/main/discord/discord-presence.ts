import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  OPERACION,
  desencuadrar,
  encuadrar,
  rutasDeDiscord,
  type OperacionDeDiscord
} from './discord-ipc-frame'
import { mismaActividad, type ActividadDeDiscord } from '../../shared/discord-presencia'

/**
 * La presencia de Dolphin en Discord, por su IPC local.
 *
 * Reglas que esto cumple y que son el motivo de casi todo el código:
 *
 *  - **Nunca tira la app.** Que Discord no esté instalado o no esté abierto es lo normal, no un
 *    error: todo falla en silencio y se vuelve a intentar. Una decoración no puede romper nada.
 *  - **Nada sale de la máquina.** El IPC es un named pipe local; no hay HTTP. Lo único que ve
 *    Discord son las dos líneas que armó `actividadDesde`, y el nombre del archivo va sin su ruta.
 *  - **Se respeta el límite de Discord.** `SET_ACTIVITY` está limitado, así que se manda como
 *    mucho uno cada 15 s: lo que llega mientras tanto reemplaza al pendiente en vez de hacer cola.
 *    Una cola haría que la presencia mostrara archivos que la persona ya cerró.
 */

/** Discord limita `SET_ACTIVITY`; con uno cada 15 s no se llega al tope ni con mucho. */
const ESPERA_ENTRE_ENVIOS_MS = 15_000
/** La reconexión arranca acá y se duplica hasta el techo: Discord puede abrirse más tarde. */
const REINTENTO_INICIAL_MS = 20_000
const REINTENTO_MAXIMO_MS = 5 * 60_000

type Estado = 'apagada' | 'conectando' | 'lista'

export type DependenciasDePresencia = {
  idDeAplicacion: string
  plataforma?: NodeJS.Platform
  entorno?: Record<string, string | undefined>
  /** Para las pruebas: abre el socket. En producción es `node:net`. */
  abrir?: (ruta: string) => Socket
  registrar?: (mensaje: string, detalle?: unknown) => void
}

export class PresenciaDeDiscord {
  private socket: Socket | null = null
  private estado: Estado = 'apagada'
  private pendiente: ActividadDeDiscord | null = null
  private ultimaMandada: ActividadDeDiscord | null = null
  private ultimoEnvio = 0
  private temporizadorEnvio: NodeJS.Timeout | null = null
  private temporizadorReintento: NodeJS.Timeout | null = null
  private esperaDeReintento = REINTENTO_INICIAL_MS
  // `ArrayBufferLike` y no `Buffer` a secas: `Buffer.concat` y `subarray` devuelven eso, y el
  // genérico por defecto es más estrecho.
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private cerrada = false

  constructor(private readonly deps: DependenciasDePresencia) {}

  /** Lo que hay que mostrar ahora. Se puede llamar todo lo que haga falta. */
  actualizar(actividad: ActividadDeDiscord): void {
    if (this.cerrada) {
      return
    }
    if (this.ultimaMandada && mismaActividad(this.ultimaMandada, actividad)) {
      return
    }
    this.pendiente = actividad
    if (this.estado === 'apagada') {
      this.conectar()
      return
    }
    this.vaciar()
  }

  /** Suelta el socket y los temporizadores. Después de esto el objeto no sirve más. */
  cerrar(): void {
    this.cerrada = true
    this.pendiente = null
    this.limpiarTemporizadores()
    this.soltarSocket()
    this.estado = 'apagada'
  }

  private limpiarTemporizadores(): void {
    if (this.temporizadorEnvio) {
      clearTimeout(this.temporizadorEnvio)
      this.temporizadorEnvio = null
    }
    if (this.temporizadorReintento) {
      clearTimeout(this.temporizadorReintento)
      this.temporizadorReintento = null
    }
  }

  private soltarSocket(): void {
    const socket = this.socket
    this.socket = null
    this.buffer = Buffer.alloc(0)
    if (!socket) {
      return
    }
    socket.removeAllListeners()
    socket.destroy()
  }

  private anotar(mensaje: string, detalle?: unknown): void {
    this.deps.registrar?.(mensaje, detalle)
  }

  private conectar(): void {
    if (this.cerrada || this.estado !== 'apagada') {
      return
    }
    this.estado = 'conectando'
    const rutas = rutasDeDiscord(
      this.deps.plataforma ?? process.platform,
      this.deps.entorno ?? process.env
    )
    this.probar(rutas, 0)
  }

  /**
   * Prueba las rutas una por una. Hay hasta diez pipes porque puede haber varios clientes de
   * Discord abiertos, y la primera que conteste es la que sirve.
   */
  private probar(rutas: readonly string[], indice: number): void {
    if (this.cerrada) {
      return
    }
    const ruta = rutas[indice]
    if (ruta === undefined) {
      this.estado = 'apagada'
      this.anotar('Discord no está escuchando; se reintenta más tarde')
      this.programarReintento()
      return
    }
    const abrir = this.deps.abrir ?? ((destino: string) => connect(destino))
    let socket: Socket
    try {
      socket = abrir(ruta)
    } catch (error) {
      this.anotar('no se pudo abrir el socket de Discord', error)
      this.probar(rutas, indice + 1)
      return
    }
    const siguiente = (): void => {
      socket.removeAllListeners()
      socket.destroy()
      this.probar(rutas, indice + 1)
    }
    socket.once('error', siguiente)
    socket.once('close', siguiente)
    socket.once('connect', () => {
      socket.removeListener('error', siguiente)
      socket.removeListener('close', siguiente)
      this.adoptar(socket)
    })
  }

  private adoptar(socket: Socket): void {
    this.socket = socket
    this.esperaDeReintento = REINTENTO_INICIAL_MS
    socket.on('data', (trozo) => this.leer(trozo))
    socket.on('error', (error) => {
      this.anotar('el socket de Discord falló', error)
      this.caer()
    })
    socket.on('close', () => this.caer())
    this.escribir(OPERACION.saludo, { v: 1, client_id: this.deps.idDeAplicacion })
  }

  private caer(): void {
    if (this.cerrada) {
      return
    }
    this.soltarSocket()
    this.estado = 'apagada'
    this.ultimaMandada = null
    this.programarReintento()
  }

  /**
   * Vuelve a intentar con espera que se duplica. Sin esto, con Discord cerrado la app intentaría
   * abrir diez pipes cada vez que alguien cambia de archivo.
   */
  private programarReintento(): void {
    if (this.cerrada || this.pendiente === null || this.temporizadorReintento) {
      return
    }
    const espera = this.esperaDeReintento
    this.esperaDeReintento = Math.min(espera * 2, REINTENTO_MAXIMO_MS)
    this.temporizadorReintento = setTimeout(() => {
      this.temporizadorReintento = null
      this.conectar()
    }, espera)
    this.temporizadorReintento.unref?.()
  }

  private leer(trozo: Buffer): void {
    this.buffer = this.buffer.length === 0 ? trozo : Buffer.concat([this.buffer, trozo])
    const { tramas, resto, roto } = desencuadrar(this.buffer)
    this.buffer = resto
    for (const trama of tramas) {
      this.atender(trama.operacion, trama.datos)
    }
    if (roto) {
      this.anotar('trama de Discord ilegible; se corta el socket', roto)
      this.caer()
    }
  }

  private atender(operacion: number, datos: unknown): void {
    if (operacion === OPERACION.ping) {
      this.escribir(OPERACION.pong, datos)
      return
    }
    if (operacion === OPERACION.cierre) {
      this.anotar('Discord cerró la conexión', datos)
      this.caer()
      return
    }
    if (operacion !== OPERACION.trama) {
      return
    }
    const evento =
      datos !== null && typeof datos === 'object' && 'evt' in datos
        ? (datos as { evt?: unknown }).evt
        : undefined
    if (evento === 'READY') {
      this.estado = 'lista'
      this.vaciar()
    }
  }

  /** Manda lo pendiente si pasó la espera; si no, lo deja agendado. */
  private vaciar(): void {
    if (this.cerrada || this.estado !== 'lista' || this.pendiente === null) {
      return
    }
    const falta = this.ultimoEnvio + ESPERA_ENTRE_ENVIOS_MS - Date.now()
    if (falta > 0) {
      if (!this.temporizadorEnvio) {
        this.temporizadorEnvio = setTimeout(() => {
          this.temporizadorEnvio = null
          this.vaciar()
        }, falta)
        this.temporizadorEnvio.unref?.()
      }
      return
    }
    const actividad = this.pendiente
    this.pendiente = null
    this.ultimaMandada = actividad
    this.ultimoEnvio = Date.now()
    this.escribir(OPERACION.trama, {
      cmd: 'SET_ACTIVITY',
      nonce: randomUUID(),
      args: { pid: process.pid, activity: actividad }
    })
  }

  private escribir(operacion: OperacionDeDiscord, datos: unknown): void {
    const socket = this.socket
    if (!socket || socket.destroyed) {
      return
    }
    try {
      socket.write(encuadrar(operacion, datos))
    } catch (error) {
      this.anotar('no se pudo escribir en Discord', error)
      this.caer()
    }
  }
}
