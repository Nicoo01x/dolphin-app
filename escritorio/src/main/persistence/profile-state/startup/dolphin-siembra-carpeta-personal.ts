import { DOLPHIN_SIEMBRA_CARPETA_PERSONAL } from '../../../../shared/dolphin-brand'

/**
 * Si un perfil nuevo arranca con la carpeta personal como proyecto (`initializeHomeWorkspace` del
 * store de la base, que sólo actúa cuando todavía no hay documento de perfil). La base la pide siempre
 * salvo en modo servidor; Dolphin la deja pasar sólo si su bandera lo dice (ver
 * DOLPHIN_SIEMBRA_CARPETA_PERSONAL). La bandera va por parámetro para poder probar los dos lados.
 */
export function debeSembrarCarpetaPersonal(
  pideLaBase: boolean | undefined,
  siembraDolphin: boolean = DOLPHIN_SIEMBRA_CARPETA_PERSONAL
): boolean {
  return siembraDolphin && pideLaBase === true
}
