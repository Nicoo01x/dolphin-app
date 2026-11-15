import { describe, expect, it } from 'vitest'
import { remarkDolphinReferencias } from './remark-referencias'

/** Un árbol de mdast mínimo con un párrafo de texto, que es lo que llega del chat. */
const parrafo = (texto: string) => ({
  type: 'root',
  children: [{ type: 'paragraph', children: [{ type: 'text', value: texto }] }]
})

/** Lo que quedó: los nodos del párrafo, como `tipo(valor)`. */
function partes(arbol: ReturnType<typeof parrafo>): string[] {
  const hijos = (arbol.children[0] as { children?: unknown[] }).children ?? []
  return hijos.map((hijo) => {
    const n = hijo as {
      type: string
      value?: string
      children?: { value?: string }[]
      data?: { hProperties?: Record<string, string> }
    }
    if (n.type === 'text') {
      return `texto(${n.value})`
    }
    const p = n.data?.hProperties ?? {}
    return `${p.dataRef}:${p.dataRefId}(${n.children?.[0]?.value})`
  })
}

const correr = (texto: string, ramas?: readonly string[]) => {
  const arbol = parrafo(texto)
  remarkDolphinReferencias(ramas ? { ramas } : {})()(arbol)
  return partes(arbol)
}

describe('el plugin de referencias del chat', () => {
  it('parte el párrafo y deja el texto de alrededor intacto', () => {
    expect(correr('cerrá el #412 antes de mergear')).toEqual([
      'texto(cerrá el )',
      'issue:412(#412)',
      'texto( antes de mergear)'
    ])
  })

  it('un párrafo sin referencias queda tal cual, en un solo nodo', () => {
    expect(correr('esto no nombra nada')).toEqual(['texto(esto no nombra nada)'])
  })

  it('el rótulo del commit sale cortado pero el id queda entero', () => {
    const [, commit] = correr('rompió en 9f2c1e7aa11bb22')
    expect(commit).toBe('commit:9f2c1e7aa11bb22(9f2c1e7)')
  })

  it('no toca lo que está adentro de código ni de un enlace', () => {
    const arbol = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'inlineCode', value: 'el #412 de acá no' },
            { type: 'link', children: [{ type: 'text', value: 'ni el #9 de acá' }] }
          ]
        }
      ]
    }
    remarkDolphinReferencias()()(arbol)
    const hijos = (arbol.children[0] as { children: { type: string }[] }).children
    expect(hijos.map((h) => h.type)).toEqual(['inlineCode', 'link'])
  })

  it('varias referencias en una línea salen todas', () => {
    // El rótulo del PR es `#11` y no `PR #11`: la pastilla muestra el número, y el texto completo
    // queda en `data-ref-texto` para el title y la tarjeta.
    expect(correr('el #10, el PR #11 y dolphin/4e2/u1')).toEqual([
      'texto(el )',
      'issue:10(#10)',
      'texto(, el )',
      'pr:11(#11)',
      'texto( y )',
      'rama:dolphin/4e2/u1(dolphin/4e2/u1)'
    ])
  })
})
