/**
 * El informe verificable de una entrega: qué se pidió, con qué se comprobó, y —lo que nadie dice—
 * qué quedó SIN comprobar. Una fase salteada deja pasar la rama pero no es una fase pasada; un repo
 * sin tests no prueba el comportamiento; sin revisión, nadie más leyó el código; un cambio de pantalla
 * que nadie miró andando no está visto. Todo eso se dice explícito, en el PR, en el chat y en el parte.
 */

export interface FaseDelInforme {
  readonly nombre: string;
  readonly estado: "paso" | "fallo" | "salteada";
  readonly detalle?: string;
  readonly ms?: number;
}

export interface DatosDelInforme {
  readonly tarea: string;
  readonly fases: readonly FaseDelInforme[];
  /** Los archivos que tocó la entrega: con eso se sabe si cambió algo que se ve. */
  readonly tocados?: readonly string[];
  /** Videos del tester (en `.dolphin/videos/`). */
  readonly videos?: readonly string[];
  /** El oráculo de /objetivo, si hubo. */
  readonly oraculo?: { readonly comando: string; readonly paso: boolean; readonly salida?: string };
}

export interface Informe {
  /** Cómo decía el pedido que se sabe que quedó bien. Vacío si no lo decía. */
  readonly criterio: readonly string[];
  readonly comprobado: readonly string[];
  readonly sinComprobar: readonly string[];
  readonly pruebas: readonly string[];
}

const VISUAL = /\.(tsx|jsx|vue|svelte|astro|html?|css|scss|sass|less)$/i;
const unaLinea = (t?: string) => (t ?? "").split("\n")[0]!.trim();

/** El criterio de terminado que traía el pedido: «Está terminado cuando:» y sus viñetas, o el oráculo. */
export function criterioDelPedido(tarea: string): string[] {
  const lineas = tarea.split(/\r?\n/);
  const i = lineas.findIndex((l) => /^(est[aá] terminad[oa]|se da por logrado|criterio)/i.test(l.trim()));
  if (i < 0) return [];
  const encabezado = lineas[i]!.trim();
  const vinetas: string[] = [];
  for (const l of lineas.slice(i + 1)) {
    if (/^\s*[-*•]\s+/.test(l)) vinetas.push(l.replace(/^\s*[-*•]\s+/, "").trim());
    else if (l.trim() === "" && vinetas.length === 0) continue;
    else break;
  }
  // «Se da por logrado cuando este comando… sale en 0: `x`»: el criterio es esa misma línea.
  return vinetas.length > 0 ? vinetas : [encabezado.replace(/:$/, "")];
}

export function armarInforme(d: DatosDelInforme): Informe {
  const comprobado: string[] = [];
  const sinComprobar: string[] = [];
  for (const f of d.fases) {
    if (f.estado === "paso") comprobado.push(`${f.nombre}${f.ms !== undefined ? ` (${(f.ms / 1000).toFixed(1)} s)` : ""}`);
    else if (f.estado === "salteada") sinComprobar.push(`${f.nombre}: no corrió${f.detalle ? ` (${unaLinea(f.detalle).replace(/^[^:]+:\s*/, "")})` : ""}`);
  }
  if (d.oraculo?.paso) comprobado.push(`el oráculo \`${d.oraculo.comando}\``);

  const pasaron = new Set(d.fases.filter((f) => f.estado === "paso" && !/^tests? intactos$/.test(f.nombre.trim().toLowerCase())).map((f) => f.nombre.toLowerCase()));
  if (![...pasaron].some((n) => /test/.test(n)) && !d.oraculo?.paso) sinComprobar.push("ningún test: el comportamiento no lo probó nadie, solo que compila y se ve bien el código");
  if (!pasaron.has("revisión") && !pasaron.has("revision")) sinComprobar.push("nadie más leyó el código: no hubo revisión de otro modelo");
  const visual = (d.tocados ?? []).filter((t) => VISUAL.test(t));
  if (visual.length > 0 && !pasaron.has("pantalla") && !pasaron.has("vision")) {
    sinComprobar.push(`cambió lo que se ve (${visual.slice(0, 3).join(", ")}${visual.length > 3 ? "…" : ""}) y nadie miró la app andando`);
  }

  const pruebas = [
    ...(d.videos ?? []).map((v) => `video: .dolphin/videos/${v}`),
    ...(d.oraculo?.salida ? [`lo que dijo el oráculo: ${unaLinea(d.oraculo.salida.split("\n").at(-1))}`] : []),
  ];
  return { criterio: criterioDelPedido(d.tarea), comprobado, sinComprobar, pruebas };
}

/** Para el PR: secciones en Markdown. */
export function informeEnMarkdown(i: Informe): string {
  return [
    "### Cómo se sabe que quedó bien",
    "",
    ...(i.criterio.length > 0 ? i.criterio.map((c) => `- ${c}`) : ["- El pedido no lo decía: se juzgó con el portón."]),
    "",
    "### Lo que se comprobó",
    "",
    ...(i.comprobado.length > 0 ? i.comprobado.map((c) => `- ${c}`) : ["- Nada: no corrió ninguna fase."]),
    "",
    "### Lo que NO se comprobó",
    "",
    ...(i.sinComprobar.length > 0 ? i.sinComprobar.map((c) => `- ${c}`) : ["- Nada quedó afuera."]),
    ...(i.pruebas.length > 0 ? ["", "### Las pruebas", "", ...i.pruebas.map((p) => `- ${p}`)] : []),
  ].join("\n");
}

/** Para el chat y el parte: corto, con lo que no se comprobó siempre a la vista. */
export function informeEnTexto(i: Informe): string {
  const partes = [`Comprobado: ${i.comprobado.length > 0 ? i.comprobado.join(", ") : "nada"}.`];
  if (i.sinComprobar.length > 0) partes.push(`Sin comprobar: ${i.sinComprobar.join("; ")}.`);
  if (i.pruebas.length > 0) partes.push(i.pruebas.join(" · "));
  return partes.join("\n");
}

/** Las fases de una rama de la siembra, como las lee el informe (la última vuelta de cada una). */
export function fasesDePasadas(pasadas: readonly { verificador: string; paso: boolean; salteada?: boolean; detalle: string; ms: number; deshecha?: boolean }[]): FaseDelInforme[] {
  const ultima = new Map<string, FaseDelInforme>();
  for (const p of pasadas) {
    if (p.deshecha) continue;
    ultima.set(p.verificador, { nombre: p.verificador, estado: p.salteada ? "salteada" : p.paso ? "paso" : "fallo", detalle: p.detalle, ms: p.ms });
  }
  return [...ultima.values()];
}
