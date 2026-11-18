import { BrowserWindow, ipcMain } from 'electron'
import type { MemorySnapshot } from '../../shared/process-stats-types'
import type { Store } from '../persistence/loading-store/store'
import { collectMemorySnapshot } from '../memory/collector'
import { registerMemoriaBajaHandlers } from './memoria-baja'

import {
  assertResourceViewVisible,
  isResourceWindowVisible
} from '../window/resource-view-admission'
import type { ResourceViewAdmission } from '../../shared/resource-view-admission'

export function registerMemoryHandlers(store: Store): void {
  ipcMain.handle(
    'memory:getSnapshot',
    (event, admission?: ResourceViewAdmission): Promise<MemorySnapshot> => {
      assertResourceViewVisible(event, admission)
      return collectMemorySnapshot(store)
    }
  )
  ipcMain.handle('memory:resourceWindowVisible', (event) =>
    isResourceWindowVisible(BrowserWindow.fromWebContents(event.sender))
  )
  // Dolphin: el modo poca RAM vive al lado de la foto de memoria, de la que toma lo que más pesa.
  registerMemoriaBajaHandlers(store)
}
