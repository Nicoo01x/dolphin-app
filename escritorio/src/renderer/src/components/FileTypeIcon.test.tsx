// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { FileTypeIcon } from './FileTypeIcon'

afterEach(cleanup)

it('draws the extension over the colour of its language', () => {
  const { container } = render(<FileTypeIcon filePath="src/app.ts" className="size-3.5" />)
  const svg = container.querySelector('svg')
  expect(svg?.getAttribute('class')).toBe('size-3.5')
  // Sin width ni height propios: el tamaño lo pone quien lo usa, que es cómo entra en las
  // siete listas que ya dibujaban este componente.
  expect(svg?.hasAttribute('width')).toBe(false)
  expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#3178C6')
  expect(container.querySelector('text')?.textContent).toBe('TS')
})

it('writes dark letters on a light badge', () => {
  const { container } = render(<FileTypeIcon filePath="a.js" />)
  expect(container.querySelector('text')?.getAttribute('fill')).toBe('#15181c')
})

it('keeps the old glyph for a file with no extension', () => {
  const { container } = render(<FileTypeIcon filePath="README" />)
  expect(container.querySelector('rect')).toBeNull()
  expect(container.querySelector('svg')).not.toBeNull()
})
