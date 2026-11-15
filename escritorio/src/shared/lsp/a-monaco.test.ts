// La traducción entre LSP y Monaco. El caso que hay que fijar sí o sí: LSP cuenta desde 0 y Monaco
// desde 1, y «corrido uno» se ve casi bien, así que no se nota mirando.

import { describe, expect, it } from 'vitest'
import {
  claseDeCompletadoAMonaco,
  diagnosticoAMarca,
  hoverAMarkdown,
  posicionDesdeMonaco,
  rangoAMonaco,
  rutaDeUri,
  severidadAMonaco,
  uriDeArchivo
} from './a-monaco'

describe('de LSP a Monaco', () => {
  it('suma uno a la línea y a la columna, en las dos puntas del rango', () => {
    expect(
      rangoAMonaco({ start: { line: 0, character: 0 }, end: { line: 2, character: 5 } })
    ).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 6
    })
  })

  it('y le resta uno al volver', () => {
    expect(posicionDesdeMonaco({ lineNumber: 1, column: 1 })).toEqual({ line: 0, character: 0 })
    expect(posicionDesdeMonaco({ lineNumber: 12, column: 4 })).toEqual({ line: 11, character: 3 })
  })

  it('traduce la severidad, que no comparte ni orden ni escala', () => {
    expect(severidadAMonaco(1)).toBe(8)
    expect(severidadAMonaco(2)).toBe(4)
    expect(severidadAMonaco(3)).toBe(2)
    expect(severidadAMonaco(4)).toBe(1)
    // Sin severidad es un error, que es lo que dice la especificación, y no una pista.
    expect(severidadAMonaco(undefined)).toBe(8)
  })

  it('arma la marca de un diagnóstico con su fuente y su código', () => {
    expect(
      diagnosticoAMarca({
        range: { start: { line: 4, character: 2 }, end: { line: 4, character: 9 } },
        message: 'no existe',
        severity: 1,
        source: 'ts',
        code: 2304
      })
    ).toEqual({
      startLineNumber: 5,
      startColumn: 3,
      endLineNumber: 5,
      endColumn: 10,
      message: 'no existe',
      severity: 8,
      source: 'ts',
      code: '2304'
    })
  })

  it('lee un hover en cualquiera de sus formas', () => {
    expect(hoverAMarkdown('texto suelto')).toBe('texto suelto')
    expect(hoverAMarkdown({ kind: 'markdown', value: '**negrita**' })).toBe('**negrita**')
    // Lo marcado como código viene con su lenguaje aparte y sale como bloque de markdown.
    expect(hoverAMarkdown({ language: 'ts', value: 'const a: number' })).toBe(
      '```ts\nconst a: number\n```'
    )
    expect(hoverAMarkdown([{ language: 'ts', value: 'const a' }, 'y una nota'])).toBe(
      '```ts\nconst a\n```\n\ny una nota'
    )
    expect(hoverAMarkdown(null)).toBe('')
  })

  it('las clases de completado se aparean por nombre y no por número', () => {
    // Method es 2 en LSP y 0 en Monaco; File es 17 en LSP y 20 en Monaco.
    expect(claseDeCompletadoAMonaco(2)).toBe(0)
    expect(claseDeCompletadoAMonaco(17)).toBe(20)
    expect(claseDeCompletadoAMonaco(undefined)).toBe(9)
    expect(claseDeCompletadoAMonaco(999)).toBe(9)
  })

  it('el uri de un archivo va y vuelve, en Windows y en posix', () => {
    expect(rutaDeUri(uriDeArchivo('C:/Proyectos/mi app/index.ts'))).toBe(
      'C:/Proyectos/mi app/index.ts'
    )
    expect(rutaDeUri(uriDeArchivo('C:\\Proyectos\\mi app\\index.ts'))).toBe(
      'C:/Proyectos/mi app/index.ts'
    )
    expect(rutaDeUri(uriDeArchivo('/home/nico/proyecto/index.ts'))).toBe(
      '/home/nico/proyecto/index.ts'
    )
    // Un `#` sin escapar cortaría el URI y la ruta volvería a la mitad.
    expect(rutaDeUri(uriDeArchivo('/tmp/a#b/c.ts'))).toBe('/tmp/a#b/c.ts')
  })
})
