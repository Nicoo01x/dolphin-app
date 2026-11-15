/**
 * Los textos que escriben Claude y los agentes —ideas, errores, porqués, planes, lo que aprendió
 * la memoria— partidos para leerse de un vistazo: lo que es un dato sale como insignia y el resto
 * queda como texto. Un número con su unidad, plata, un tiempo, un archivo, un comando, un término
 * citado o un modelo se encuentran sin leer el párrafo entero.
 *
 * Es determinista y barato: corre sobre cualquier texto, también los que ya estaban guardados,
 * sin pedirle nada al modelo. Un número suelto («5 a 8») no es insignia: sin unidad no dice qué
 * mide, y llenar el párrafo de insignias lo vuelve a hacer ilegible.
 */

/** Qué mide un dato: cada clase tiene su color, para separarlas de un vistazo. */
export type ClaseDeDato = "porcentaje" | "plata" | "tiempo" | "cantidad";

/** La clase de un dato, por lo que trae escrito. */
export function claseDeDato(valor: string): ClaseDeDato {
  if (/%$/.test(valor.trim())) return "porcentaje";
  if (/US\$|USD|\$/.test(valor)) return "plata";
  if (/\d\s?(?:ms|s|seg|min|h|horas?|d[ií]as?)$/.test(valor.trim())) return "tiempo";
  return "cantidad";
}

export type Trozo =
  | { readonly tipo: "texto"; readonly valor: string }
  /** Un número con lo que mide: 40,6 %, US$ 0,29, 12 s, 407 KB, 3 ramas. La clase le da su color. */
  | { readonly tipo: "dato"; readonly valor: string; readonly clase: ClaseDeDato }
  /** Código: lo que venía entre comillas invertidas, un archivo, una bandera. */
  | { readonly tipo: "codigo"; readonly valor: string }
  /** Un término que el texto destacó entre comillas latinas, ya sin las comillas. */
  | { readonly tipo: "cita"; readonly valor: string }
  /** Un modelo o un agente: va con su logo. */
  | { readonly tipo: "modelo"; readonly valor: string };

// Las unidades que dicen qué mide un número. Las palabras van completas (no «s» de «sobrevivientes»).
const UNIDAD = String.raw`(?:%|ms|s|seg|min|h|horas?|d[ií]as?|KB|MB|GB|px|k?tokens?|l[ií]neas?|archivos?|tests?|ramas?|fases?|intentos?|vueltas?|veces|x)`;
const NUMERO = String.raw`\d+(?:[.,]\d+)*`;

const PATRONES: readonly { readonly tipo: Exclude<Trozo["tipo"], "texto">; readonly re: string }[] = [
  // Entre comillas invertidas: el autor ya dijo que es código.
  { tipo: "codigo", re: String.raw`\x60[^\x60\n]{1,80}\x60` },
  { tipo: "cita", re: String.raw`«[^»\n]{1,60}»` },
  // Plata antes que números: «US$ 0,29» es un dato entero, no «0,29» suelto.
  { tipo: "dato", re: String.raw`(?:US\$|USD|\$)\s?${NUMERO}` },
  // Un rango («5-10 min») va entero; el signo cuenta solo si no viene pegado a otro número o palabra,
  // o «5-10 min» se leía «-10 min».
  { tipo: "dato", re: String.raw`(?<![\p{L}\d])[+−-]?${NUMERO}(?:\s?[-–]\s?${NUMERO})?\s?${UNIDAD}(?![\p{L}\d])` },
  // Un archivo con su carpeta, o uno conocido suelto (package.json, porton.ts).
  { tipo: "codigo", re: String.raw`(?:[\w.-]+/)+[\w.-]+\.[a-z]{1,5}\b` },
  { tipo: "codigo", re: String.raw`\b[\w-]+\.(?:ts|tsx|js|mjs|cjs|json|md|css|html|py|rs|go|ya?ml|toml|sql|prisma|sh)\b` },
  { tipo: "codigo", re: String.raw`(?<![\w-])--[a-z][\w-]*` },
  { tipo: "modelo", re: String.raw`\b(?:Claude(?: Code)?|Sonnet|Haiku|Opus|GPT(?:-\d[\w.]*)?|Codex|Gemini|DeepSeek|Qwen|Grok|Copilot|Mistral|Llama)\b` },
];

const BUSCADOR = new RegExp(PATRONES.map((p) => `(${p.re})`).join("|"), "gu");

/** Parte el texto en trozos; pegados, devuelven el texto tal cual (salvo las comillas de las citas y el código). */
export function partirEnInsignias(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  let desde = 0;
  for (const encontrado of texto.matchAll(BUSCADOR)) {
    const indice = encontrado.index ?? 0;
    const cual = encontrado.slice(1).findIndex((g) => g !== undefined);
    const patron = PATRONES[cual];
    if (!patron) continue;
    if (indice > desde) trozos.push({ tipo: "texto", valor: texto.slice(desde, indice) });
    const crudo = encontrado[0];
    const valor =
      patron.tipo === "cita" || (patron.tipo === "codigo" && crudo.startsWith("\x60")) ? crudo.slice(1, -1) : crudo;
    trozos.push(patron.tipo === "dato" ? { tipo: "dato", valor, clase: claseDeDato(valor) } : { tipo: patron.tipo, valor });
    desde = indice + crudo.length;
  }
  if (desde < texto.length) trozos.push({ tipo: "texto", valor: texto.slice(desde) });
  return compararComoDatos(trozos);
}

/**
 * En «US$ 0,29 contra 0,52» la segunda cifra no trae unidad, pero es el otro lado de la misma
 * comparación: sin insignia, la comparación se lee rengueando.
 */
function compararComoDatos(trozos: Trozo[]): Trozo[] {
  const salida: Trozo[] = [];
  for (const [i, trozo] of trozos.entries()) {
    const anterior = trozos[i - 1];
    const comparacion = /^(\s+(?:contra|vs\.?|frente a)\s+)(\d+(?:[.,]\d+)*)/.exec(trozo.valor);
    if (trozo.tipo === "texto" && anterior?.tipo === "dato" && comparacion) {
      salida.push({ tipo: "texto", valor: comparacion[1]! });
      // El otro lado de la comparación mide lo mismo: hereda la clase (y el color).
      salida.push({ tipo: "dato", valor: comparacion[2]!, clase: anterior.clase });
      const resto = trozo.valor.slice(comparacion[0].length);
      if (resto) salida.push({ tipo: "texto", valor: resto });
      continue;
    }
    salida.push(trozo);
  }
  return salida;
}
