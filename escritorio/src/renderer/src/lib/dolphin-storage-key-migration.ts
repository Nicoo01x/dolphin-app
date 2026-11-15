/**
 * Las claves de localStorage de la app arrancaban con el prefijo del nombre anterior
 * (`orca:…`, `orca-…`, `orca.…`) y ahora arrancan con `dolphin`. Cada una se pasa una vez al
 * nombre nuevo (si el nuevo ya existe, gana) y se borra la vieja.
 *
 * Why el nombre viejo sigue escrito acá: son nuestras propias claves, no las de otro
 * producto, y el patrón es lo único que puede encontrarlas en el navegador de alguien.
 *
 * Why un módulo que se importa primero: varios módulos leen su clave al cargarse, antes de que
 * corra cualquier código de main.tsx.
 */
const CLAVE_VIEJA = /^orca([:.-])(.+)$/

export function migrarClavesDeAlmacenamiento(storage: Storage): string[] {
  const movidas: string[] = []
  const claves: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const clave = storage.key(i)
    if (clave !== null && CLAVE_VIEJA.test(clave)) {
      claves.push(clave)
    }
  }
  for (const vieja of claves) {
    const nueva = vieja.replace(CLAVE_VIEJA, 'dolphin$1$2')
    const valor = storage.getItem(vieja)
    if (valor !== null && storage.getItem(nueva) === null) {
      storage.setItem(nueva, valor)
      movidas.push(nueva)
    }
    storage.removeItem(vieja)
  }
  return movidas
}

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    migrarClavesDeAlmacenamiento(window.localStorage)
  }
} catch {
  // Sin acceso al almacenamiento (modo privado, cuota): la app arranca igual con sus valores de fábrica.
}
