/**
 * Lo que cada agente va diciendo mientras trabaja: «Read src/a.ts», «Bash: npm test», su texto.
 * Es la terminal de cada sesión que muestra la app de terminal (y la que podría mostrar la de
 * escritorio): quien lanza un agente cuenta acá, quien quiere mirar escucha. La clave es la carpeta
 * donde trabaja (el worktree), que es única por agente aunque dos siembras tengan un «u1».
 *
 * No guarda nada ni toca el disco: si nadie escucha, se pierde, como una terminal cerrada.
 */

/**
 * Además del texto y las herramientas, lo que Claude Code muestra debajo de cada una: el diff de lo
 * que editó (renglones «+ x», «- x», «  x»), su lista de tareas («[x] », «[~] », «[ ] ») y lo que
 * piensa. Van en el texto, renglón por renglón, para que una voz siga siendo solo texto.
 */
export type TipoDeVoz = "texto" | "herramienta" | "resultado" | "error" | "diff" | "tareas" | "pensando" | "listo" | "compactado";

export interface Voz {
  /** Dónde trabaja el que habla: el worktree, o una clave como `lider:<repo>`. */
  readonly donde: string;
  readonly tipo: TipoDeVoz;
  readonly texto: string;
  readonly t: number;
  /**
   * El id de la herramienta (tool_use_id): con herramientas en paralelo, el resultado de una puede
   * llegar después de que arrancó otra, y así se sabe de cuál es.
   */
  readonly ref?: string;
}

const oyentes = new Set<(voz: Voz) => void>();

/** Escucha todas las voces. Devuelve con qué dejar de escuchar. */
export function escucharVoces(oyente: (voz: Voz) => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function decirVoz(donde: string, tipo: TipoDeVoz, texto: string, t = Date.now(), ref?: string): void {
  if (oyentes.size === 0) return;
  const limpio = texto.replace(/\s+$/g, "");
  if (!limpio) return;
  for (const oyente of oyentes) {
    try {
      oyente({ donde, tipo, texto: limpio, t, ...(ref ? { ref } : {}) });
    } catch {
      // un oyente roto no corta al agente
    }
  }
}

/** Corta a `largo` caracteres sin partir un emoji (un par sustituto) por la mitad. */
function hasta(texto: string, largo: number): string {
  const letras = [...texto];
  return letras.length > largo ? `${letras.slice(0, largo - 1).join("")}…` : texto;
}

/** Un renglón, recortado: la terminal de un agente no es el lugar para un archivo entero. */
function corto(texto: string, largo = 240): string {
  return hasta(texto.trim().split("\n")[0] ?? "", largo);
}

/** Qué hace una herramienta, en una línea: «Edit src/a.ts», «Bash: npm test». */
export function herramientaEnUnaLinea(nombre: string, entrada: Record<string, unknown> | undefined): string {
  const e = entrada ?? {};
  const ruta = (e.file_path ?? e.path ?? e.notebook_path) as string | undefined;
  if (typeof e.command === "string") return `${nombre}: ${corto(e.command, 160)}`;
  if (ruta) return `${nombre} ${ruta.replace(/\\/g, "/").split("/").slice(-3).join("/")}`;
  if (typeof e.pattern === "string") return `${nombre} «${corto(e.pattern, 80)}»`;
  if (typeof e.description === "string") return `${nombre}: ${corto(e.description, 120)}`;
  if (typeof e.url === "string") return `${nombre} ${e.url}`;
  return nombre;
}

/** Los primeros `max` renglones con contenido, cada uno recortado, y «… +N renglones» si había más. */
function renglones(texto: string, max: number, largo = 200): string {
  const todos = texto.split("\n").map((r) => r.trimEnd()).filter((r) => r.trim());
  const vistos = todos.slice(0, max).map((r) => hasta(r, largo));
  if (todos.length > max) vistos.push(`… +${todos.length - max} renglones`);
  return vistos.join("\n");
}

const TOPE_DE_DIFF = 12;

/** Lo que vino como objeto (un null en una lista de Claude no puede tumbar al que escucha). */
const objetos = (lista: unknown): Record<string, unknown>[] =>
  Array.isArray(lista) ? (lista.filter((x) => x !== null && typeof x === "object") as Record<string, unknown>[]) : [];

/** Los renglones de un texto: sin \r y sin el renglón vacío que deja el \n del final de un archivo. */
const renglonesDe = (texto: string): string[] => (texto ? texto.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n") : []);

/** Lo que cambió una edición, como lo muestra Claude Code: lo que sale, lo que entra. */
function diffDe(nombre: string, entrada: Record<string, unknown>): string | null {
  const cambios: { antes: string; despues: string }[] =
    nombre === "Write" && typeof entrada.content === "string"
      ? [{ antes: "", despues: entrada.content }]
      : nombre === "Edit" && typeof entrada.new_string === "string"
        ? [{ antes: String(entrada.old_string ?? ""), despues: entrada.new_string }]
        : nombre === "MultiEdit" && Array.isArray(entrada.edits)
          ? objetos(entrada.edits).map((e) => ({ antes: String(e.old_string ?? ""), despues: String(e.new_string ?? "") }))
          : [];
  if (cambios.length === 0) return null;
  const salida: string[] = [];
  for (const [i, { antes, despues }] of cambios.entries()) {
    // Las ediciones de un MultiEdit van separadas: no son renglones seguidos del archivo.
    if (i > 0) salida.push("  ⋯");
    const quitadas = renglonesDe(antes);
    const puestas = renglonesDe(despues);
    // Lo que queda igual al principio y al final no es el cambio: va una vez, como contexto.
    let comun = 0;
    while (comun < quitadas.length && comun < puestas.length && quitadas[comun] === puestas[comun]) comun++;
    let cola = 0;
    while (cola < quitadas.length - comun && cola < puestas.length - comun && quitadas[quitadas.length - 1 - cola] === puestas[puestas.length - 1 - cola]) cola++;
    for (const r of quitadas.slice(Math.max(0, comun - 1), comun)) salida.push(`  ${r}`);
    for (const r of quitadas.slice(comun, quitadas.length - cola)) salida.push(`- ${r}`);
    for (const r of puestas.slice(comun, puestas.length - cola)) salida.push(`+ ${r}`);
    for (const r of puestas.slice(puestas.length - cola, puestas.length - cola + 1)) salida.push(`  ${r}`);
  }
  const mas = salida.filter((r) => r.startsWith("+ ")).length;
  const menos = salida.filter((r) => r.startsWith("- ")).length;
  const vistas = salida.slice(0, TOPE_DE_DIFF).map((r) => hasta(r, 200));
  if (salida.length > TOPE_DE_DIFF) vistas.push(`… +${salida.length - TOPE_DE_DIFF} renglones`);
  // El primer renglón es el resumen: cuántos entran y cuántos salen.
  return [`${mas} ${mas === 1 ? "agregado" : "agregados"}, ${menos} ${menos === 1 ? "quitado" : "quitados"}`, ...vistas].join("\n");
}

/** La lista de tareas de TodoWrite: «[x] hecha», «[~] en curso», «[ ] por hacer». */
function tareasDe(entrada: Record<string, unknown>): string | null {
  if (!Array.isArray(entrada.todos)) return null;
  const lista = objetos(entrada.todos)
    .filter((x) => typeof x.content === "string")
    .map((x) => `${x.status === "completed" ? "[x]" : x.status === "in_progress" ? "[~]" : "[ ]"} ${corto(x.content as string, 160)}`);
  return lista.length > 0 ? lista.join("\n") : null;
}

/** Lo que devolvió una herramienta, resumido como en Claude Code según cuál fue. */
function resultadoDe(nombre: string | undefined, texto: string): string | null {
  const cuantos = texto.split("\n").filter((r) => r.trim()).length;
  if (nombre === "Read") return `Leyó ${cuantos} ${cuantos === 1 ? "renglón" : "renglones"}`;
  // El diff y la lista de tareas ya dicen qué pasó: el «se actualizó el archivo» sobra.
  if (nombre && ["Edit", "MultiEdit", "Write", "NotebookEdit", "TodoWrite"].includes(nombre)) return null;
  if (nombre === "Glob") return cuantos === 0 || /^No files found/i.test(texto.trim()) ? "Ningún archivo" : `${cuantos} ${cuantos === 1 ? "archivo" : "archivos"}\n${renglones(texto, 3)}`;
  return renglones(texto, 4);
}

/**
 * Una línea de `claude -p --output-format stream-json` hecha voces: el texto del asistente, lo que
 * piensa, cada herramienta que usa (con su diff o su lista de tareas) y lo que le devuelven. El
 * resultado final (el que trae el costo) no es una voz: lo lee quien lanzó al agente.
 *
 * `nombres` recuerda de qué herramienta era cada id, para resumir su resultado: el oyente la guarda
 * entre líneas porque el resultado llega en la línea siguiente.
 */
export function vocesDeClaude(linea: string, nombres = new Map<string, string>()): { tipo: TipoDeVoz; texto: string; ref?: string }[] {
  let dato: { type?: string; message?: { content?: unknown } };
  try {
    dato = JSON.parse(linea) as typeof dato;
  } catch {
    return [];
  }
  if (!dato || typeof dato !== "object") return [];
  const contenido = objetos(dato.message?.content);
  const voces: { tipo: TipoDeVoz; texto: string; ref?: string }[] = [];
  if (dato.type === "assistant") {
    for (const parte of contenido) {
      if (parte.type === "text" && typeof parte.text === "string") for (const r of parte.text.split("\n").filter((x) => x.trim()).slice(0, 6)) voces.push({ tipo: "texto", texto: corto(r) });
      if (parte.type === "thinking" && typeof parte.thinking === "string" && parte.thinking.trim()) voces.push({ tipo: "pensando", texto: corto(parte.thinking, 160) });
      if (parte.type === "tool_use" && typeof parte.name === "string") {
        const entrada = (parte.input ?? {}) as Record<string, unknown>;
        const ref = typeof parte.id === "string" ? { ref: parte.id } : {};
        if (ref.ref) nombres.set(ref.ref, parte.name);
        voces.push({ tipo: "herramienta", texto: herramientaEnUnaLinea(parte.name, entrada), ...ref });
        const diff = diffDe(parte.name, entrada);
        if (diff) voces.push({ tipo: "diff", texto: diff, ...ref });
        const tareas = parte.name === "TodoWrite" ? tareasDe(entrada) : null;
        if (tareas) voces.push({ tipo: "tareas", texto: tareas, ...ref });
      }
    }
  }
  // El agente se quedó sin contexto y resumió lo que llevaba. Importa decirlo: a partir de acá
  // «no se acuerda» de lo de antes con el mismo detalle, y sin el aviso parece que se volvió
  // tonto de golpe. Claude Code lo manda como un evento de sistema con subtype compact_boundary.
  if (dato.type === "system" && (dato as { subtype?: string }).subtype === "compact_boundary") {
    const porQue = (dato as { compact_metadata?: { trigger?: string } }).compact_metadata?.trigger;
    voces.push({
      tipo: "compactado",
      texto: porQue === "manual" ? "Resumí la charla porque me lo pediste." : "Me quedé sin contexto: resumí lo que llevábamos y sigo.",
    });
  }
  if (dato.type === "user") {
    for (const parte of contenido) {
      if (parte.type !== "tool_result") continue;
      const crudo = parte.content;
      const texto = typeof crudo === "string" ? crudo : Array.isArray(crudo) ? crudo.map((c) => (c as { text?: string }).text ?? "").join("\n") : "";
      const id = typeof parte.tool_use_id === "string" ? parte.tool_use_id : undefined;
      const ref = id ? { ref: id } : {};
      const nombre = id ? nombres.get(id) : undefined;
      if (id) nombres.delete(id);
      if (parte.is_error) {
        voces.push({ tipo: "error", texto: texto.trim() ? renglones(texto, 3) : "Falló", ...ref });
        continue;
      }
      const resumen = texto.trim() ? resultadoDe(nombre, texto) : null;
      // Sin nada que mostrar (una edición: el diff ya lo dijo), igual avisa que terminó bien.
      voces.push(resumen ? { tipo: "resultado", texto: resumen, ...ref } : { tipo: "listo", texto: "ok", ...ref });
    }
  }
  return voces;
}

/** Arma el oyente de la salida de un proceso: junta los trozos en líneas y cada línea en voces. */
export function oyenteDeClaude(donde: string): (trozo: string) => void {
  let resto = "";
  const nombres = new Map<string, string>();
  return (trozo) => {
    resto += trozo;
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) for (const v of vocesDeClaude(l, nombres)) decirVoz(donde, v.tipo, v.texto, undefined, v.ref);
  };
}
