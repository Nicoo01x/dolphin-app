import { describe, expect, it } from 'vitest'
import {
  aplicarEdicionEnElLugar,
  codigoDeLaRespuesta,
  pedidoDeEdicion,
  sangriaDelTramo
} from './edicion-en-el-lugar'

/**
 * Lo que entra al archivo cuando se edita con IA en el lugar.
 *
 * Acá se prueba el momento peligroso: la respuesta del modelo se escribe adentro del archivo de
 * la persona. Si la lectura de la respuesta falla, no queda un error a la vista — queda prosa
 * metida en medio del código.
 */

describe('leer el código de una respuesta', () => {
  it('una respuesta pelada es el código', () => {
    expect(codigoDeLaRespuesta('return a + b')).toBe('return a + b')
  })

  it('saca el bloque y deja afuera la charla de alrededor', () => {
    const respuesta = ['Acá tenés el cambio:', '```ts', 'return a + b', '```', '¿Lo aplico?'].join(
      '\n'
    )
    expect(codigoDeLaRespuesta(respuesta)).toBe('return a + b')
  })

  it('sin nombre de lenguaje también', () => {
    expect(codigoDeLaRespuesta('```\nx = 1\n```')).toBe('x = 1')
  })

  // La mitad de este repo es código que habla de markdown.
  it('un bloque que adentro tiene una cerca no se corta al medio', () => {
    const respuesta = ['````md', 'ejemplo:', '```ts', 'const a = 1', '```', 'fin', '````'].join(
      '\n'
    )
    expect(codigoDeLaRespuesta(respuesta)).toBe(
      ['ejemplo:', '```ts', 'const a = 1', '```', 'fin'].join('\n')
    )
  })

  it('entre varios bloques se queda con el grande', () => {
    const respuesta = ['```', 'src/a.ts', '```', 'y el código:', '```ts', 'uno', 'dos', '```'].join(
      '\n'
    )
    expect(codigoDeLaRespuesta(respuesta)).toBe('uno\ndos')
  })

  it('una cerca que nunca cierra no se traga el resto', () => {
    // Sin bloque cerrado no hay bloque: vale el texto entero, que es el caso menos malo.
    expect(codigoDeLaRespuesta('```ts\nsin cierre')).toBe('```ts\nsin cierre')
  })

  it('un bloque vacío es un bloque vacío, no el texto entero', () => {
    expect(codigoDeLaRespuesta('antes\n```\n```\ndespues')).toBe('')
  })
})

describe('respetar la sangría al reemplazar', () => {
  const texto = 'function f() {\n  const a = 1\n}\n'
  const tramo = { desde: texto.indexOf('const'), hasta: texto.indexOf('= 1') + 3 }

  it('reconoce la sangría de la línea', () => {
    expect(sangriaDelTramo(texto, tramo)).toBe('  ')
  })

  it('sangra todo menos la primera línea, que ya está en su lugar', () => {
    const { texto: nuevo } = aplicarEdicionEnElLugar(texto, tramo, 'const a = 1\nconst b = 2')
    expect(nuevo).toBe('function f() {\n  const a = 1\n  const b = 2\n}\n')
  })

  it('una línea vacía queda vacía y no llena de espacios', () => {
    const { texto: nuevo } = aplicarEdicionEnElLugar(texto, tramo, 'uno\n\ndos')
    expect(nuevo).toContain('  uno\n\n  dos')
  })

  // Si antes del tramo hay código y no sólo espacios, la selección empieza en medio de una línea.
  it('sin sangría propia no inventa ninguna', () => {
    const suelto = 'const a = 1'
    const todo = { desde: 6, hasta: 7 }
    expect(sangriaDelTramo(suelto, todo)).toBe('')
    expect(aplicarEdicionEnElLugar(suelto, todo, 'b\nc').texto).toBe('const b\nc = 1')
  })

  it('devuelve el tramo que ocupa lo nuevo, para pintarle el diff', () => {
    const { tramoNuevo } = aplicarEdicionEnElLugar(texto, tramo, 'x')
    expect(tramoNuevo).toEqual({ desde: tramo.desde, hasta: tramo.desde + 1 })
  })
})

describe('el pedido que se le manda al modelo', () => {
  it('lleva el contexto de los dos lados y pide sólo el reemplazo', () => {
    const pedido = pedidoDeEdicion({
      instruccion: 'que sume en vez de restar',
      seleccion: 'return a - b',
      antes: 'function sumar(a, b) {',
      despues: '}',
      rutaDelArchivo: 'src/sumar.ts'
    })
    expect(pedido).toContain('src/sumar.ts')
    expect(pedido).toContain('function sumar(a, b) {')
    expect(pedido).toContain('return a - b')
    expect(pedido).toContain('que sume en vez de restar')
    expect(pedido).toContain('SÓLO el fragmento reemplazado')
  })
})
