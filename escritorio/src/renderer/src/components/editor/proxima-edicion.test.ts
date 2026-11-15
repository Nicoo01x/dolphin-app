import { describe, expect, it } from 'vitest'
import {
  proximasEdiciones,
  renombreDelCambio,
  sitiosDelNombre,
  type CambioDeTexto
} from './proxima-edicion'

/**
 * El Tab predictivo no puede equivocarse al proponer.
 *
 * Una sugerencia de más no es gratis: la persona aprieta Tab sin leer —para eso está Tab— y el
 * cambio entra. Por eso estas pruebas insisten sobre todo en lo que NO tiene que reconocerse como
 * renombre: un tramo que es parte de una palabra, un número, un pedazo con espacios.
 */

const cambio = (desde: number, quitado: string, puesto: string): CambioDeTexto => ({
  desde,
  quitado,
  puesto
})

describe('reconocer el renombre que la persona acaba de hacer', () => {
  it('cambiar un nombre entero por otro es un renombre', () => {
    const previo = 'const usuario = 1'
    expect(renombreDelCambio(cambio(6, 'usuario', 'cliente'), previo)).toEqual({
      viejo: 'usuario',
      nuevo: 'cliente'
    })
  })

  // Lo que más barato se rompe: borrar letras en el medio de una palabra.
  it('cambiar un pedazo adentro de una palabra no lo es', () => {
    const previo = 'const usuario = 1'
    expect(renombreDelCambio(cambio(6, 'usu', 'cli'), previo)).toBeNull()
    expect(renombreDelCambio(cambio(9, 'ario', 'ante'), previo)).toBeNull()
  })

  it('un tramo con espacios o signos no es un nombre', () => {
    const previo = 'const a = b + c'
    expect(renombreDelCambio(cambio(10, 'b + c', 'd'), previo)).toBeNull()
    expect(renombreDelCambio(cambio(10, 'b', 'd + e'), previo)).toBeNull()
  })

  it('un número no es un nombre', () => {
    const previo = 'const a = 2'
    expect(renombreDelCambio(cambio(10, '2', 'x'), previo)).toBeNull()
    expect(renombreDelCambio(cambio(6, 'a', '2a'), previo)).toBeNull()
  })

  it('escribir el mismo nombre no es un renombre', () => {
    expect(renombreDelCambio(cambio(6, 'a', 'a'), 'const a = 1')).toBeNull()
  })

  it('acepta los signos que llevan los nombres de verdad', () => {
    expect(renombreDelCambio(cambio(0, '_x', '$y2'), '_x = 1')).toEqual({
      viejo: '_x',
      nuevo: '$y2'
    })
  })
})

describe('dónde más aparece el nombre viejo', () => {
  const texto = 'const usuario = 1\nver(usuario)\nconst usuarios = []\nmiUsuario(usuario)'

  it('encuentra el nombre entero y nada más', () => {
    const sitios = sitiosDelNombre(texto, 'usuario')
    expect(sitios.map((s) => texto.slice(s.desde, s.hasta))).toEqual([
      'usuario',
      'usuario',
      'usuario'
    ])
    // `usuarios` y `miUsuario` tienen el nombre adentro y no cuentan.
    expect(sitios).toHaveLength(3)
  })

  it('puede dejar afuera el lugar que la persona ya tocó', () => {
    const sitios = sitiosDelNombre(texto, 'usuario', { desde: 6, hasta: 13 })
    expect(sitios).toHaveLength(2)
    expect(sitios[0]!.desde).toBeGreaterThan(13)
  })

  it('un nombre que no es nombre no devuelve nada', () => {
    expect(sitiosDelNombre(texto, 'a b')).toEqual([])
    expect(sitiosDelNombre(texto, '')).toEqual([])
  })
})

describe('el orden en que Tab recorre los lugares', () => {
  const texto = 'uno(x)\ndos(x)\ntres(x)'

  it('va hacia abajo desde el cursor y después se da la vuelta', () => {
    const cursorEnElSegundo = texto.indexOf('dos')
    const orden = proximasEdiciones(texto, { viejo: 'x', nuevo: 'y' }, cursorEnElSegundo)
    expect(orden.map((s) => s.desde)).toEqual([
      texto.indexOf('x', cursorEnElSegundo),
      texto.lastIndexOf('x'),
      texto.indexOf('x')
    ])
  })

  it('sin lugares pendientes no ofrece nada', () => {
    expect(proximasEdiciones('nada que ver', { viejo: 'x', nuevo: 'y' }, 0)).toEqual([])
  })
})
