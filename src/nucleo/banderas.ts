/**
 * Lo que el CLI contesta cuando le erraste al nombre.
 *
 * `parseArgs` de Node, ante una opción que no declaró, tira un ERR_PARSE_ARGS_UNKNOWN_OPTION con
 * su stack entero. Esa era la respuesta a `dolphin --help`, que es lo primero que escribe
 * cualquiera que acaba de instalar algo: doce líneas de stack dicen «el programa se rompió»
 * cuando lo único que pasó es que usó el nombre que usan los demás CLIs.
 *
 * Acá vive la parte que se puede probar sin lanzar un proceso: sacar el nombre del error y buscar
 * el parecido. Decirlo y salir es del entrypoint, que es el que tiene la lista de lo que existe.
 */

/** El `--nombre` que Node nombra en el error, para poder hablar de él en castellano. */
export function nombreEnElError(error: unknown): string | null {
  const mensaje = error instanceof Error ? error.message : String(error ?? "");
  // Node lo escribe entre comillas simples: Unknown option '--agent'. El '=' aparece cuando vino
  // pegado a un valor (--agent=claude) y no es parte del nombre.
  const conComillas = mensaje.match(/'(--?[^'=\s]+)/);
  return conComillas?.[1] ?? null;
}

/**
 * El nombre conocido más parecido, o null si ninguno lo es de verdad.
 *
 * El tope crece con el largo —un tercio, mínimo 1— porque dos letras de diferencia en «mquinas»
 * son un tropiezo de tipeo y las mismas dos en «ui» son otra palabra. Sugerir de más es peor que
 * no sugerir: manda a leer algo que no era.
 */
export function masParecido(nombre: string, conocidos: readonly string[]): string | null {
  const buscado = sinAcentos(nombre);
  const tope = Math.max(1, Math.floor(buscado.length / 3));
  let mejor: string | null = null;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (const candidato of conocidos) {
    const d = distancia(buscado, sinAcentos(candidato));
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = candidato;
    }
  }
  return mejorDistancia <= tope ? mejor : null;
}

/** Una línea que explica el error de banderas, con la sugerencia si hay alguna. */
export function motivoDeBandera(error: unknown, conocidas: readonly string[]): string {
  const nombre = nombreEnElError(error);
  if (!nombre) {
    // Un error de parseArgs que no nombra ninguna opción (un valor inválido, por ejemplo): se
    // repite lo que dijo Node, en una línea, que sigue siendo mejor que su stack.
    return error instanceof Error ? error.message : String(error ?? "no entendí los argumentos");
  }
  const pelado = nombre.replace(/^-+/, "");
  const peladas = conocidas.map((c) => c.replace(/^-+/, ""));
  if (peladas.includes(pelado)) {
    // La opción existe y el error es otro —le falta el valor, por ejemplo—. Decir «no la conozco»
    // sería mentir, y preguntarle si quiso decir --repo cuando escribió --repo, una burla.
    return error instanceof Error ? error.message : String(error);
  }
  const parecida = masParecido(pelado, peladas);
  return parecida
    ? `No conozco la opción ${nombre}. ¿Quisiste decir --${parecida}?`
    : `No conozco la opción ${nombre}.`;
}

/** Sin tildes, así «maquinas» encuentra «máquinas» sin que eso cuente como una letra cambiada. */
function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Levenshtein con una sola fila: cuántas letras hay que tocar para llegar de una a la otra. */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = fila[0]!;
    fila[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const deArriba = fila[j]!;
      fila[j] = Math.min(deArriba + 1, fila[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = deArriba;
    }
  }
  return fila[b.length]!;
}
