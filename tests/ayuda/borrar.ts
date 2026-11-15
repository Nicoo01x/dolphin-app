import { rm } from "node:fs/promises";

/**
 * Borrar una carpeta temporal de un test en Windows, con reintentos.
 *
 * `rm` con `force` no reintenta: ignora que el archivo no exista, no que esté ocupado. Y en Windows
 * una carpeta donde acaba de correr git —o un proceso que recién se mató— queda tomada unos
 * milisegundos: el borrado falla con EBUSY, ENOTEMPTY o EPERM. Sin carga no se nota; con la suite
 * entera en paralelo y la máquina ocupada, sí, y el test fallaba en el `afterEach` después de haber
 * pasado. Es lo que hacía parpadear la suite.
 */
export function borrarCarpeta(ruta: string): Promise<void> {
  return rm(ruta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
