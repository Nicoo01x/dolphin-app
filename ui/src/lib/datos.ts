import type { Candidato, Cosecha, Costo, Pasada } from "./tipos";

/**
 * La lógica que decide qué cuenta la pantalla, sin tocar el DOM: se puede
 * probar sin navegador y es donde viven las decisiones de lectura.
 */

export interface Escalon {
  readonly nombre: string;
  readonly costo: Costo;
}

/**
 * Los escalones del portón en el orden en que corrieron. Se recorren TODOS
 * los candidatos y no el primero: el primero pudo morir en el escalón 1
 * sin haber visto los demás.
 */
export function escalonesDe(cosecha: {
  readonly candidatos: readonly { readonly pasadas?: readonly Pick<Pasada, "verificador" | "costo">[] }[];
}): Escalon[] {
  const vistos = new Map<string, Escalon>();
  for (const c of cosecha.candidatos ?? []) {
    for (const p of c.pasadas ?? []) {
      if (!vistos.has(p.verificador)) vistos.set(p.verificador, { nombre: p.verificador, costo: p.costo });
    }
  }
  return [...vistos.values()];
}

export type EstadoDeFase = "paso" | "corto" | "salteada" | "nollego" | "corriendo";

/** Cómo se dice cada estado de una fase, para quien no ve el color. */
export const DICE_DE_FASE: Record<EstadoDeFase, string> = {
  paso: "pasó",
  corto: "se cortó",
  salteada: "se salteó",
  nollego: "no llegó",
  corriendo: "corriendo ahora",
};

/** El motivo de un veredicto sin la fase adelante ni la cruz que ya dice el color: «test: ✖ suma mal» → «suma mal». */
export function motivoDe(detalle: string, fase: string): string {
  return sinFase(detalle, fase).replace(/^[✖✕✗×]\s*/u, "");
}

/** Una fase del portón como la dibuja la tira: su estado, lo que tardó y lo que dijo. */
export interface FaseDibujada {
  readonly nombre: string;
  readonly costo: Costo;
  readonly estado: EstadoDeFase;
  /** Lo que tardaron todas sus vueltas. */
  readonly ms: number;
  /** Cuántas veces corrió: más de una, rebotó y se corrigió. */
  readonly vueltas: number;
  /** Lo que dijo la última vuelta, sin el nombre de la fase adelante. */
  readonly dijo: string;
  /** Lo que dijo cuando rebotó, si después se corrigió y pasó. */
  readonly rebote?: string;
}

/**
 * El portón de una rama, fase por fase y agrupado por costo (lo gratis
 * primero): lo que dibuja la tira. Manda la última vuelta de cada fase —una
 * que rebotó y se corrigió, pasó—, y lo que una corrección rompió y se
 * deshizo no cuenta como vuelta.
 */
export function portonDe(
  c: { readonly pasadas: readonly Pasada[] },
  escalones: readonly Escalon[],
  corriendo?: string,
): FaseDibujada[][] {
  const grupos: FaseDibujada[][] = [];
  for (const e of escalones) {
    const vueltas = c.pasadas.filter((p) => p.verificador === e.nombre && !p.deshecha);
    const ultima = vueltas.at(-1);
    const rebote = vueltas.length > 1 && ultima?.paso ? vueltas.find((p) => !p.paso) : undefined;
    const fase: FaseDibujada = {
      nombre: e.nombre,
      costo: e.costo,
      estado: corriendo === e.nombre ? "corriendo" : !ultima ? "nollego" : ultima.salteada ? "salteada" : ultima.paso ? "paso" : "corto",
      ms: vueltas.reduce((n, p) => n + (p.ms ?? 0), 0),
      vueltas: vueltas.length,
      dijo: ultima ? motivoDe(ultima.detalle, e.nombre) : "",
      ...(rebote ? { rebote: motivoDe(rebote.detalle, e.nombre) } : {}),
    };
    const grupo = grupos.at(-1);
    if (grupo && grupo[0]!.costo === fase.costo) grupo.push(fase);
    else grupos.push([fase]);
  }
  return grupos;
}

/**
 * Lo que costó una rama: escribirla y corregirla más sus fases pagas. Un
 * solo cálculo para la lista y el detalle: con dos, una decía «menos de
 * 1¢» y la otra «US$ 0,15» de la misma rama.
 */
export const costoDeRama = (c: Pick<Candidato, "pasadas" | "gastadoAgente">): number =>
  (c.gastadoAgente ?? 0) + c.pasadas.reduce((n, p) => n + (p.gastado ?? 0), 0);

/** Cómo le fue a un intento: lo eligió dolphin, pasó todas las fases, o se cortó. */
export const estadoDe = (c: Candidato, cosecha: Cosecha): "elegido" | "paso" | "corto" =>
  !c.vivo ? "corto" : cosecha.ganador?.universo.id === c.universo.id ? "elegido" : "paso";

export type FilaDeDiff =
  | { readonly tipo: "archivo"; readonly ruta: string; readonly agregadas: number; readonly quitadas: number }
  | { readonly tipo: "trozo"; readonly texto: string }
  | { readonly tipo: "linea"; readonly clase: "mas" | "menos" | "ctx"; readonly numero: number; readonly texto: string };

/**
 * El diff de git como lo lee una persona: una fila por archivo con lo que
 * sumó y sacó —sin «diff --git», «index» ni «---/+++», que son para git—,
 * los trozos como separadores, y cada línea con su número: el nuevo, o el
 * viejo si se sacó.
 */
export function filasDelDiff(texto: string): FilaDeDiff[] {
  const filas: FilaDeDiff[] = [];
  let archivo: { tipo: "archivo"; ruta: string; agregadas: number; quitadas: number } | undefined;
  let viejo = 0;
  let nuevo = 0;
  // Entre «diff --git» y el primer «@@» todo es para git (index, ---/+++, modos, renombres). Adentro de
  // un trozo, una línea quitada que empieza con «-- » es contenido aunque se vea como «--- ».
  let enCabecera = false;
  for (const linea of texto.split("\n")) {
    if (linea.startsWith("diff --git ")) {
      archivo = { tipo: "archivo", ruta: / b\/(.+)$/.exec(linea)?.[1] ?? linea.slice(11), agregadas: 0, quitadas: 0 };
      filas.push(archivo);
      enCabecera = true;
      continue;
    }
    const trozo = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(linea);
    if (trozo) {
      enCabecera = false;
      viejo = Number(trozo[1]);
      nuevo = Number(trozo[2]);
      filas.push({ tipo: "trozo", texto: trozo[3] ?? "" });
      continue;
    }
    // «\ No newline at end of file» tampoco es una línea del archivo.
    if (enCabecera || linea.startsWith("\\")) continue;
    if (linea.startsWith("+")) {
      if (archivo) archivo.agregadas++;
      filas.push({ tipo: "linea", clase: "mas", numero: nuevo++, texto: linea.slice(1) });
    } else if (linea.startsWith("-")) {
      if (archivo) archivo.quitadas++;
      filas.push({ tipo: "linea", clase: "menos", numero: viejo++, texto: linea.slice(1) });
    } else if (linea.startsWith(" ")) {
      filas.push({ tipo: "linea", clase: "ctx", numero: nuevo, texto: linea.slice(1) });
      viejo++;
      nuevo++;
    }
  }
  return filas;
}

/** El veredicto sin el nombre de su fase adelante: el exacto, no hasta los primeros dos puntos («test:oculto»). Igual que en el núcleo. */
export function sinFase(detalle: string, fase: string): string {
  if (detalle.startsWith(`${fase}:`)) return detalle.slice(fase.length + 1).trimStart();
  if (detalle.startsWith(`${fase} · `)) return detalle.slice(fase.length + 3);
  return detalle;
}

/**
 * El título de una tarea: su primera línea. Un pedido del modo live o uno de
 * la bandeja trae abajo el contexto para el agente, y eso no es el título.
 * Igual que en el núcleo (entrega.ts): es también el título del commit.
 */
export function tituloDeTarea(tarea: string): string {
  return tarea.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
}

/** Lo que sigue al título: lo que vio el agente además del pedido. Vacío si la tarea es de una línea. */
export function restoDeTarea(tarea: string): string {
  const lineas = tarea.split("\n");
  const titulo = lineas.findIndex((l) => l.trim() !== "");
  return titulo < 0 ? "" : lineas.slice(titulo + 1).join("\n").trim();
}

/**
 * Las fases que no corrieron en una rama: su última vuelta se salteó. Dejaron
 * pasar, pero no son fases pasadas. Igual que en el núcleo (porton.ts).
 */
export function fasesSalteadas(c: { readonly pasadas: readonly Pick<Pasada, "verificador" | "salteada" | "deshecha">[] }): string[] {
  const ultima = new Map<string, Pick<Pasada, "verificador" | "salteada">>();
  for (const p of c.pasadas) if (!p.deshecha) ultima.set(p.verificador, p);
  return [...ultima.values()].filter((p) => p.salteada).map((p) => p.verificador);
}

/** «sin revisión» · «sin pantalla ni vision»: lo que le faltó a una rama, dicho corto para un chip. */
export function sinLasSalteadas(fases: readonly string[]): string {
  return `sin ${fases.join(" ni ")}`;
}

/** Plata que puede no estar completa: si un motor no informó su costo, es un piso («al menos») y nunca un cero. */
export function plataDe(dolares: number, desconocido?: boolean): string {
  if (!desconocido) return plata(dolares);
  return dolares > 0 ? `al menos ${plata(dolares)}` : "sin dato";
}

/** «20.261 de entrada (13.312 del caché) · 1.204 de salida». */
export function tokensEnPalabras(t: { entrada: number; salida: number; cache?: number }): string {
  const n = (x: number) => x.toLocaleString("es-AR");
  return `${n(t.entrada)} de entrada${t.cache ? ` (${n(t.cache)} del caché)` : ""} · ${n(t.salida)} de salida`;
}

/** Dólares en voz humana. Nunca «$0.0000001»: abajo de un centavo es «menos de 1¢». */
export function plata(dolares: number): string {
  if (dolares === 0) return "US$ 0";
  if (dolares < 0.01) return "menos de 1¢";
  return `US$ ${dolares.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Milisegundos en voz humana: 850ms · 12s · 3 min · 2 h. */
export function reloj(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)} h`;
}

/** Una fecha ISO como la lee una persona: hoy 14:03 · ayer 09:41 · 12/10 18:20. */
export function cuandoFue(iso: string | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  // 24 horas, como se lee acá: «20:36», no «08:36 p. m.».
  const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(fecha, hoy)) return `hoy ${hora}`;
  if (mismoDia(fecha, ayer)) return `ayer ${hora}`;
  return `${fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

const UNIDADES = [
  { corte: 3_600_000, de: 60_000, uno: "1 minuto", varios: "%d minutos" },
  { corte: 86_400_000, de: 3_600_000, uno: "1 hora", varios: "%d horas" },
  { corte: 2_592_000_000, de: 86_400_000, uno: "1 día", varios: "%d días" },
  { corte: 31_536_000_000, de: 2_592_000_000, uno: "1 mes", varios: "%d meses" },
  { corte: Infinity, de: 31_536_000_000, uno: "1 año", varios: "%d años" },
] as const;

/**
 * Cuánto hace, en voz humana: recién · hace 13 minutos · hace 2 horas · hace 3 días.
 *
 * Es lo que va en una lista de issues: «hace 13 minutos» dice de una si algo está vivo, y
 * «31/10 14:03» hay que restarlo mentalmente. La fecha exacta sigue estando, al pasar el mouse.
 */
export function haceCuanto(iso: string | undefined, ahora: Date = new Date()): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  // Un reloj adelantado deja fechas «del futuro»: eso es recién, no «hace -3 minutos».
  const ms = Math.max(0, ahora.getTime() - fecha.getTime());
  if (ms < 60_000) return "recién";
  const unidad = UNIDADES.find((u) => ms < u.corte)!;
  const cuantas = Math.floor(ms / unidad.de);
  return `hace ${cuantas === 1 ? unidad.uno : unidad.varios.replace("%d", String(cuantas))}`;
}

/** A qué logo corresponde un modelo. Cosechas viejas sin modelo caen en Claude. */
export function logoDeModelo(modelo: string | undefined): { src: string; nombre: string } {
  const m = (modelo ?? "").toLowerCase();
  if (m.includes("gpt") || m.includes("openai") || m.includes("o3") || m.includes("codex"))
    return { src: "/logos/openai.svg", nombre: "OpenAI" };
  if (m.includes("gemini")) return { src: "/logos/gemini.svg", nombre: "Gemini" };
  if (m.includes("deepseek")) return { src: "/logos/deepseek.svg", nombre: "DeepSeek" };
  if (m.includes("qwen")) return { src: "/logos/qwen.svg", nombre: "Qwen" };
  if (m.includes("mistral") || m.includes("codestral")) return { src: "/logos/mistral.svg", nombre: "Mistral" };
  if (m.includes("grok")) return { src: "/logos/grok.svg", nombre: "Grok" };
  if (m.includes("llama") || m.includes("ollama")) return { src: "/logos/ollama.svg", nombre: "Ollama" };
  // El agente de prueba de Dolphin: no gasta un token y lleva el delfín, no el logo de otro.
  if (m === "demo") return { src: "/dolphin-blanco-128.png", nombre: "Demo" };
  if (m.includes("copilot")) return { src: "/logos/copilot.svg", nombre: "Copilot" };
  return { src: "/logos/claude.svg", nombre: "Claude" };
}

/** El ícono del lenguaje de un archivo; sin ícono, un badge con la extensión. */
export function iconoDeArchivo(ruta: string): { src?: string; rotulo: string } {
  const nombre = ruta.toLowerCase();
  const ext = nombre.slice(nombre.lastIndexOf(".") + 1);
  const MAPA: Record<string, string> = {
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    html: "html",
    htm: "html",
    css: "css",
    md: "markdown",
    mdx: "markdown",
    rs: "rust",
    go: "go",
    vue: "vue",
    svelte: "svelte",
  };
  if (ext === "tsx" || ext === "jsx") return { src: "/lenguajes/react.svg", rotulo: ext.toUpperCase() };
  const icono = MAPA[ext];
  if (icono) return { src: `/lenguajes/${icono}.svg`, rotulo: ext.toUpperCase() };
  return { rotulo: ext.length <= 4 && ext !== nombre ? ext.toUpperCase() : "·" };
}

/**
 * ¿La rama cambió tests que ya existían? Legítimo a veces; invisible, nunca.
 * Las cosechas nuevas lo traen medido (sumar tests no cuenta, sacarles
 * líneas o borrarlos sí); en las viejas se adivina por los archivos
 * tocados, que marca también al que solo sumó.
 */
export function tocoLosTests(
  forma: { tocados?: readonly { ruta: string }[]; testsCambiados?: readonly unknown[] } | undefined,
): boolean {
  if (forma?.testsCambiados !== undefined) return forma.testsCambiados.length > 0;
  return (forma?.tocados ?? []).some((a) => /(\.test\.|\.spec\.|(^|\/)tests?\/|__tests__)/i.test(a.ruta));
}

/** El error del navegador, dicho en castellano: «Failed to fetch» no le dice nada a nadie. */
export function motivoLegible(motivo: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(motivo)) {
    return "El servidor de dolphin no contesta.";
  }
  return `El servidor contestó mal (${motivo}).`;
}
