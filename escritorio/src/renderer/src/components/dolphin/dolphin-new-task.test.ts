import { describe, expect, it } from 'vitest'
import { textoDeNuevaTareaDolphin } from './dolphin-new-task'

describe('textoDeNuevaTareaDolphin', () => {
  it('incluye título, cuerpo recortado y enlace al final', () => {
    const body = 'x'.repeat(4_100)
    const text = textoDeNuevaTareaDolphin('Título', body, 'https://example.test/issue/1')

    expect(text).toBe(`Título\n\n${'x'.repeat(4_000)}\n\nhttps://example.test/issue/1`)
  })
})
