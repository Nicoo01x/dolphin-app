import { describe, expect, it } from 'vitest'
import {
  ajustesParaElArchivo,
  elGlobAgarra,
  opcionesDeMonaco,
  parsearEditorconfig
} from './editorconfig'

/**
 * Lo que decide la sangría con la que abre un archivo.
 *
 * Lo que más importa probar acá no es el caso feliz: es la precedencia (quién le gana a quién) y
 * la tolerancia, porque un `.editorconfig` mal escrito es más común que uno ausente y perder la
 * sangría de un repo entero por una línea de más sería peor que no leer el archivo.
 */

const parsear = parsearEditorconfig

describe('parsear', () => {
  it('lee root, secciones y propiedades', () => {
    const a = parsear(`root = true

[*]
indent_style = space
indent_size = 2

[*.go]
indent_style = tab
`)
    expect(a.root).toBe(true)
    expect(a.secciones).toHaveLength(2)
    expect(a.secciones[0]?.propiedades.indent_size).toBe('2')
    expect(a.secciones[1]?.glob).toBe('*.go')
  })

  it('ignora comentarios, con # y con ;', () => {
    const a = parsear('# un comentario\n; otro\n[*]\nindent_size = 4\n')
    expect(a.secciones[0]?.propiedades.indent_size).toBe('4')
  })

  it('una línea rota no tira el archivo', () => {
    const a = parsear(
      '[*]\nindent_size = 2\nesto no tiene igual\n= sin clave\nindent_style = tab\n'
    )
    expect(a.secciones[0]?.propiedades).toEqual({ indent_size: '2', indent_style: 'tab' })
  })

  it('las claves no distinguen mayúsculas', () => {
    expect(parsear('[*]\nIndent_Size = 8\n').secciones[0]?.propiedades.indent_size).toBe('8')
  })

  it('un `root` adentro de una sección no es el root del archivo', () => {
    expect(parsear('[*]\nroot = true\n').root).toBe(false)
  })
})

describe('globs', () => {
  it('un glob sin barra agarra en cualquier carpeta', () => {
    expect(elGlobAgarra('*.ts', 'a.ts')).toBe(true)
    expect(elGlobAgarra('*.ts', 'src/motor/a.ts')).toBe(true)
  })

  it('un glob con barra se ancla', () => {
    expect(elGlobAgarra('src/*.ts', 'src/a.ts')).toBe(true)
    expect(elGlobAgarra('src/*.ts', 'otro/src/a.ts')).toBe(false)
  })

  it('`*` no cruza carpetas y `**` sí', () => {
    expect(elGlobAgarra('src/*.ts', 'src/hondo/a.ts')).toBe(false)
    expect(elGlobAgarra('src/**/*.ts', 'src/hondo/mas/a.ts')).toBe(true)
  })

  it('`**/` también agarra cero carpetas', () => {
    expect(elGlobAgarra('**/a.ts', 'a.ts')).toBe(true)
  })

  it('llaves y corchetes', () => {
    expect(elGlobAgarra('*.{ts,tsx}', 'a.tsx')).toBe(true)
    expect(elGlobAgarra('*.{ts,tsx}', 'a.js')).toBe(false)
    expect(elGlobAgarra('*.[ch]', 'a.c')).toBe(true)
    expect(elGlobAgarra('*.[!ch]', 'a.c')).toBe(false)
    expect(elGlobAgarra('*.[!ch]', 'a.d')).toBe(true)
  })

  it('el punto es un punto, no «cualquier carácter»', () => {
    expect(elGlobAgarra('*.ts', 'axts')).toBe(false)
  })

  it('un glob que no compila no rompe nada', () => {
    expect(elGlobAgarra('[', 'a.ts')).toBe(false)
  })
})

describe('precedencia', () => {
  const lejano = parsear('[*]\nindent_style = space\nindent_size = 4\n')
  const cercano = parsear('[*]\nindent_size = 2\n')

  it('el archivo más cercano le gana al más lejano, propiedad por propiedad', () => {
    const r = ajustesParaElArchivo([
      { contenido: lejano, rutaRelativa: 'src/a.ts' },
      { contenido: cercano, rutaRelativa: 'a.ts' }
    ])
    // El tamaño lo pisó el cercano; el estilo, que el cercano no declara, sobrevive.
    expect(r.tamanoDeSangria).toBe(2)
    expect(r.estiloDeSangria).toBe('space')
  })

  it('adentro de un archivo, la última sección que agarra es la que vale', () => {
    const a = parsear('[*]\nindent_size = 2\n\n[*.md]\nindent_size = 4\n')
    expect(ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'leeme.md' }]).tamanoDeSangria).toBe(
      4
    )
    expect(ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.ts' }]).tamanoDeSangria).toBe(2)
  })

  it('una sección que no agarra no aporta nada', () => {
    const a = parsear('[*.go]\nindent_style = tab\n')
    expect(ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.ts' }])).toEqual({})
  })
})

describe('valores', () => {
  it('`indent_size = tab` vale lo que diga tab_width', () => {
    const a = parsear('[*]\nindent_style = tab\nindent_size = tab\ntab_width = 8\n')
    const r = ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.go' }])
    expect(r.tamanoDeSangria).toBe(8)
    expect(r.anchoDeTab).toBe(8)
  })

  it('`max_line_length = off` quiere decir sin regla, no cero', () => {
    const a = parsear('[*]\nmax_line_length = off\n')
    expect(
      ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.ts' }]).largoMaximo
    ).toBeUndefined()
    const b = parsear('[*]\nmax_line_length = 100\n')
    expect(ajustesParaElArchivo([{ contenido: b, rutaRelativa: 'a.ts' }]).largoMaximo).toBe(100)
  })

  it('los booleanos aceptan lo que el estándar acepta', () => {
    const a = parsear('[*]\ninsert_final_newline = true\ntrim_trailing_whitespace = off\n')
    const r = ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.ts' }])
    expect(r.lineaFinal).toBe(true)
    expect(r.sinEspaciosAlFinal).toBe(false)
  })

  it('un número imposible se ignora en vez de romper el editor', () => {
    const a = parsear('[*]\nindent_size = cualquiera\ntab_width = -3\n')
    expect(ajustesParaElArchivo([{ contenido: a, rutaRelativa: 'a.ts' }])).toEqual({})
  })
})

describe('lo que entiende Monaco', () => {
  it('traduce lo que hay y calla lo que no', () => {
    expect(opcionesDeMonaco({ estiloDeSangria: 'tab', anchoDeTab: 4 })).toEqual({
      tabSize: 4,
      insertSpaces: false
    })
    // Sin nada declarado no se inventa un default: eso lo decide el editor.
    expect(opcionesDeMonaco({})).toEqual({})
  })

  it('el tamaño de sangría le gana al ancho del tab', () => {
    expect(opcionesDeMonaco({ tamanoDeSangria: 2, anchoDeTab: 8 }).tabSize).toBe(2)
  })

  it('el largo máximo se dibuja como regla', () => {
    expect(opcionesDeMonaco({ largoMaximo: 100 }).rulers).toEqual([100])
  })
})
