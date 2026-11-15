/**
 * Corre algo cuando el navegador está libre, después de pintar lo primero: compilar los shaders y
 * subir una imagen grande a la GPU no tiene que competir con el texto de la portada. En un celular eso
 * era más de un segundo de hilo principal trabado. Devuelve con qué cancelarlo.
 */
export function alDescansar(hacer: () => void, tope = 1200): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(hacer, { timeout: tope });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(hacer, 200);
  return () => window.clearTimeout(id);
}
