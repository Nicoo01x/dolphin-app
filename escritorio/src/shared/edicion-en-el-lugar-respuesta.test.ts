import { describe, expect, it } from 'vitest'
import { leerRespuestaDeEdicion } from './edicion-en-el-lugar-respuesta'

/**
 * Qué volvió de un Cmd+K: un reemplazo para aceptar o una respuesta para leer.
 *
 * El error caro es uno solo: tomar una respuesta por un reemplazo, porque Aceptar escribe esa prosa
 * adentro del archivo. Por eso toda duda cae del lado de la respuesta.
 */
describe('leerRespuestaDeEdicion', () => {
  it('un bloque marcado como reemplazo es un cambio, aunque tenga charla alrededor', () => {
    const respuesta = ['Listo:', '```reemplazo', 'return a + b', '```', '¿Algo más?'].join('\n')
    expect(leerRespuestaDeEdicion(respuesta)).toEqual({ tipo: 'edicion', codigo: 'return a + b' })
  })

  it('con varios reemplazos vale el último', () => {
    const respuesta = ['```reemplazo', 'uno', '```', 'mejor:', '```reemplazo', 'dos', '```'].join(
      '\n'
    )
    expect(leerRespuestaDeEdicion(respuesta)).toEqual({ tipo: 'edicion', codigo: 'dos' })
  })

  it('un único bloque con el lenguaje y nada más alrededor también es un cambio', () => {
    expect(leerRespuestaDeEdicion('```ts\nreturn a + b\n```')).toEqual({
      tipo: 'edicion',
      codigo: 'return a + b'
    })
  })

  // El bug que reportó Nico: la respuesta a una pregunta salía como reemplazo con un Aceptar.
  it('una pregunta contestada en prosa es una respuesta', () => {
    const texto = 'Arma el encabezado.\n\n- `esquema` = `"Bearer"`\n- `token` = el del login'
    expect(leerRespuestaDeEdicion(texto)).toEqual({ tipo: 'respuesta', texto })
  })

  it('una respuesta con un ejemplo de código sigue siendo una respuesta', () => {
    const texto = ['Podrías escribirlo así:', '```ts', 'const a = 1', '```'].join('\n')
    expect(leerRespuestaDeEdicion(texto)).toEqual({ tipo: 'respuesta', texto })
  })

  it('la etiqueta se reconoce sin importar mayúsculas ni lo que venga detrás', () => {
    expect(leerRespuestaDeEdicion('Hecho\n```Reemplazo ts\nx\n```')).toEqual({
      tipo: 'edicion',
      codigo: 'x'
    })
  })
})
