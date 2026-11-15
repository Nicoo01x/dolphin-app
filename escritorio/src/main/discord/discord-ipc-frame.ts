/**
 * Las tramas del IPC de Discord: 4 bytes de operación + 4 de largo, los dos enteros de 32 bits
 * little-endian, y después el JSON.
 *
 * Por qué a mano y no con una librería: son veinte líneas y el repo no agrega dependencias para lo
 * que se hace con `node:net`. Y por qué un módulo aparte: el cliente habla con un socket, así que
 * no se puede probar sin uno; esto sí, y es donde están los errores que importan (una trama
 * partida en dos lecturas, dos tramas en una).
 */

export const OPERACION = {
  saludo: 0,
  trama: 1,
  cierre: 2,
  ping: 3,
  pong: 4
} as const

export type OperacionDeDiscord = (typeof OPERACION)[keyof typeof OPERACION]

/** El encabezado son dos enteros de 32 bits. */
const ENCABEZADO = 8

/**
 * Discord no manda nada más grande que esto, y un número absurdo en el largo —un socket que no es
 * Discord, basura tras una reconexión— haría reservar memoria por un dato que no controlamos.
 */
const LARGO_MAXIMO = 1024 * 1024

export function encuadrar(operacion: OperacionDeDiscord, datos: unknown): Buffer {
  const cuerpo = Buffer.from(JSON.stringify(datos), 'utf8')
  const trama = Buffer.allocUnsafe(ENCABEZADO + cuerpo.length)
  trama.writeInt32LE(operacion, 0)
  trama.writeInt32LE(cuerpo.length, 4)
  cuerpo.copy(trama, ENCABEZADO)
  return trama
}

export type TramaLeida = { operacion: number; datos: unknown }

export type Desencuadre = {
  tramas: readonly TramaLeida[]
  /** Lo que llegó de una trama que todavía no está completa, para pegarle lo que venga después. */
  resto: Buffer
  /** El flujo no se puede seguir leyendo: largo imposible o JSON roto. Hay que cortar el socket. */
  roto?: string
}

/**
 * Saca del búfer todas las tramas completas que haya.
 *
 * Un socket no respeta los límites de los mensajes: una trama puede llegar en dos pedazos y dos
 * tramas en una sola lectura. Por eso devuelve el resto en vez de suponer que cada lectura es una
 * trama, que es el error clásico de esto.
 */
export function desencuadrar(entrada: Buffer): Desencuadre {
  const tramas: TramaLeida[] = []
  let resto = entrada
  while (resto.length >= ENCABEZADO) {
    const operacion = resto.readInt32LE(0)
    const largo = resto.readInt32LE(4)
    if (largo < 0 || largo > LARGO_MAXIMO) {
      return { tramas, resto: Buffer.alloc(0), roto: `largo imposible: ${largo}` }
    }
    if (resto.length < ENCABEZADO + largo) {
      break
    }
    const cuerpo = resto.subarray(ENCABEZADO, ENCABEZADO + largo).toString('utf8')
    resto = resto.subarray(ENCABEZADO + largo)
    try {
      tramas.push({ operacion, datos: JSON.parse(cuerpo) })
    } catch {
      return { tramas, resto: Buffer.alloc(0), roto: 'el cuerpo de la trama no es JSON' }
    }
  }
  return { tramas, resto }
}

/** Las rutas donde Discord escucha, en orden. Prueba varias porque puede haber más de un cliente. */
export function rutasDeDiscord(
  plataforma: NodeJS.Platform,
  entorno: Record<string, string | undefined>
): readonly string[] {
  const cuantas = 10
  if (plataforma === 'win32') {
    return Array.from({ length: cuantas }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  }
  // En Linux y macOS el socket vive en el directorio temporal del usuario, y Flatpak y Snap lo
  // meten una carpeta más adentro.
  const base = entorno.XDG_RUNTIME_DIR ?? entorno.TMPDIR ?? entorno.TMP ?? entorno.TEMP ?? '/tmp'
  const carpetas = ['', 'app/com.discordapp.Discord/', 'snap.discord/']
  return carpetas.flatMap((carpeta) =>
    Array.from(
      { length: cuantas },
      (_, i) => `${base.replace(/\/+$/, '')}/${carpeta}discord-ipc-${i}`
    )
  )
}
