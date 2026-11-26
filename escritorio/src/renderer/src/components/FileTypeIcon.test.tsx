// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { FileTypeIcon } from './FileTypeIcon'
import { logoDeArchivo } from '@/lib/file-icons/material-file-icons'

afterEach(cleanup)

it('draws the real logo of the language, sized by whoever uses it', () => {
  const { container } = render(<FileTypeIcon filePath="src/app.ts" className="size-3.5" />)
  const icono = container.querySelector('[data-logo-archivo]')
  expect(icono?.getAttribute('data-logo-archivo')).toBe('typescript')
  // Sin tamaño propio: el tamaño lo pone quien lo usa, que es cómo entra en las listas.
  expect(icono?.getAttribute('class')).toBe('size-3.5')
  expect(icono?.getAttribute('aria-hidden')).toBe('true')
})

it('installs one stylesheet rule per logo, once', () => {
  render(<FileTypeIcon filePath="a.cs" />)
  render(<FileTypeIcon filePath="b.cpp" />)
  const hojas = document.querySelectorAll('#dolphin-logos-de-archivo')
  expect(hojas).toHaveLength(1)
  expect(hojas[0]?.textContent).toContain('[data-logo-archivo="csharp"]')
})

it('knows the languages of a C# and C++ shop', () => {
  expect(logoDeArchivo('Forms/frmSplash.cs')?.oscuro).toBe('csharp')
  expect(logoDeArchivo('src\\motor.cpp')?.oscuro).toBe('cpp')
  expect(logoDeArchivo('motor.h')?.oscuro).toBe('h')
  expect(logoDeArchivo('ERP.csproj')?.oscuro).toBe('visualstudio')
  expect(logoDeArchivo('Contoso.ERP.sln')?.oscuro).toBe('visualstudio')
  expect(logoDeArchivo('Vista.xaml')?.oscuro).toBe('xaml')
})

it('prefers the exact file name and the longest dotted suffix', () => {
  expect(logoDeArchivo('Dockerfile')?.oscuro).toBe('docker')
  expect(logoDeArchivo('web/package.json')?.oscuro).toBe('nodejs')
  expect(logoDeArchivo('types/index.d.ts')?.oscuro).toBe('typescript-def')
})

it('falls back to the extension badge for what the set does not know', () => {
  expect(logoDeArchivo('notas.zzqq')).toBeNull()
  const { container } = render(<FileTypeIcon filePath="notas.zzqq" />)
  expect(container.querySelector('[data-logo-archivo]')).toBeNull()
  expect(container.querySelector('svg')).not.toBeNull()
})
