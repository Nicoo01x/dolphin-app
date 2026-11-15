import { createHash } from 'node:crypto'

export const OPENCODE_OVERLAY_DIR = 'opencode-config-overlays'
// `dolphin-` y no `orca-`: desde el merge con la base este nombre también se escribe en la carpeta real
// de OpenCode, donde una instalación de la base al lado usa `orca-opencode-status.js`.
export const DOLPHIN_OPENCODE_PLUGIN_FILE = 'dolphin-opencode-status.js'

export function toSafeDirName(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

export function sourceOverlayDirName(sourceConfigDir: string): string {
  return toSafeDirName(`source:${sourceConfigDir}`)
}
