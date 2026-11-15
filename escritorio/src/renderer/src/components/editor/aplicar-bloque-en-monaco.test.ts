import { describe, expect, it, vi } from 'vitest'
import { aplicarBloqueEnModelo, type ModeloDeTexto } from './aplicar-bloque-en-monaco'

/**
 * Aplicar un bloque del chat escribe en el archivo de la persona.
 *
 * Lo que fijan estas pruebas es sobre todo cuándo NO tiene que escribir, y que cuando escribe lo
 * haga por la vía deshacible del editor y no reemplazando el texto entero.
 */

const ARCHIVO = [
  'function uno() {',
  '  return 1',
  '}',
  '',
  'function dos() {',
  '  return 2',
  '}'
].join('\n')

function modeloFalso(texto: string) {
  const ediciones: { range: unknown; text: string }[] = []
  const lineas = texto.split('\n')
  const modelo: ModeloDeTexto = {
    getValue: () => texto,
    getPositionAt: (offset) => {
      let restante = offset
      for (const [indice, linea] of lineas.entries()) {
        if (restante <= linea.length) {
          return { lineNumber: indice + 1, column: restante + 1 }
        }
        restante -= linea.length + 1
      }
      return { lineNumber: lineas.length, column: (lineas.at(-1)?.length ?? 0) + 1 }
    },
    pushEditOperations: vi.fn((_s, operaciones) => {
      ediciones.push(...operaciones)
    })
  }
  return { modelo, ediciones }
}

describe('aplicar un bloque en el archivo abierto', () => {
  it('reemplaza exactamente el tramo que el bloque ocupa', () => {
    const { modelo, ediciones } = modeloFalso(ARCHIVO)
    const bloque = 'function dos() {\n  return 42\n}'
    expect(aplicarBloqueEnModelo(modelo, bloque).estado).toBe('aplicado')
    expect(ediciones).toHaveLength(1)
    // De la línea 5 columna 1 a la línea 7 columna 2: justo la función dos, ni una línea más.
    expect(ediciones[0]!.range).toEqual({
      startLineNumber: 5,
      startColumn: 1,
      endLineNumber: 7,
      endColumn: 2
    })
    expect(ediciones[0]!.text).toBe(bloque)
  })

  it('escribe por la vía deshacible del editor, no reemplazando todo', () => {
    const { modelo } = modeloFalso(ARCHIVO)
    aplicarBloqueEnModelo(modelo, '  return 2')
    expect(modelo.pushEditOperations).toHaveBeenCalledTimes(1)
  })

  it('no escribe nada cuando el bloque está en dos lugares', () => {
    const { modelo, ediciones } = modeloFalso('const a = 1\nconst a = 1\n')
    expect(aplicarBloqueEnModelo(modelo, 'const a = 1').estado).toBe('ambiguo')
    expect(ediciones).toHaveLength(0)
  })

  it('no escribe nada cuando el bloque no está en este archivo', () => {
    const { modelo, ediciones } = modeloFalso(ARCHIVO)
    expect(aplicarBloqueEnModelo(modelo, 'function tres() {\n  // ...\n}').estado).toBe(
      'no-encontrado'
    )
    expect(ediciones).toHaveLength(0)
  })

  it('un bloque vacío no se aplica', () => {
    const { modelo, ediciones } = modeloFalso(ARCHIVO)
    expect(aplicarBloqueEnModelo(modelo, '   ').estado).toBe('no-encontrado')
    expect(ediciones).toHaveLength(0)
  })
})
