import { access } from 'node:fs/promises'

/** Si la ruta existe. Why no existsSync: en main bloquea todas las ventanas mientras mira el disco. */
export async function rutaExiste(ruta: string): Promise<boolean> {
  try {
    await access(ruta)
    return true
  } catch {
    return false
  }
}
