import { cpSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// Why: son cachés que Electron y Chromium rehacen solos; en dolphin-dev pesan ~480 MB y
// copiarlos solo demoraba el primer arranque. Los modelos de voz SÍ se copian: bajarlos
// de nuevo son 640 MB.
const NO_SE_COPIAN = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnWebGPUCache',
  'DawnGraphiteCache',
  'ShaderCache',
  'Crashpad',
  'logs'
])

const MARCADOR = '.migrado-de-orca-dev'

/**
 * Un perfil existe de verdad cuando Electron ya corrió en él (escribe `Local State` al
 * arrancar). El runner de `pnpm dev` crea `dolphin-dev/cli` antes de lanzar Electron: si la
 * migración mirara solo si la carpeta existe, se salteaba siempre y Dolphin arrancaba vacío.
 */
function perfilUsado(path: string): boolean {
  return existsSync(join(path, 'Local State')) || existsSync(join(path, MARCADOR))
}

/**
 * En desarrollo, el perfil vivía en `orca-dev` y ahora es `dolphin-dev`. Se copia (nunca se
 * mueve: la carpeta vieja queda como estaba) a una carpeta temporal que recién al final pasa
 * a llamarse `dolphin-dev`, para que un corte a mitad de copia no deje un perfil a medias que
 * el próximo arranque daría por bueno. Lo que el runner ya dejó en `dolphin-dev` se conserva
 * encima de la copia.
 *
 * Why el nombre viejo escrito acá: es el de la carpeta que hay que encontrar en el disco de
 * alguien. El 08/11/2026 un renombre se lo llevó y las dos rutas quedaron iguales: la función
 * se copiaba encima de sí misma y Dolphin arrancaba con el perfil vacío.
 */
export function migrateDolphinDevElectronUserData(appDataPath: string): boolean {
  return migrarPerfilDeElectron(appDataPath, 'orca-dev', 'dolphin-dev')
}

/**
 * Lo mismo para el perfil empaquetado: vivía en `orca` y ahora es `dolphin`.
 *
 * Why hacía falta: en desarrollo la migración existía y en el build empaquetado no, así que
 * quien venía de una versión anterior abría la app nueva sin sus repos, sus worktrees ni sus
 * conversaciones — estaban enteras en la carpeta de antes. Solo corre cuando el perfil nuevo
 * nunca se usó, así que no pisa nada.
 */
export function migratePackagedElectronUserData(appDataPath: string): boolean {
  return migrarPerfilDeElectron(appDataPath, 'orca', 'dolphin')
}

function migrarPerfilDeElectron(
  appDataPath: string,
  nombreViejo: string,
  nombreNuevo: string
): boolean {
  const legacyPath = join(appDataPath, nombreViejo)
  const dolphinPath = join(appDataPath, nombreNuevo)
  if (perfilUsado(dolphinPath) || !existsSync(legacyPath)) {
    return false
  }
  const temporal = join(appDataPath, `${nombreNuevo}.migrando`)
  // Why: si quedó de un intento cortado es nuestra y está incompleta; la vieja no se toca.
  rmSync(temporal, { recursive: true, force: true })
  cpSync(legacyPath, temporal, {
    recursive: true,
    force: false,
    filter: (origen) => origen === legacyPath || !NO_SE_COPIAN.has(basename(origen))
  })
  if (existsSync(dolphinPath)) {
    for (const entrada of readdirSync(dolphinPath)) {
      cpSync(join(dolphinPath, entrada), join(temporal, entrada), { recursive: true, force: true })
    }
    rmSync(dolphinPath, { recursive: true, force: true })
  }
  writeFileSync(join(temporal, MARCADOR), '')
  renameSync(temporal, dolphinPath)
  return true
}
