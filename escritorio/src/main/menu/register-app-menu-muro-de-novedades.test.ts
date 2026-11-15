import { beforeEach, describe, expect, it, vi } from 'vitest'

const { buildFromTemplate, setApplicationMenu } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn()
}))

vi.mock('electron', () => ({
  app: { name: 'Dolphin' },
  BrowserWindow: { getFocusedWindow: () => null },
  Menu: { buildFromTemplate, setApplicationMenu },
  MenuItem: class {
    constructor(readonly options: unknown) {}
  }
}))

vi.mock('../i18n/main-i18n', () => ({
  translateMain: (_key: string, fallback: string) => fallback
}))

import { DOLPHIN_MURO_DE_NOVEDADES } from '../../shared/dolphin-brand'
import { registerAppMenu } from './register-app-menu'

type ItemDeMenu = { label?: string; submenu?: ItemDeMenu[] }

function menuDeAyuda(): ItemDeMenu[] {
  const plantilla = buildFromTemplate.mock.calls.at(-1)?.[0] as ItemDeMenu[]
  return plantilla.find((item) => item.label === 'Help')?.submenu ?? []
}

describe('el muro de novedades en el menú Ayuda', () => {
  beforeEach(() => {
    buildFromTemplate.mockClear()
  })

  it('no se ofrece: sus grabaciones eran de la base y salieron del árbol', () => {
    const noHaceNada = (): void => {}
    registerAppMenu({
      onOpenSettings: noHaceNada,
      onOpenSetupGuide: noHaceNada,
      onOpenFeatureTour: vi.fn(),
      onOpenCrashReport: noHaceNada,
      onCheckForUpdates: noHaceNada,
      onZoomIn: noHaceNada,
      onZoomOut: noHaceNada,
      onZoomReset: noHaceNada,
      onToggleLeftSidebar: noHaceNada,
      onToggleRightSidebar: noHaceNada,
      onToggleAppearance: noHaceNada,
      getAppearanceState: () => ({
        showTasksButton: true,
        showAutomationsButton: true,
        showMobileButton: true,
        showTitlebarAppName: true,
        statusBarVisible: true
      }),
      onQuit: noHaceNada
    } as unknown as Parameters<typeof registerAppMenu>[0])

    expect(DOLPHIN_MURO_DE_NOVEDADES).toBe(false)
    const etiquetas = menuDeAyuda().map((item) => item.label)
    expect(etiquetas).not.toContain('Explore Dolphin')
    // La guía de inicio es otro modal y sigue en el menú.
    expect(etiquetas).toContain('Getting Started with Dolphin')
  })
})
