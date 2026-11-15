import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () =>
  (await import('./createMainWindow-test-harness')).electronModuleMock()
)
vi.mock('./macos-tahoe-release', async () =>
  (await import('./createMainWindow-test-harness')).macosTahoeReleaseMock()
)
vi.mock('./desktop-integration/app-icon', async () =>
  (await import('./createMainWindow-test-harness')).appIconMock()
)
vi.mock('../browser/guest-lifecycle/manager/browser-manager', async () =>
  (await import('./createMainWindow-test-harness')).browserManagerMock()
)

import { ipcMain } from 'electron'
import { createMainWindow } from './createMainWindow'
import { resetExpectedTeardownStateForTest } from '../crash-reporting/process-exits/expected-teardown-state'
import { browserWindowMock, resetMainWindowMocks } from './createMainWindow-test-harness'
import { CANAL_FOCO_DEL_EDITOR_DE_CODIGO } from '../../shared/canal-foco-del-editor-de-codigo'

type Manejador = (...args: unknown[]) => void

function abrirVentana(): { handlers: Record<string, Manejador>; webContents: { send: unknown } } {
  const handlers: Record<string, Manejador> = {}
  const webContents = {
    on: vi.fn((evento: string, manejador: Manejador) => {
      handlers[evento] = manejador
    }),
    setZoomLevel: vi.fn(),
    setBackgroundThrottling: vi.fn(),
    setWebRTCIPHandlingPolicy: vi.fn(),
    invalidate: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    send: vi.fn(),
    isDevToolsOpened: vi.fn(),
    openDevTools: vi.fn(),
    closeDevTools: vi.fn()
  }
  browserWindowMock.mockImplementation(function () {
    return {
      webContents,
      on: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isMaximized: vi.fn(() => true),
      isFullScreen: vi.fn(() => false),
      getSize: vi.fn(() => [1200, 800]),
      setSize: vi.fn(),
      maximize: vi.fn(),
      show: vi.fn(),
      loadFile: vi.fn(() => Promise.resolve()),
      loadURL: vi.fn(() => Promise.resolve())
    }
  })
  createMainWindow(null)
  return { handlers, webContents }
}

function apretarCtrlK(handlers: Record<string, Manejador>): ReturnType<typeof vi.fn> {
  const preventDefault = vi.fn()
  const isDarwin = process.platform === 'darwin'
  handlers['before-input-event'](
    { preventDefault },
    { type: 'keyDown', code: 'KeyK', key: 'k', meta: isDarwin, control: !isDarwin }
  )
  return preventDefault
}

describe('Ctrl+K con un perfil nuevo', () => {
  beforeEach(() => {
    resetMainWindowMocks()
    resetExpectedTeardownStateForTest()
  })

  it('fuera del editor de código abre la paleta de worktrees, como en la base', () => {
    const { handlers, webContents } = abrirVentana()
    const preventDefault = apretarCtrlK(handlers)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(webContents.send).toHaveBeenCalledWith('ui:toggleWorktreePalette')
  })

  it('con el foco en el editor de código, la tecla llega a Monaco', () => {
    const { handlers, webContents } = abrirVentana()
    const avisarFoco = vi
      .mocked(ipcMain.on)
      .mock.calls.find(([canal]) => canal === CANAL_FOCO_DEL_EDITOR_DE_CODIGO)?.[1]
    expect(avisarFoco).toBeTypeOf('function')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el oyente sólo lee `sender`, igual que el test de markdown de la base.
    avisarFoco?.({ sender: webContents } as never, true)

    const preventDefault = apretarCtrlK(handlers)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(webContents.send).not.toHaveBeenCalledWith('ui:toggleWorktreePalette')
  })
})
