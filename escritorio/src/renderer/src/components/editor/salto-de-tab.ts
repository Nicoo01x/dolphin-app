import { sitiosDelNombre, type Renombre, type SitioPendiente } from './proxima-edicion'

/**
 * A dónde te lleva Tab cuando la próxima edición no está donde tenés el cursor.
 *
 * Esto es la mitad que faltaba del Tab predictivo. Que el nombre nuevo aparezca en gris cuando el
 * cursor cae sobre un lugar pendiente ya andaba; lo que hace Cursor y todavía no estaba es que no
 * tengas que ir hasta ahí: apretás Tab y el cursor viaja al próximo lugar, apretás Tab otra vez y
 * se acepta. Recorrer seis llamadas de una función renombrada son doce teclas y cero búsquedas.
 *
 * La regla entera está acá y no en el editor, porque es una decisión y no una llamada a una API:
 * con el cursor ya sobre un lugar pendiente, Tab NO salta —ahí tiene que ganar la sugerencia en
 * gris, o la persona pasaría de largo justo el lugar que está mirando—.
 */

/** Si el cursor está tocando este sitio, incluidos los dos bordes. */
function tocaElSitio(sitio: SitioPendiente, cursor: number): boolean {
  return cursor >= sitio.desde && cursor <= sitio.hasta
}

/**
 * El sitio al que Tab tiene que llevar el cursor, o null si no tiene que llevarlo a ninguno.
 *
 * Null significa dos cosas distintas que terminan igual: no queda ningún lugar pendiente, o el
 * cursor ya está en uno. En los dos casos Tab hace lo que haría siempre.
 *
 * Se da la vuelta al llegar al final, igual que el buscador del editor: después del último lugar
 * del archivo sigue el primero. Sin eso, quien arranca a renombrar en la mitad de un archivo
 * nunca llega a lo de arriba.
 */
export function saltoDeTab(
  texto: string,
  renombre: Renombre,
  cursor: number
): SitioPendiente | null {
  const sitios = sitiosDelNombre(texto, renombre.viejo)
  if (sitios.length === 0 || sitios.some((sitio) => tocaElSitio(sitio, cursor))) {
    return null
  }
  // Estrictamente después del cursor, así apretar Tab varias veces avanza en vez de volver al
  // mismo lugar; y si no quedaba nada abajo, el primero de arriba.
  return sitios.find((sitio) => sitio.desde > cursor) ?? sitios[0] ?? null
}
