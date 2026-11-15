import { ipcRenderer } from 'electron'
import type { PresenciaDeDolphin } from '../../shared/discord-presencia'
import type { PreloadApi } from '../api-types'

/**
 * La presencia de Discord. El renderer sabe qué archivo está abierto; el socket vive en el proceso
 * principal. `send` y no `invoke`: nadie espera una respuesta y la presencia no puede hacer esperar
 * a la interfaz.
 */
export const discordApi = {
  publicarPresencia: (estado: PresenciaDeDolphin): void => {
    ipcRenderer.send('discord:publicarPresencia', estado)
  }
} satisfies PreloadApi['discord']
