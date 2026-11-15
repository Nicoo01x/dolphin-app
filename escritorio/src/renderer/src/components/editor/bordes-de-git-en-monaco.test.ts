// El borde puesto sobre un editor: que pinte lo que corresponde, que NO pinte cuando no sabe, y
// que revertir use una edición (para que se pueda deshacer) y no un setValue.

import { describe, expect, it, vi } from 'vitest'
import { instalarBordeDeGit } from './bordes-de-git-en-monaco'

/** Un editor de mentira con lo justo que el borde usa. */
function editorFalso(texto: string) {
  let valor = texto
  const decoraciones: unknown[][] = []
  const ediciones: unknown[][] = []
  let alCambiar: (() => void) | null = null
  const editor = {
    getValue: () => valor,
    getModel: () => ({ getLineCount: () => valor.split('\n').length }),
    onDidChangeModelContent: (escuchar: () => void) => {
      alCambiar = escuchar
      return { dispose: () => void (alCambiar = null) }
    },
    createDecorationsCollection: (iniciales: unknown[]) => {
      decoraciones.push(iniciales)
      return {
        set: (nuevas: unknown[]) => void decoraciones.push(nuevas),
        clear: () => void decoraciones.push([])
      }
    },
    executeEdits: (_quien: string, edits: { text: string }[]) => {
      ediciones.push(edits)
      valor = edits[0]?.text ?? valor
      return true
    }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el borde sólo usa estos métodos, declarados en su propio tipo.
    editor: editor as never,
    /** El mismo objeto sin el casteo, para poder leerle el valor en las afirmaciones. */
    crudo: editor,
    decoraciones,
    ediciones,
    escribir: (nuevo: string) => {
      valor = nuevo
      alCambiar?.()
    },
    get ultimas() {
      return decoraciones.at(-1) ?? []
    }
  }
}

const BASE = 'uno\ndos\ntres\n'

describe('el borde de git sobre el editor', () => {
  it('pinta un pedazo por cambio', () => {
    const falso = editorFalso('uno\nDOS\ntres\n')
    instalarBordeDeGit({ editor: falso.editor, base: BASE, hayBase: true, esperaMs: 0 })
    expect(falso.ultimas).toHaveLength(1)
  })

  it('sin base no pinta NADA, en vez de marcar el archivo entero como agregado', () => {
    const falso = editorFalso('uno\ndos\ntres\n')
    instalarBordeDeGit({ editor: falso.editor, base: '', hayBase: false, esperaMs: 0 })
    expect(falso.ultimas).toEqual([])
  })

  it('un archivo igual a la base no pinta nada', () => {
    const falso = editorFalso(BASE)
    instalarBordeDeGit({ editor: falso.editor, base: BASE, hayBase: true, esperaMs: 0 })
    expect(falso.ultimas).toEqual([])
  })

  it('repinta cuando el texto cambia, después de la espera', async () => {
    vi.useFakeTimers()
    try {
      const falso = editorFalso(BASE)
      instalarBordeDeGit({ editor: falso.editor, base: BASE, hayBase: true, esperaMs: 50 })
      expect(falso.ultimas).toEqual([])
      falso.escribir('uno\nDOS\ntres\n')
      // Todavía no: la gracia de la espera es no diffear en cada tecla.
      expect(falso.ultimas).toEqual([])
      vi.advanceTimersByTime(50)
      expect(falso.ultimas).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('revertir usa una edición, así se puede deshacer', () => {
    const falso = editorFalso('uno\nDOS\ntres\n')
    const borde = instalarBordeDeGit({
      editor: falso.editor,
      base: BASE,
      hayBase: true,
      esperaMs: 0
    })
    const hunk = borde.hunkEn(2)
    expect(hunk).not.toBeNull()
    borde.revertir(hunk!)
    expect(falso.ediciones).toHaveLength(1)
    expect(falso.crudo.getValue()).toBe(BASE)
    // Y después de revertir ya no queda nada marcado.
    expect(falso.ultimas).toEqual([])
  })

  it('un archivo CRLF igual a una base LF no pinta nada, y revertir no lo pasa a LF', () => {
    // Lo que deja `core.autocrlf=true`: el modelo en CRLF, HEAD en LF, `git status` limpio.
    const falso = editorFalso('uno\r\nDOS\r\ntres\r\n')
    const borde = instalarBordeDeGit({
      editor: falso.editor,
      base: BASE,
      hayBase: true,
      esperaMs: 0
    })
    expect(falso.ultimas).toHaveLength(1)
    borde.revertir(borde.hunkEn(2)!)
    expect(falso.crudo.getValue()).toBe('uno\r\ndos\r\ntres\r\n')
    expect(falso.ultimas).toEqual([])
  })

  it('refrescar con una base nueva repinta contra ella', () => {
    const falso = editorFalso('uno\nDOS\ntres\n')
    const borde = instalarBordeDeGit({
      editor: falso.editor,
      base: BASE,
      hayBase: true,
      esperaMs: 0
    })
    expect(falso.ultimas).toHaveLength(1)
    // Es lo que pasa después de un `git add`: la base pasa a ser lo que hay en pantalla.
    borde.refrescar('uno\nDOS\ntres\n')
    expect(falso.ultimas).toEqual([])
  })

  it('al soltarlo deja de escuchar y limpia lo pintado', () => {
    vi.useFakeTimers()
    try {
      const falso = editorFalso(BASE)
      const borde = instalarBordeDeGit({
        editor: falso.editor,
        base: BASE,
        hayBase: true,
        esperaMs: 50
      })
      borde.dispose()
      falso.escribir('otra cosa\n')
      vi.advanceTimersByTime(100)
      expect(falso.ultimas).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
