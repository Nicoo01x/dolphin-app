import { describe, expect, it } from 'vitest'
import { saltoDeTab } from './salto-de-tab'

/**
 * Lo que fija esto es sobre todo cuándo Tab NO tiene que saltar: con el cursor ya sobre un lugar
 * pendiente, saltar se lleva a la persona del lugar que está mirando y le hace perder la
 * sugerencia en gris que estaba a punto de aceptar.
 */

const RENOMBRE = { viejo: 'usuario', nuevo: 'cliente' }

// Tres apariciones de `usuario`, en 10, 37 y 64.
const ARCHIVO = [
  'const usuario = traer()', //  0: `usuario` en 6
  'console.log(usuario.nombre)', // 24: `usuario` en 36
  'return usuario' // 52: `usuario` en 59
].join('\n')

describe('a dónde lleva Tab', () => {
  it('lleva al primer lugar que está después del cursor', () => {
    expect(saltoDeTab(ARCHIVO, RENOMBRE, 0)).toEqual({ desde: 6, hasta: 13 })
    expect(saltoDeTab(ARCHIVO, RENOMBRE, 20)).toEqual({ desde: 36, hasta: 43 })
  })

  it('no salta cuando el cursor ya está sobre un lugar pendiente', () => {
    // Adentro del nombre.
    expect(saltoDeTab(ARCHIVO, RENOMBRE, 9)).toBeNull()
    // En el borde de arranque y en el de cierre: tipear ahí sigue siendo tocar ese nombre.
    expect(saltoDeTab(ARCHIVO, RENOMBRE, 6)).toBeNull()
    expect(saltoDeTab(ARCHIVO, RENOMBRE, 13)).toBeNull()
  })

  it('se da la vuelta: después del último lugar sigue el primero', () => {
    const texto = 'const usuario = 1\nreturn usuario\nlisto()'
    expect(saltoDeTab(texto, RENOMBRE, texto.length)).toEqual({ desde: 6, hasta: 13 })
  })

  it('pegado al último lugar acepta ahí, no da la vuelta', () => {
    // En este archivo el último `usuario` termina justo donde termina el archivo, así que el
    // cursor al final está TOCÁNDOLO. Que gane la sugerencia en gris es lo correcto: la persona
    // está parada sobre el lugar, y saltar al primero la haría pasar de largo el último.
    expect(saltoDeTab(ARCHIVO, RENOMBRE, ARCHIVO.length)).toBeNull()
  })

  it('no lleva a ninguna parte cuando ya no queda nada con el nombre viejo', () => {
    expect(saltoDeTab('const cliente = traer()', RENOMBRE, 0)).toBeNull()
  })

  it('no cuenta un nombre que es parte de otro más largo', () => {
    // `usuarioActivo` y `superusuario` contienen el nombre pero no son ese nombre.
    expect(saltoDeTab('const usuarioActivo = superusuario', RENOMBRE, 0)).toBeNull()
  })

  it('avanza lugar por lugar al apretarlo varias veces', () => {
    const recorrido: number[] = []
    let cursor = 0
    for (let vez = 0; vez < 3; vez += 1) {
      const sitio = saltoDeTab(ARCHIVO, RENOMBRE, cursor)
      if (!sitio) {
        break
      }
      recorrido.push(sitio.desde)
      // Después de saltar, el cursor queda sobre el nombre; aceptar lo saca de ahí, y acá se
      // modela eso poniéndolo justo después del lugar.
      cursor = sitio.hasta + 1
    }
    expect(recorrido).toEqual([6, 36, 59])
  })
})
