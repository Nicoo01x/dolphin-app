import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Los archivos propios de Dolphin que se llamaban como los de la base, con su nombre de ahora.
 * Viven en la carpeta de datos de Dolphin (y en cada `profiles/<id>/`), nunca en la de la base
 * real: `%APPDATA%\orca` y `~/.orca` no se miran acá.
 */
export const ARCHIVOS_DE_DATOS_RENOMBRADOS: readonly (readonly [viejo: string, nuevo: string])[] = [
  ['orca-data.json', 'dolphin-data.json'],
  ['orca-profile-index.json', 'dolphin-profile-index.json'],
  ['orca-runtime.json', 'dolphin-runtime.json'],
  ['orca-stats.json', 'dolphin-stats.json'],
  ['orca-e2ee-keypair.json', 'dolphin-e2ee-keypair.json'],
  ['orca-claude-usage.json', 'dolphin-claude-usage.json'],
  ['orca-codex-usage.json', 'dolphin-codex-usage.json'],
  ['orca-muse-usage.json', 'dolphin-muse-usage.json'],
  ['orca-opencode-usage.json', 'dolphin-opencode-usage.json'],
  ['orca-secret-protection.json', 'dolphin-secret-protection.json'],
  ['orca-github-cache.json', 'dolphin-github-cache.json'],
  ['orca-devices.json', 'dolphin-devices.json'],
  ['orca-relay-region-preference.json', 'dolphin-relay-region-preference.json'],
  ['orca-workspace-cleanup-scan.json', 'dolphin-workspace-cleanup-scan.json'],
  ['orca-workspace-space-analysis.json', 'dolphin-workspace-space-analysis.json'],
  ['orca-worktree-removals.json', 'dolphin-worktree-removals.json'],
  ['orca-ephemeral-vm-runtime-features.json', 'dolphin-ephemeral-vm-runtime-features.json'],
  ['orca-ephemeral-vm-runtimes.json', 'dolphin-ephemeral-vm-runtimes.json'],
  ['orca-local-build.json', 'dolphin-local-build.json'],
  ['orca-environment-sidecar.json', 'dolphin-environment-sidecar.json'],
  ['orca-environments.json', 'dolphin-environments.json'],
  ['orca-wsl-host-deployments.json', 'dolphin-wsl-host-deployments.json'],
  ['dolphind-held-fence-tokens.json', 'dolphind-held-fence-tokens.json'],
  ['dolphind-idle-stop.json', 'dolphind-idle-stop.json'],
  // Why el candado también: guarda el pid de quien lo tiene, así que renombrado sigue diciendo
  // «ocupado» si ese proceso vive, y el siguiente que arranque no comparte los datos con él.
  ['dolphind.lock', 'dolphind.lock']
]

/**
 * Renombra, una sola vez, los archivos con nombre viejo de la carpeta de datos y de cada perfil.
 * Si ya está el nombre nuevo no toca nada (gana lo de ahora). Devuelve lo que movió.
 * Why renombrar y no copiar: son archivos de Dolphin en su propia carpeta; una copia dejaría
 * dos versiones del mismo estado y la vieja quedaría desactualizada para siempre.
 */
export function migrarNombresDeArchivosDeDatos(raiz: string): string[] {
  const carpetas = [raiz]
  const perfiles = join(raiz, 'profiles')
  try {
    for (const entrada of readdirSync(perfiles, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        carpetas.push(join(perfiles, entrada.name))
      }
    }
  } catch {
    // Sin perfiles todavía: solo la raíz.
  }
  const movidos: string[] = []
  for (const carpeta of carpetas) {
    for (const [viejo, nuevo] of ARCHIVOS_DE_DATOS_RENOMBRADOS) {
      const desde = join(carpeta, viejo)
      const hacia = join(carpeta, nuevo)
      if (!existsSync(desde) || existsSync(hacia)) {
        continue
      }
      try {
        renameSync(desde, hacia)
        movidos.push(hacia)
      } catch (error) {
        // Why seguir: un archivo trabado (antivirus, otro proceso) no frena el arranque; el
        // próximo arranque lo vuelve a intentar.
        console.warn(`[dolphin] no se pudo renombrar ${desde}:`, error)
      }
    }
  }
  return movidos
}
