/**
 * Los objetos JSON de primer nivel que aparecen en un texto, del último al
 * primero. Un modelo a veces explica antes o después del JSON, o lo envuelve
 * en ```json; y ni una expresión regular ni «de la primera llave a la última»
 * alcanzan: la primera no acepta objetos anidados (un «porqué» que cita
 * `{a: 1}` hacía que una revisión no se leyera) y la segunda junta dos
 * objetos en uno inválido. Se cuentan las llaves fuera de las comillas.
 */
export function objetosJson(texto: string): unknown[] {
  const encontrados: unknown[] = [];
  for (let inicio = texto.indexOf("{"); inicio >= 0; inicio = texto.indexOf("{", inicio + 1)) {
    let profundidad = 0;
    let enComillas = false;
    let escapado = false;
    for (let i = inicio; i < texto.length; i++) {
      const c = texto[i];
      if (enComillas) {
        if (escapado) escapado = false;
        else if (c === "\\") escapado = true;
        else if (c === '"') enComillas = false;
        continue;
      }
      if (c === '"') enComillas = true;
      else if (c === "{") profundidad++;
      else if (c === "}" && --profundidad === 0) {
        try {
          encontrados.push(JSON.parse(texto.slice(inicio, i + 1)));
          inicio = i;
        } catch {
          // no era JSON: se sigue buscando desde la próxima llave
        }
        break;
      }
    }
  }
  return encontrados.reverse();
}
