import type { GlobalSettings } from './global-settings-types'
import {
  TEMA_DE_TERMINAL_DOLPHIN_CLARO,
  TEMA_DE_TERMINAL_DOLPHIN_OSCURO
} from './terminal-themes/dolphin-terminal-themes'
import { TEMA_DE_CODIGO_DE_FABRICA } from './tema-de-codigo'

/**
 * Los valores por defecto de los ajustes que suma Dolphin.
 *
 * Why aparte: `buildDefaultSettings` de la base vive en su tope de líneas; esto entra con un spread al
 * principio, así que si la base algún día define la misma clave, gana la de la base.
 */
export const AJUSTES_POR_DEFECTO_DOLPHIN = {
  appFontFamilyMovedOffGeist: true,
  // Apagada: una sola tarea abre varias sesiones de agente, y eso gasta. Lo decide la persona.
  autoDelegation: false,
  agentProjectMemoryEnabled: true,
  agentProjectMemoryLearningEnabled: true,
  // Prendido: sin el aviso, «delegá a ChatGPT» termina en un plugin que corre Codex fuera de Dolphin.
  agentDolphinContextEnabled: true,
  crossReviewOnAgentStop: false,
  // El tema de terminal propio, con el fondo del lienzo. Las dos claves se sacaron de
  // `buildDefaultSettings` (ahí ganaría la base): esto sólo decide el de un perfil NUEVO, porque al
  // cargar, lo guardado pisa a los valores por defecto y quien ya tiene perfil conserva el suyo.
  terminalThemeDark: TEMA_DE_TERMINAL_DOLPHIN_OSCURO,
  terminalThemeLight: TEMA_DE_TERMINAL_DOLPHIN_CLARO,
  // Dolphin Noche, sólo para un perfil NUEVO: uno guardado antes de que existiera el ajuste vuelve
  // a `dolphin` al cargar (normalize-loaded-global-settings.ts), así nadie amanece con otro tema.
  temaDeCodigo: TEMA_DE_CODIGO_DE_FABRICA
} satisfies Partial<GlobalSettings>
