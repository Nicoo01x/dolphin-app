import { app } from 'electron'
import { join } from 'node:path'

/**
 * La carpeta con las skills propias de Dolphin: `skills/` del repo en desarrollo y `dolphin-skills/`
 * en los recursos de la app empaquetada (electron-builder la copia ahí como recurso extra).
 */
export function dolphinSkillsSourceDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'dolphin-skills')
    : join(app.getAppPath(), 'skills')
}
