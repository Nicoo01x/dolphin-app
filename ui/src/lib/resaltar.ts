/**
 * El resaltado de sintaxis del diff: que el código se lea como en un editor y no como un bloque
 * de texto plano (Nico, 01/11: «que se vea como Visual Code, las funciones con colores, las
 * constantes y las variables»).
 *
 * Está escrito a mano, sin librería, por tres razones:
 * - **La consola no pide nada a internet** (lo vigila un test): un resaltador de CDN está vetado,
 *   y los que se empaquetan traen gramáticas de cientos de kilobytes para un bundle que ya pesa.
 * - **Acá se resaltan LÍNEAS SUELTAS**, no archivos. Un tokenizador con estado necesita el
 *   archivo entero para saber si está adentro de un comentario de bloque o de un template; sobre
 *   un diff, donde faltan los pedazos sin cambios, ese estado es mentira igual.
 * - Lo que hay que distinguir en un diff es poco y siempre lo mismo: qué es una cadena, qué es un
 *   nombre que se llama, qué es un tipo y qué es una constante.
 *
 * No es un parser: es un barrido lineal. Se equivoca en los casos raros y nunca rompe la línea —
 * el texto que sale, concatenado, es idéntico al que entró, y eso lo vigila un test.
 */

export type ClaseDeToken =
  | "comentario"
  | "cadena"
  | "numero"
  | "palabra"
  | "constante"
  | "tipo"
  | "funcion"
  | "propiedad"
  | "etiqueta"
  | "operador"
  | "normal";

export interface Token {
  readonly texto: string;
  readonly clase: ClaseDeToken;
}

export type Lenguaje = "ts" | "json" | "css" | "html" | "md" | "py" | "sh" | "rs" | "go" | "yaml" | "sql" | "ninguno";

const POR_EXTENSION: Record<string, Lenguaje> = {
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts", svelte: "ts", vue: "html",
  json: "json", jsonc: "json",
  css: "css", scss: "css", sass: "css", less: "css",
  html: "html", htm: "html", xml: "html",
  md: "md", mdx: "md", markdown: "md",
  py: "py", pyi: "py",
  sh: "sh", bash: "sh", zsh: "sh", ps1: "sh", bat: "sh", cmd: "sh",
  rs: "rs", go: "go",
  yml: "yaml", yaml: "yaml",
  sql: "sql",
};

/** Qué lenguaje es un archivo, por su extensión. Lo que no se conoce va sin color. */
export function lenguajeDe(ruta: string): Lenguaje {
  const nombre = ruta.toLowerCase().split(/[\\/]/).pop() ?? "";
  if (nombre.startsWith(".env")) return "sh";
  if (nombre === "dockerfile" || nombre === "makefile") return "sh";
  return POR_EXTENSION[nombre.slice(nombre.lastIndexOf(".") + 1)] ?? "ninguno";
}

const PALABRAS: Record<Lenguaje, readonly string[]> = {
  ts: ["abstract","as","async","await","break","case","catch","class","const","constructor","continue","declare","default","delete","do","else","enum","export","extends","finally","for","from","function","get","if","implements","import","in","instanceof","interface","is","keyof","let","new","of","private","protected","public","readonly","return","satisfies","set","static","super","switch","this","throw","try","type","typeof","var","void","while","yield"],
  py: ["and","as","assert","async","await","break","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield","self"],
  rs: ["as","async","await","break","const","continue","crate","dyn","else","enum","extern","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","static","struct","super","trait","type","unsafe","use","where","while"],
  go: ["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"],
  sh: ["case","do","done","elif","else","esac","exit","export","fi","for","function","if","in","local","return","set","then","while","echo","cd","source"],
  sql: ["and","as","by","create","delete","drop","from","group","insert","into","join","limit","not","null","on","or","order","select","set","table","update","values","where"],
  css: ["important"],
  json: [],
  html: [],
  md: [],
  yaml: [],
  ninguno: [],
};

/** Lo que vale por sí mismo en casi todo lenguaje. */
const LITERALES = new Set(["true", "false", "null", "undefined", "None", "True", "False", "nil", "NaN", "Infinity", "self", "this"]);

/** Dónde empieza y termina un comentario de línea en cada lenguaje. */
const COMENTARIO: Partial<Record<Lenguaje, RegExp>> = {
  ts: /^\/\/|^\/\*|^\*/,
  rs: /^\/\//,
  go: /^\/\//,
  css: /^\/\*|^\*/,
  py: /^#/,
  sh: /^#/,
  yaml: /^#/,
  sql: /^--/,
};

const esLetra = (c: string): boolean => /[A-Za-z_$À-ɏ]/.test(c);
const esNombre = (c: string): boolean => /[A-Za-z0-9_$À-ɏ]/.test(c);
const esDigito = (c: string): boolean => c >= "0" && c <= "9";

/** MAYUSCULAS_CON_GUIONES, y de más de una letra: `I` o `T` son genéricos, no constantes. */
const esConstante = (palabra: string): boolean => palabra.length > 1 && /^[A-Z][A-Z0-9_]*$/.test(palabra);
const esTipo = (palabra: string): boolean => /^[A-Z]/.test(palabra);

/**
 * Resalta UNA línea. Devuelve los pedazos en orden: pegados uno atrás del otro dan la línea
 * original, tal cual, sin perder ni un espacio.
 */
export function resaltar(linea: string, lenguaje: Lenguaje): Token[] {
  if (lenguaje === "ninguno" || linea === "") return [{ texto: linea, clase: "normal" }];
  if (lenguaje === "md") return resaltarMarkdown(linea);

  const salida: Token[] = [];
  const poner = (texto: string, clase: ClaseDeToken): void => {
    if (texto === "") return;
    const ultimo = salida[salida.length - 1];
    // Pedazos seguidos de la misma clase se juntan: menos nodos y el mismo dibujo.
    if (ultimo && ultimo.clase === clase) salida[salida.length - 1] = { texto: ultimo.texto + texto, clase };
    else salida.push({ texto, clase });
  };

  const palabras = new Set(PALABRAS[lenguaje]);
  const deComentario = COMENTARIO[lenguaje];
  let i = 0;
  while (i < linea.length) {
    const resto = linea.slice(i);

    // Un comentario se come el resto de la línea.
    if (deComentario?.test(resto)) {
      poner(resto, "comentario");
      break;
    }

    const c = linea[i]!;

    // Cadenas, con sus escapes. Sin cerrar, hasta el final: en un diff la línea se corta sola.
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < linea.length && linea[j] !== c) j += linea[j] === "\\" ? 2 : 1;
      poner(linea.slice(i, Math.min(j + 1, linea.length)), "cadena");
      i = j + 1;
      continue;
    }

    if (esDigito(c) || (c === "." && esDigito(linea[i + 1] ?? ""))) {
      let j = i;
      while (j < linea.length && /[0-9a-fA-FxXoObB._]/.test(linea[j]!)) j += 1;
      poner(linea.slice(i, j), "numero");
      i = j;
      continue;
    }

    if (esLetra(c)) {
      let j = i;
      while (j < linea.length && esNombre(linea[j]!)) j += 1;
      const palabra = linea.slice(i, j);
      // Lo que sigue decide: `algo(` es una llamada, `.algo` es una propiedad.
      const despues = linea.slice(j).trimStart()[0] ?? "";
      const antes = linea.slice(0, i).trimEnd().slice(-1);
      if (palabras.has(palabra)) poner(palabra, "palabra");
      else if (LITERALES.has(palabra)) poner(palabra, "constante");
      else if (despues === "(") poner(palabra, "funcion");
      else if (esConstante(palabra)) poner(palabra, "constante");
      else if (esTipo(palabra)) poner(palabra, "tipo");
      else if (antes === ".") poner(palabra, "propiedad");
      else poner(palabra, "normal");
      i = j;
      continue;
    }

    if (/[+\-*/%=<>!&|^~?:]/.test(c)) {
      poner(c, "operador");
      i += 1;
      continue;
    }

    poner(c, "normal");
    i += 1;
  }
  return salida;
}

/** Markdown no es código: lo que se marca es el título, el énfasis, el link y lo que va en ticks. */
function resaltarMarkdown(linea: string): Token[] {
  if (/^\s{0,3}#{1,6}\s/.test(linea)) return [{ texto: linea, clase: "tipo" }];
  if (/^\s{0,3}>/.test(linea)) return [{ texto: linea, clase: "comentario" }];
  const salida: Token[] = [];
  // Los ticks y los links son lo único que se distingue adentro de un párrafo.
  const partes = linea.split(/(`[^`]*`|\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*)/g);
  for (const parte of partes) {
    if (parte === "") continue;
    if (parte.startsWith("`")) salida.push({ texto: parte, clase: "cadena" });
    else if (parte.startsWith("[")) salida.push({ texto: parte, clase: "funcion" });
    else if (parte.startsWith("**")) salida.push({ texto: parte, clase: "constante" });
    else salida.push({ texto: parte, clase: "normal" });
  }
  return salida.length > 0 ? salida : [{ texto: linea, clase: "normal" }];
}
