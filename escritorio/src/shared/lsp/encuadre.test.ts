// El encuadre de LSP. Los dos casos que rompen una implementación ingenua: medir en caracteres en
// vez de bytes, y suponer que cada trozo del proceso es un mensaje entero.

import { describe, expect, it } from 'vitest'
import { encuadrar, LectorDeMensajes } from './encuadre'

describe('el encuadre de LSP', () => {
  it('mide el largo en BYTES y no en caracteres', () => {
    const marco = encuadrar({ texto: 'función ✅' })
    const encabezado = marco.subarray(0, marco.indexOf('\r\n\r\n')).toString('ascii')
    const cuerpo = marco.subarray(marco.indexOf('\r\n\r\n') + 4)
    const declarado = Number(/Content-Length: (\d+)/.exec(encabezado)?.[1])
    expect(declarado).toBe(cuerpo.length)
    // Con `.length` del string daría menos y el JSON llegaría cortado.
    expect(declarado).toBeGreaterThan(JSON.stringify({ texto: 'función ✅' }).length)
  })

  it('lee un mensaje entero', () => {
    const lector = new LectorDeMensajes()
    expect(lector.recibir(encuadrar({ id: 1, resultado: 'ok' }))).toEqual([
      { id: 1, resultado: 'ok' }
    ])
    expect(lector.sobrante).toBe(0)
  })

  it('arma un mensaje que llegó partido en varios trozos', () => {
    const lector = new LectorDeMensajes()
    const marco = encuadrar({ id: 2, texto: 'función con acentos y eñes' })
    // Partido justo adentro del cuerpo, que es donde más duele.
    const corte = marco.length - 7
    expect(lector.recibir(marco.subarray(0, corte))).toEqual([])
    expect(lector.sobrante).toBeGreaterThan(0)
    expect(lector.recibir(marco.subarray(corte))).toEqual([
      { id: 2, texto: 'función con acentos y eñes' }
    ])
    expect(lector.sobrante).toBe(0)
  })

  it('devuelve los tres mensajes que vinieron pegados en un solo trozo', () => {
    const lector = new LectorDeMensajes()
    const pegados = Buffer.concat([encuadrar({ n: 1 }), encuadrar({ n: 2 }), encuadrar({ n: 3 })])
    expect(lector.recibir(pegados)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('un cuerpo que no parsea se saltea y el siguiente mensaje igual llega', () => {
    const lector = new LectorDeMensajes()
    const roto = Buffer.from('Content-Length: 3\r\n\r\n{{{', 'utf8')
    expect(lector.recibir(Buffer.concat([roto, encuadrar({ n: 9 })]))).toEqual([{ n: 9 }])
  })

  it('un encabezado sin Content-Length no se come los mensajes que vienen atrás', () => {
    const lector = new LectorDeMensajes()
    const sinLargo = Buffer.from('X-Algo: 1\r\n\r\n', 'ascii')
    expect(lector.recibir(Buffer.concat([sinLargo, encuadrar({ n: 7 })]))).toEqual([{ n: 7 }])
  })
})
