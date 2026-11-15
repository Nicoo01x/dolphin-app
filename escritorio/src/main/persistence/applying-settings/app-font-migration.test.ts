import { describe, expect, it } from 'vitest'
import { migrateAppFontFamilyOffGeist } from './app-font-migration'

describe('migrateAppFontFamilyOffGeist', () => {
  it('moves an old profile that inherited Geist to Inter and asks to save', () => {
    const migrated = migrateAppFontFamilyOffGeist({ appFontFamily: 'Geist' } as never)

    expect(migrated.settings).toEqual({
      appFontFamily: 'Inter',
      appFontFamilyMovedOffGeist: true
    })
    expect(migrated.needsSave).toBe(true)
  })

  it('respects an old profile that picked another font', () => {
    const migrated = migrateAppFontFamilyOffGeist({ appFontFamily: 'Fira Sans' } as never)

    expect(migrated.settings.appFontFamily).toBe('Fira Sans')
    expect(migrated.settings.appFontFamilyMovedOffGeist).toBe(true)
    expect(migrated.needsSave).toBe(true)
  })

  it('uses Inter when nothing was stored', () => {
    const migrated = migrateAppFontFamilyOffGeist(undefined)

    expect(migrated.settings.appFontFamily).toBe('Inter')
    expect(migrated.needsSave).toBe(true)
  })

  it('keeps Geist once the flag is set because it is now a deliberate choice', () => {
    const migrated = migrateAppFontFamilyOffGeist({
      appFontFamily: 'Geist',
      appFontFamilyMovedOffGeist: true
    } as never)

    expect(migrated.settings.appFontFamily).toBe('Geist')
    expect(migrated.needsSave).toBe(false)
  })

  it('does not ask to save an already migrated profile', () => {
    const migrated = migrateAppFontFamilyOffGeist({
      appFontFamily: 'Inter',
      appFontFamilyMovedOffGeist: true
    } as never)

    expect(migrated.settings.appFontFamily).toBe('Inter')
    expect(migrated.needsSave).toBe(false)
  })
})
