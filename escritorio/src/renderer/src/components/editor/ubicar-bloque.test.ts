import { describe, expect, it } from 'vitest'
import { bloqueTieneElisiones, esElision, ubicarBloque } from './ubicar-bloque'

/**
 * Ubicar mal un bloque es peor que no ubicarlo.
 *
 * La persona aprieta un botón que dice «Aplicar». Si esto se equivoca de lugar, le queda el
 * archivo roto en otro lado y sin aviso. Por eso la mitad de estas pruebas son casos donde lo
 * correcto es NO ubicar: devolver `ambiguo` o `null` y que decida otro.
 */

const archivo = [
  'function uno() {',
  '  return 1',
  '}',
  '',
  'function dos() {',
  '  return 2',
  '}',
  ''
].join('\n')

describe('reconocer las marcas de «acá sigue igual»', () => {
  it.each(['...', '// ...', '  # ...', '/* ... */', ' * ...', '  ....'])(
    '%s es elisión',
    (linea) => {
      expect(esElision(linea)).toBe(true)
    }
  )

  it.each(['const a = 1', '', 'a.b.c', 'spread(...args)'])('%s no lo es', (linea) => {
    expect(esElision(linea)).toBe(false)
  })

  it('avisa cuando el bloque las trae', () => {
    expect(bloqueTieneElisiones('a\n// ...\nb')).toBe(true)
    expect(bloqueTieneElisiones('a\nb')).toBe(false)
  })
})

describe('ubicar el bloque', () => {
  it('el bloque entero ya está: reemplaza eso', () => {
    const bloque = 'function dos() {\n  return 2\n}'
    const donde = ubicarBloque(archivo, bloque)
    expect(donde).not.toBeNull()
    expect(typeof donde).not.toBe('string')
    const tramo = donde as { desde: number; hasta: number }
    expect(archivo.slice(tramo.desde, tramo.hasta)).toBe(bloque)
  })

  // Lo que resuelve el caso real: el agente manda las puntas y elide el medio.
  it('con elisión en el medio, ancla en la primera y la última línea', () => {
    const bloque = 'function dos() {\n  // ...\n}'
    const tramo = ubicarBloque(archivo, bloque) as { desde: number; hasta: number }
    expect(archivo.slice(tramo.desde, tramo.hasta)).toBe('function dos() {\n  return 2\n}')
  })

  it('la sangría distinta no lo despista', () => {
    const bloque = '    function dos() {\n        // ...\n    }'
    const tramo = ubicarBloque(archivo, bloque) as { desde: number; hasta: number }
    expect(archivo.slice(tramo.desde, tramo.hasta)).toBe('function dos() {\n  return 2\n}')
  })

  it('una sola línea que aparece una vez', () => {
    const tramo = ubicarBloque(archivo, '  return 2') as { desde: number; hasta: number }
    expect(archivo.slice(tramo.desde, tramo.hasta)).toBe('  return 2')
  })

  describe('cuando no se puede ubicar sin dudas', () => {
    it('un ancla que aparece dos veces es ambiguo', () => {
      const repetido = 'if (a) {\n  x()\n}\nif (a) {\n  y()\n}\n'
      expect(ubicarBloque(repetido, 'if (a) {\n  // ...\n}')).toBe('ambiguo')
    })

    it('un ancla que no está en el archivo no se ubica', () => {
      expect(ubicarBloque(archivo, 'function tres() {\n  // ...\n}')).toBeNull()
    })

    it('un arranque repetido es ambiguo aunque el cierre no lo sea', () => {
      expect(ubicarBloque(archivo, '}\n// ...\nfunction uno() {')).toBe('ambiguo')
    })

    // El cierre se busca para abajo: si el arranque es la última línea, no hay dónde cerrar.
    it('sin cierre por debajo del arranque no se ubica', () => {
      expect(ubicarBloque(archivo, 'function dos() {\n// ...\nfunction uno() {')).toBe('ambiguo')
    })

    it('un bloque que es sólo elisiones o espacios no se ubica', () => {
      expect(ubicarBloque(archivo, '// ...')).toBeNull()
      expect(ubicarBloque(archivo, '   \n\n')).toBeNull()
    })

    it('un bloque entero repetido en el archivo es ambiguo', () => {
      const dosVeces = 'const a = 1\nconst a = 1\n'
      expect(ubicarBloque(dosVeces, 'const a = 1')).toBe('ambiguo')
    })
  })
})
