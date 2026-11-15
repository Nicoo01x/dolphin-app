/**
 * El encuadre de LSP: cómo viajan los mensajes por la entrada y la salida de un servidor de
 * lenguaje.
 *
 * Es `Content-Length: N\r\n\r\n` y después N BYTES de JSON. Dos cosas que parecen detalles y son
 * la mitad de los errores de una implementación:
 *
 * 1. **N son bytes, no caracteres.** Un acento o un emoji ocupan más de uno en UTF-8, así que
 *    medir con `.length` corta el JSON a la mitad en cuanto alguien escribe «función».
 * 2. **El transporte no respeta los mensajes.** Un `data` del proceso puede traer medio mensaje,
 *    tres mensajes, o el encabezado de uno y el cuerpo de otro. Por eso el lector guarda lo que
 *    sobra y devuelve sólo los mensajes completos.
 */

const SEPARADOR = Buffer.from('\r\n\r\n', 'ascii')
const LARGO = /content-length:\s*(\d+)/i

/** Un mensaje listo para mandar: su encabezado y su cuerpo, en un solo buffer. */
export function encuadrar(mensaje: unknown): Buffer {
  const cuerpo = Buffer.from(JSON.stringify(mensaje), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${cuerpo.length}\r\n\r\n`, 'ascii'), cuerpo])
}

/**
 * El lector: se le va dando lo que llega y devuelve los mensajes que ya estén completos.
 *
 * Guarda estado a propósito (lo que sobró de la vuelta anterior), así que hay uno por servidor y
 * no se comparte.
 */
export class LectorDeMensajes {
  private pendiente: Buffer = Buffer.alloc(0)

  /** Lo que llegó del proceso; devuelve los mensajes enteros que haya, ya parseados. */
  recibir(trozo: Buffer): unknown[] {
    this.pendiente = this.pendiente.length === 0 ? trozo : Buffer.concat([this.pendiente, trozo])
    const mensajes: unknown[] = []
    for (;;) {
      const corte = this.pendiente.indexOf(SEPARADOR)
      if (corte === -1) {
        return mensajes
      }
      const encabezado = this.pendiente.subarray(0, corte).toString('ascii')
      const largo = LARGO.exec(encabezado)
      if (!largo) {
        // Un encabezado sin Content-Length no se puede recorrer: se descarta hasta el separador y
        // se sigue. Tirar todo el buffer perdería los mensajes buenos que vengan atrás.
        this.pendiente = this.pendiente.subarray(corte + SEPARADOR.length)
        continue
      }
      const bytes = Number(largo[1])
      const desde = corte + SEPARADOR.length
      if (this.pendiente.length < desde + bytes) {
        // Falta cuerpo: se espera al próximo trozo sin consumir nada.
        return mensajes
      }
      const cuerpo = this.pendiente.subarray(desde, desde + bytes).toString('utf8')
      this.pendiente = this.pendiente.subarray(desde + bytes)
      try {
        mensajes.push(JSON.parse(cuerpo))
      } catch {
        // Un cuerpo que no parsea es de ese mensaje y de ninguno más: se saltea y se sigue leyendo.
      }
    }
  }

  /** Cuánto quedó sin consumir, para poder afirmarlo en un test. */
  get sobrante(): number {
    return this.pendiente.length
  }
}
