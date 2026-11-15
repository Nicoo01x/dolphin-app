import { describe, expect, it } from 'vitest'
import { getFileTypeBadge } from './file-type-badge'

describe('getFileTypeBadge', () => {
  it('gives each language its own colour', () => {
    expect(getFileTypeBadge('src/app.ts')).toMatchObject({ label: 'ts', color: '#3178C6' })
    expect(getFileTypeBadge('src/app.go')).toMatchObject({ label: 'go', color: '#00ADD8' })
    expect(getFileTypeBadge('src/main.rs')).toMatchObject({ label: 'rs', color: '#DEA584' })
  })

  it('reads the extension off a Windows path too', () => {
    expect(getFileTypeBadge('D:\\Proyectos\\app\\index.tsx')).toMatchObject({ label: 'tsx' })
  })

  it('writes dark letters on the light colours', () => {
    // White on the JavaScript yellow is unreadable; this is the whole reason the flag exists.
    expect(getFileTypeBadge('a.js')?.darkText).toBe(true)
    expect(getFileTypeBadge('a.ts')?.darkText).toBe(false)
  })

  it('still badges an extension nobody listed, in grey', () => {
    // A file nobody thought of is still easier to scan with a badge than with a grey glyph.
    expect(getFileTypeBadge('notas.xyz')).toMatchObject({ label: 'xyz', color: '#6E7681' })
  })

  it('names files that have identity and no extension', () => {
    expect(getFileTypeBadge('Dockerfile')).toMatchObject({ label: 'dock', color: '#2496ED' })
    expect(getFileTypeBadge('repo/go.mod')).toMatchObject({ label: 'go' })
    expect(getFileTypeBadge('pnpm-lock.yaml')).toMatchObject({ label: 'pnpm' })
  })

  it('reads a dotfile as its own name and not as a nameless file', () => {
    // `.env` is the file `env`, not an extension on a file called nothing.
    expect(getFileTypeBadge('.env')).toMatchObject({ label: 'env' })
  })

  it('cuts a long extension to what fits in the badge', () => {
    expect(getFileTypeBadge('x.properties')?.label).toBe('prop')
  })

  it('leaves a file with no extension to the old glyph', () => {
    expect(getFileTypeBadge('README')).toBeNull()
    expect(getFileTypeBadge('')).toBeNull()
    expect(getFileTypeBadge(null)).toBeNull()
  })
})
