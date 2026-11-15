// Un reemplazo en todo el proyecto toca cientos de archivos de una sola vez, así que cada caso de
// acá es una forma concreta de arruinar un repo: un `$` que se come plata, un `.` que matchea
// cualquier letra, un `^` que no encuentra nada, una palabra que aparece adentro de otra.

import { describe, expect, it } from 'vitest'
import {
  ConsultaInvalida,
  comoLiteral,
  expandirReemplazo,
  expresionDe,
  reemplazarEnTexto
} from './reemplazo-en-el-proyecto'

describe('reemplazar en el proyecto', () => {
  it('sin regex, el punto es un punto y no cualquier letra', () => {
    const { texto, cuantos } = reemplazarEnTexto('a.b axb', {
      consulta: 'a.b',
      reemplazo: 'X'
    })
    expect(texto).toBe('X axb')
    expect(cuantos).toBe(1)
  })

  it('sin regex, el reemplazo es literal: un $5 queda $5 y no un grupo', () => {
    const { texto } = reemplazarEnTexto('precio: viejo', {
      consulta: 'viejo',
      reemplazo: '$5 y $& y $$'
    })
    expect(texto).toBe('precio: $5 y $& y $$')
  })

  it('con regex, $1 y $& traen lo que matcheó', () => {
    const { texto, cuantos } = reemplazarEnTexto('getUser(); getRole();', {
      consulta: 'get(\\w+)\\(\\)',
      reemplazo: 'leer$1() /* $& */',
      conRegex: true
    })
    expect(texto).toBe('leerUser() /* getUser() */; leerRole() /* getRole() */;')
    expect(cuantos).toBe(2)
  })

  it('con regex, $$ es un peso y un grupo que no existe se deja tal cual', () => {
    const { texto } = reemplazarEnTexto('total', {
      consulta: '(tot)al',
      reemplazo: '$$9 $1 $7',
      conRegex: true
    })
    expect(texto).toBe('$9 tot $7')
  })

  it('por defecto no distingue mayúsculas, y se puede pedir que sí', () => {
    expect(
      reemplazarEnTexto('Color color COLOR', { consulta: 'color', reemplazo: 'x' }).cuantos
    ).toBe(3)
    expect(
      reemplazarEnTexto('Color color COLOR', {
        consulta: 'color',
        reemplazo: 'x',
        distingueMayusculas: true
      }).cuantos
    ).toBe(1)
  })

  it('palabra entera no toca la palabra que está adentro de otra', () => {
    const { texto, cuantos } = reemplazarEnTexto('id, idioma, el id', {
      consulta: 'id',
      reemplazo: 'clave',
      palabraEntera: true
    })
    expect(texto).toBe('clave, idioma, el clave')
    expect(cuantos).toBe(2)
  })

  it('palabra entera con alternativas ata las DOS, no la primera y la última', () => {
    const { texto } = reemplazarEnTexto('foo bar foobar', {
      consulta: 'foo|bar',
      reemplazo: 'X',
      conRegex: true,
      palabraEntera: true
    })
    expect(texto).toBe('X X foobar')
  })

  it('^ y $ son principio y fin de LÍNEA, como en cualquier buscador', () => {
    const { texto, cuantos } = reemplazarEnTexto('uno\ndos\ntres', {
      consulta: '^dos$',
      reemplazo: 'DOS',
      conRegex: true
    })
    expect(texto).toBe('uno\nDOS\ntres')
    expect(cuantos).toBe(1)
  })

  it('reemplaza todas las veces de una línea, no sólo la primera', () => {
    expect(reemplazarEnTexto('a a a', { consulta: 'a', reemplazo: 'b' }).texto).toBe('b b b')
  })

  it('distingue «no encontró» de «encontró y quedó igual»', () => {
    expect(reemplazarEnTexto('color', { consulta: 'color', reemplazo: 'color' })).toEqual({
      texto: 'color',
      cuantos: 1
    })
    expect(reemplazarEnTexto('color', { consulta: 'tinta', reemplazo: 'x' })).toEqual({
      texto: 'color',
      cuantos: 0
    })
  })

  it('una regex rota se dice, no revienta', () => {
    expect(() => expresionDe({ consulta: '(sin cerrar', reemplazo: '', conRegex: true })).toThrow(
      ConsultaInvalida
    )
  })

  it('una consulta vacía no reemplaza el archivo entero por nada', () => {
    expect(() => expresionDe({ consulta: '', reemplazo: 'x' })).toThrow(ConsultaInvalida)
  })

  it('comoLiteral escapa lo que el motor de regex trata distinto', () => {
    expect(comoLiteral('a.b*c[d]')).toBe('a\\.b\\*c\\[d\\]')
    expect(new RegExp(comoLiteral('precio: $1 (neto)')).test('precio: $1 (neto)')).toBe(true)
  })

  it('expandirReemplazo deja el texto intacto cuando no hay regex', () => {
    expect(expandirReemplazo('$1 $& $$', ['loquesea', 0, 'texto'], false)).toBe('$1 $& $$')
  })
})
