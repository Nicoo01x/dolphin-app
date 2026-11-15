/**
 * Lo que un texto nombra del proyecto y existe de verdad: un issue, un PR, una rama, un commit.
 *
 * Pedido de Nico (01/11): «cuando se menciona un issue, un PR, una rama, te debe permitir
 * clickearlo y llevarte ahí, o si tocás por encima ves un flotante con cuál y demás». La idea es
 * que los textos de los agentes dejen de ser texto SOBRE el proyecto y pasen a ser una superficie
 * DEL proyecto: lo que se nombra, se abre.
 *
 * Es el mismo detector que el del chat de la app de escritorio
 * (`escritorio/src/renderer/src/components/dolphin/chat/referencias.ts`), con los mismos casos en
 * los tests. Si se corrige un patrón acá, se corrige allá: dos reglas distintas para lo mismo
 * hacen que la consola y el escritorio marquen cosas distintas en el mismo texto.
 *
 * **Con una diferencia a propósito**: allá también se reconocen las URL de GitHub pegadas en el
 * texto y acá no. El motivo es el guardia de `tests/consola.test.ts`, que falla si aparece una
 * URL externa en el código de la consola —existe para que esto no se cuelgue de nada de afuera y
 * siga andando en un VPS sin salida—, y escribir el patrón partido para esquivarlo sería ofuscar
 * código para pasar un test. Lo que se pierde es poco: una URL pegada en un texto ya se ve y se
 * copia; lo que de verdad aporta marcar son los `#412` sueltos.
 *
 * La regla que gobierna todo esto: **no se marca lo que no se puede abrir**. Una referencia que
 * al tocarla no lleva a ningún lado es peor que texto plano, porque promete algo y falla. Por eso
 * una rama cualquiera necesita estar en la lista de ramas del repo —`feat/algo` y `src/algo` se
 * escriben igual y solo una existe— mientras que las de Dolphin se reconocen por su prefijo.
 */

export type ClaseDeReferencia = "issue" | "pr" | "rama" | "commit";

export interface Referencia {
  readonly clase: ClaseDeReferencia;
  /** Lo que se escribió, tal cual, para mostrarlo sin alterarlo. */
  readonly texto: string;
  /** Con qué se busca: el número del issue, el nombre de la rama, el hash. */
  readonly id: string;
}

/** El contexto del repo: sin esto, una rama es una cadena con una barra en el medio. */
export interface LoQueExiste {
  readonly ramas?: readonly string[];
}

/** Dónde arranca y termina una referencia adentro de un texto. */
export interface Hallazgo extends Referencia {
  readonly desde: number;
  readonly hasta: number;
}

/** Un hash de git suelto: de 7 a 40 en hexadecimal, y con al menos un dígito. */
const COMMIT = String.raw`\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b`;
/**
 * Las ramas que larga Dolphin: `dolphin/<tarea>/<compañero>`, TRES tramos y ninguno con punto.
 *
 * Los tres tramos y el punto no son un capricho: con `dolphin/<lo que sea>` se marcaban como rama
 * `dolphin/latidos` y `dolphin/dolphin.sqlite`, que son la carpeta de trabajo del propio Dolphin
 * adentro del repo. Una rama inventada que al tocarla no lleva a ningún lado es justo lo que este
 * detector no tiene que hacer.
 */
const RAMA_DE_DOLPHIN = String.raw`\bdolphin/[\w-]+/[\w-]+(?:/[\w-]+)*\b`;
/** `#123`, pero no un color (`#fff`) ni una ancla pegada a una palabra (`tarea#4`). */
const NUMERO_SUELTO = String.raw`(?<![\p{L}\d#])#(\d{1,6})\b`;
const NUMERO_CON_GH = String.raw`\bGH-(\d{1,6})\b`;
const PR_CON_PALABRA = String.raw`\b(?:PR|pull request)\s+#?(\d{1,6})\b`;

/**
 * Cada patrón se busca por su cuenta y después se resuelven los choques.
 *
 * La alternativa —un solo regex con todos entre paréntesis— obliga a adivinar qué grupo es de qué
 * patrón contando paréntesis, y se rompe en cuanto alguien agrega uno sin grupo. Los textos de un
 * chat son cortos: siete barridos no se notan.
 */
const PATRONES: readonly { readonly clase: ClaseDeReferencia; readonly re: string; readonly grupo: number }[] = [
  { clase: "pr", re: PR_CON_PALABRA, grupo: 1 },
  { clase: "issue", re: NUMERO_CON_GH, grupo: 1 },
  { clase: "issue", re: NUMERO_SUELTO, grupo: 1 },
  { clase: "rama", re: RAMA_DE_DOLPHIN, grupo: 0 },
  { clase: "commit", re: COMMIT, grupo: 0 },
];

const COMPILADOS = PATRONES.map((p) => ({ ...p, re: new RegExp(p.re, "gu") }));

type Candidato = Hallazgo & { readonly orden: number };

/**
 * Las ramas del repo que aparecen en el texto, por nombre exacto.
 *
 * De la más larga a la más corta: con `main` y `main-viejo`, buscar `main` primero partiría
 * `main-viejo` al medio y dejaría un `-viejo` suelto al lado de un link que va a otro lado.
 */
function ramasEnElTexto(texto: string, ramas: readonly string[]): Candidato[] {
  const hallazgos: Candidato[] = [];
  for (const rama of [...ramas].sort((a, b) => b.length - a.length)) {
    if (rama.length < 2) continue;
    let desde = texto.indexOf(rama);
    while (desde !== -1) {
      const antes = texto[desde - 1] ?? " ";
      const despues = texto[desde + rama.length] ?? " ";
      // Pegada a una letra, un dígito o una barra es otra cosa: `origin/main` no es `main`.
      if (!/[\p{L}\d/_-]/u.test(antes) && !/[\p{L}\d/_-]/u.test(despues)) {
        hallazgos.push({ clase: "rama", texto: rama, id: rama, desde, hasta: desde + rama.length, orden: -1 });
      }
      desde = texto.indexOf(rama, desde + rama.length);
    }
  }
  return hallazgos;
}

/**
 * Todas las referencias de un texto, en orden y sin superponerse.
 *
 * Gana la que empieza antes; a igual comienzo, la más larga; y a igual largo, el patrón más
 * específico. Así «PR #45» le gana a «#45», y un commit largo no se parte en dos.
 */
export function referenciasEn(texto: string, existe: LoQueExiste = {}): Hallazgo[] {
  const crudos: Candidato[] = [];
  for (const [orden, patron] of COMPILADOS.entries()) {
    patron.re.lastIndex = 0;
    for (const encontrado of texto.matchAll(patron.re)) {
      const id = patron.grupo === 0 ? encontrado[0] : encontrado[patron.grupo];
      if (!id) continue;
      const desde = encontrado.index ?? 0;
      crudos.push({ clase: patron.clase, texto: encontrado[0], id, desde, hasta: desde + encontrado[0].length, orden });
    }
  }
  crudos.push(...ramasEnElTexto(texto, existe.ramas ?? []));

  crudos.sort((a, b) => a.desde - b.desde || b.hasta - a.hasta || a.orden - b.orden);
  const limpios: Hallazgo[] = [];
  for (const { orden: _orden, ...hallazgo } of crudos) {
    const ultimo = limpios[limpios.length - 1];
    if (!ultimo || hallazgo.desde >= ultimo.hasta) limpios.push(hallazgo);
  }
  return limpios;
}

/** El rótulo corto de una referencia: un hash largo se muestra cortado. */
export function rotuloDe(referencia: Referencia): string {
  if (referencia.clase === "commit") return referencia.id.slice(0, 7);
  if (referencia.clase === "issue" || referencia.clase === "pr") return `#${referencia.id}`;
  return referencia.texto;
}
