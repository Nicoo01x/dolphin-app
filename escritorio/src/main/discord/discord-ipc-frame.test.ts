import { describe, expect, it } from 'vitest'
import { OPERACION, desencuadrar, encuadrar, rutasDeDiscord } from './discord-ipc-frame'

describe('tramas del IPC de Discord', () => {
  it('lo que se encuadra se vuelve a leer igual', () => {
    const datos = { cmd: 'SET_ACTIVITY', args: { pid: 7 } }
    const { tramas, resto } = desencuadrar(encuadrar(OPERACION.trama, datos))
    expect(tramas).toEqual([{ operacion: OPERACION.trama, datos }])
    expect(resto).toHaveLength(0)
  })

  it('el encabezado son dos enteros de 32 bits little-endian', () => {
    const trama = encuadrar(OPERACION.saludo, { v: 1 })
    expect(trama.readInt32LE(0)).toBe(OPERACION.saludo)
    expect(trama.readInt32LE(4)).toBe(trama.length - 8)
  })

  /**
   * El error clásico de esto: un socket no respeta los límites de los mensajes. Suponer que cada
   * lectura es una trama deja la conexión desincronizada para siempre.
   */
  it('una trama partida en dos lecturas se arma con el resto', () => {
    const entera = encuadrar(OPERACION.trama, { evt: 'READY' })
    const corte = 6
    const primera = desencuadrar(entera.subarray(0, corte))
    expect(primera.tramas).toEqual([])
    expect(primera.resto).toHaveLength(corte)

    const segunda = desencuadrar(Buffer.concat([primera.resto, entera.subarray(corte)]))
    expect(segunda.tramas).toEqual([{ operacion: OPERACION.trama, datos: { evt: 'READY' } }])
    expect(segunda.resto).toHaveLength(0)
  })

  it('dos tramas en una lectura salen las dos', () => {
    const juntas = Buffer.concat([
      encuadrar(OPERACION.trama, { evt: 'READY' }),
      encuadrar(OPERACION.ping, { n: 1 })
    ])
    const { tramas, resto } = desencuadrar(juntas)
    expect(tramas.map((t) => t.operacion)).toEqual([OPERACION.trama, OPERACION.ping])
    expect(resto).toHaveLength(0)
  })

  it('deja en el resto lo que sobra de una tercera trama incompleta', () => {
    const juntas = Buffer.concat([
      encuadrar(OPERACION.trama, { evt: 'READY' }),
      encuadrar(OPERACION.ping, { n: 1 }).subarray(0, 5)
    ])
    const { tramas, resto } = desencuadrar(juntas)
    expect(tramas).toHaveLength(1)
    expect(resto).toHaveLength(5)
  })

  // Un largo absurdo vendría de un socket que no es Discord o de basura tras reconectar: sin este
  // corte se reservaría memoria por un número que no controlamos.
  it('un largo imposible corta el flujo en vez de reservar memoria', () => {
    const mentira = Buffer.alloc(8)
    mentira.writeInt32LE(OPERACION.trama, 0)
    mentira.writeInt32LE(500_000_000, 4)
    expect(desencuadrar(mentira).roto).toMatch(/largo imposible/)
  })

  it('un cuerpo que no es JSON corta el flujo', () => {
    const cuerpo = Buffer.from('{no json', 'utf8')
    const trama = Buffer.alloc(8 + cuerpo.length)
    trama.writeInt32LE(OPERACION.trama, 0)
    trama.writeInt32LE(cuerpo.length, 4)
    cuerpo.copy(trama, 8)
    const { roto } = desencuadrar(trama)
    expect(roto).toMatch(/no es JSON/)
  })

  it('un largo negativo no se acepta', () => {
    const mentira = Buffer.alloc(8)
    mentira.writeInt32LE(OPERACION.trama, 0)
    mentira.writeInt32LE(-1, 4)
    expect(desencuadrar(mentira).roto).toBeDefined()
  })
})

describe('dónde escucha Discord', () => {
  it('en Windows son los pipes nombrados', () => {
    const rutas = rutasDeDiscord('win32', {})
    expect(rutas[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
    expect(rutas).toHaveLength(10)
  })

  it('en Linux sale del directorio de ejecución del usuario', () => {
    const rutas = rutasDeDiscord('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
    expect(rutas).toContain('/run/user/1000/discord-ipc-0')
  })

  // Flatpak y Snap meten el socket una carpeta más adentro: sin esto, en esos Discord no conecta.
  it('también mira las carpetas de Flatpak y Snap', () => {
    const rutas = rutasDeDiscord('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
    expect(rutas).toContain('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0')
    expect(rutas).toContain('/run/user/1000/snap.discord/discord-ipc-0')
  })

  it('sin variables de entorno cae a /tmp', () => {
    expect(rutasDeDiscord('darwin', {})).toContain('/tmp/discord-ipc-0')
  })

  it('una barra final no deja una barra doble', () => {
    expect(rutasDeDiscord('linux', { XDG_RUNTIME_DIR: '/run/user/1000/' })).toContain(
      '/run/user/1000/discord-ipc-0'
    )
  })
})
