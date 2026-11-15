// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_clave: string, texto: string, opciones?: Record<string, unknown>) =>
    texto.replace(/\{\{(\w+)\}\}/g, (_todo, nombre: string) => String(opciones?.[nombre] ?? ''))
}))

import type { Hunk } from './bordes-de-git'
import type { BordeDeGit } from './bordes-de-git-en-monaco'
import { firmaDelBordeDeGit } from './firma-del-borde-de-git'
import { instalarRevertirTrozo, lineaDelTrozo, trozoDesde } from './revertir-trozo-monaco'

const CAMBIADO: Hunk = { tipo: 'cambiado', desde: 3, hasta: 4, original: ['viejo()', 'otro()'] }
const BORRADO: Hunk = { tipo: 'borrado', desde: 10, hasta: 9, original: ['se fue'] }

describe('la firma del borde de git', () => {
  it('cambia cuando el agente commitea (HEAD) o hace git add (el área)', () => {
    const antes = firmaDelBordeDeGit(
      'abc',
      [{ path: 'src/a.ts', status: 'modified', area: 'unstaged' }],
      'src/a.ts'
    )
    const commit = firmaDelBordeDeGit('def', [], 'src/a.ts')
    const add = firmaDelBordeDeGit(
      'abc',
      [{ path: 'src/a.ts', status: 'modified', area: 'staged' }],
      'src/a.ts'
    )
    expect(new Set([antes, commit, add]).size).toBe(3)
    // Lo de otros archivos no la mueve.
    expect(
      firmaDelBordeDeGit(
        'abc',
        [{ path: 'src/b.ts', status: 'modified', area: 'unstaged' }],
        'src/a.ts'
      )
    ).toBe(firmaDelBordeDeGit('abc', [], 'src/a.ts'))
  })
})

describe('qué trozo abre el teclado', () => {
  it('el de la línea, si no el próximo, y al final vuelve al primero', () => {
    expect(trozoDesde([CAMBIADO, BORRADO], CAMBIADO, 3)).toBe(CAMBIADO)
    expect(trozoDesde([CAMBIADO, BORRADO], null, 5)).toBe(BORRADO)
    expect(trozoDesde([CAMBIADO, BORRADO], null, 20)).toBe(CAMBIADO)
    expect(trozoDesde([], null, 1)).toBeNull()
    expect(lineaDelTrozo(BORRADO)).toBe(9)
  })
})

function montar() {
  let alClic: (evento: unknown) => void = () => {}
  let accion: { run: () => void; keybindings?: number[] } | null = null
  const widgets: { getDomNode: () => HTMLElement }[] = []
  const editor = {
    onMouseDown: (escuchar: (evento: unknown) => void) => {
      alClic = escuchar
      return { dispose: () => {} }
    },
    onDidChangeModelContent: () => ({ dispose: () => {} }),
    addAction: (a: { run: () => void; keybindings?: number[] }) => {
      accion = a
      return { dispose: () => {} }
    },
    addContentWidget: (w: { getDomNode: () => HTMLElement }) => widgets.push(w),
    removeContentWidget: (w: { getDomNode: () => HTMLElement }) =>
      widgets.splice(widgets.indexOf(w), 1),
    layoutContentWidget: () => {},
    focus: vi.fn(),
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    revealLineInCenterIfOutsideViewport: vi.fn()
  }
  const borde: BordeDeGit = {
    refrescar: () => {},
    hunkEn: (linea) => (linea >= 3 && linea <= 4 ? CAMBIADO : null),
    hunks: () => [CAMBIADO],
    revertir: vi.fn(),
    dispose: () => {}
  }
  const monaco = {
    KeyMod: { Alt: 512 },
    KeyCode: { F5: 63 },
    editor: {
      MouseTargetType: { GUTTER_LINE_DECORATIONS: 4 },
      ContentWidgetPositionPreference: { ABOVE: 1, BELOW: 2 }
    }
  }
  instalarRevertirTrozo({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el flotante usa.
    monaco: monaco as unknown as Parameters<typeof instalarRevertirTrozo>[0]['monaco'],
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el flotante usa.
    editor: editor as unknown as Parameters<typeof instalarRevertirTrozo>[0]['editor'],
    borde
  })
  // Una fila del margen como la arma Monaco: las decoraciones del carril son hermanas.
  const fila = document.createElement('div')
  const rayita = document.createElement('div')
  rayita.className = 'cldr borde-git-cambiado'
  rayita.getBoundingClientRect = () => DOMRect.fromRect({ x: 325, y: 0, width: 3, height: 19 })
  const plegado = document.createElement('div')
  plegado.className = 'cldr codicon codicon-folding-expanded'
  fila.append(rayita, plegado)
  const clicEn = (elemento: Element, linea: number, x = 326) =>
    alClic({
      target: { type: 4, element: elemento, position: { lineNumber: linea, column: 1 } },
      event: { browserEvent: { clientX: x } }
    })
  const clicEnLaRayita = (linea: number) => clicEn(rayita, linea)
  return {
    widgets,
    borde,
    editor,
    clicEn,
    plegado,
    clicEnLaRayita,
    accion: () => accion,
    alClic: (e: unknown) => alClic(e)
  }
}

describe('revertir un trozo desde la rayita', () => {
  it('el clic en la rayita muestra lo que decía git y el botón revierte ese trozo', () => {
    const m = montar()
    m.clicEnLaRayita(3)
    expect(m.widgets).toHaveLength(1)
    const nodo = m.widgets[0].getDomNode()
    expect(nodo.getAttribute('role')).toBe('dialog')
    expect(nodo.querySelector('pre')?.textContent).toBe('viejo()\notro()')
    const boton = nodo.querySelector('button')
    expect(boton?.getAttribute('aria-label')).toBe('Revert the change at line 3')
    boton?.click()
    expect(m.borde.revertir).toHaveBeenCalledWith(CAMBIADO)
    expect(m.widgets).toHaveLength(0)
  })

  it('Escape lo cierra sin revertir y devuelve el foco al editor', () => {
    const m = montar()
    m.clicEnLaRayita(4)
    m.widgets[0]
      .getDomNode()
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(m.widgets).toHaveLength(0)
    expect(m.borde.revertir).not.toHaveBeenCalled()
    expect(m.editor.focus).toHaveBeenCalled()
  })

  it('con el ícono de plegado encima, el clic sobre la rayita igual la abre', () => {
    // El bug: el clic le llegaba a otra decoración del carril y se descartaba.
    const m = montar()
    m.clicEn(m.plegado, 3, 326)
    expect(m.widgets).toHaveLength(1)
  })

  it('un clic en el ícono de plegado, lejos de la rayita, no la abre (pliega, como siempre)', () => {
    const m = montar()
    m.clicEn(m.plegado, 3, 340)
    expect(m.widgets).toHaveLength(0)
  })

  it('la guía de sangría es sólo dibujo: no le saca el clic a la rayita', () => {
    const hoja = readFileSync(join(__dirname, 'tema-dolphin.css'), 'utf8')
    expect(hoja).toMatch(/\.monaco-editor \.dolphin-sangria \{\s*pointer-events: none;/)
  })

  it('un clic en el texto no lo abre, y Alt+F5 sí', () => {
    const m = montar()
    m.alClic({ target: { type: 6, element: null, position: { lineNumber: 3, column: 2 } } })
    expect(m.widgets).toHaveLength(0)
    expect(m.accion()?.keybindings).toEqual([512 | 63])
    m.accion()?.run()
    expect(m.widgets).toHaveLength(1)
  })
})
