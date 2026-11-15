import type { Asunto } from "../nucleo/bandeja.js";
import type { Recuerdo } from "../nucleo/memoria.js";
import { anchoDeTexto, partirEnRenglones, recortar, type Bufer, type Rgb } from "./celdas.js";
import { haceCuanto, type CosechaEnLista, type Instantanea } from "./datos.js";
import { panel, pastilla, T, vacio, type Rect, type Zona } from "./piezas.js";

/**
 * Lo que ya pasó y lo que queda guardado: el historial de cosechas (con sus ramas y por qué ganó
 * la que ganó), la memoria del proyecto y la bandeja de ideas y errores. Lista a la izquierda,
 * detalle a la derecha; se leen de `.dolphin/`, igual que en la app de escritorio.
 */

export interface Fila {
  readonly marca: string;
  readonly colorMarca: Rgb;
  readonly texto: string;
  readonly nota?: string;
  readonly tenue?: boolean;
}

/** Una lista con selección y desplazamiento; devuelve las zonas de cada fila para el mouse. */
export function lista(b: Bufer, r: Rect, filas: readonly Fila[], seleccion: number, foco: boolean, elegir: (i: number) => void): Zona[] {
  const zonas: Zona[] = [];
  const desde = Math.max(0, Math.min(seleccion - Math.floor(r.h / 2), filas.length - r.h));
  for (let i = desde; i < filas.length && i - desde < r.h; i++) {
    const f = filas[i]!;
    const y = r.y + i - desde;
    const elegida = i === seleccion;
    if (elegida) b.rellenar(r.x - 1, y, r.w + 2, 1, foco ? T.pastilla : T.panelAlto);
    let c = r.x;
    c += b.texto(c, y, `${f.marca} `, { fg: f.colorMarca });
    const nota = f.nota ? ` ${f.nota}` : "";
    b.texto(c, y, recortar(f.texto, r.w - (c - r.x) - anchoDeTexto(nota)), { fg: f.tenue ? T.suave : T.texto, negrita: elegida });
    if (nota) b.texto(r.x + r.w - anchoDeTexto(nota), y, nota, { fg: T.tenue });
    zonas.push({ x: r.x - 1, y, w: r.w + 2, h: 1, accion: () => elegir(i) });
  }
  return zonas;
}

/** Párrafos con título en el panel de detalle. Devuelve el renglón donde terminó. */
export function parrafos(b: Bufer, r: Rect, bloques: readonly { titulo?: string; texto: string; color?: Rgb }[]): number {
  let y = r.y;
  for (const bloque of bloques) {
    if (y >= r.y + r.h) break;
    if (bloque.titulo) b.texto(r.x, y++, bloque.titulo, { fg: T.suave });
    for (const renglon of partirEnRenglones(bloque.texto, r.w)) {
      if (y >= r.y + r.h) break;
      b.texto(r.x, y++, renglon, { fg: bloque.color ?? T.texto });
    }
    y++;
  }
  return y;
}

export function partir(area: Rect): [Rect, Rect] {
  const izq = Math.max(34, Math.floor(area.w * 0.45));
  return [
    { x: area.x, y: area.y, w: izq, h: area.h },
    { x: area.x + izq, y: area.y, w: area.w - izq, h: area.h },
  ];
}

// --- Historial ---

const marcaDeCosecha = (c: CosechaEnLista): Fila => {
  const k = c.cosecha;
  const gano = !!k.ganador;
  const estado = k.mergeadaEn ? "mergeada" : k.descartadaEn ? "descartada" : k.pr ? "PR" : "";
  return {
    marca: gano ? "✓" : "×",
    colorMarca: gano ? T.verde : T.rojo,
    texto: k.tarea,
    nota: [estado, haceCuanto(k.cuando)].filter(Boolean).join(" · "),
    tenue: !!k.descartadaEn,
  };
};

export function vistaHistorial(b: Bufer, area: Rect, datos: Instantanea, seleccion: number, foco: boolean, elegir: (i: number) => void): Zona[] {
  const [ri, rd] = partir(area);
  const li = panel(b, ri, { titulo: `trabajos · ${datos.cosechas.length}`, foco });
  const ld = panel(b, rd, { titulo: "detalle" });
  if (datos.cosechas.length === 0) {
    vacio(b, li, "Todavía no hay trabajos guardados.", "Pedile algo a Dolphin desde el prompt.");
    return [];
  }
  const zonas = lista(b, li, datos.cosechas.map(marcaDeCosecha), seleccion, foco, elegir);
  const elegida = datos.cosechas[Math.min(seleccion, datos.cosechas.length - 1)];
  if (elegida) {
    const k = elegida.cosecha;
    let y = parrafos(b, ld, [
      { texto: k.tarea, color: T.texto },
      { titulo: "elegida", texto: k.ganador?.universo.rama ?? "ninguna: no pasó nadie", color: k.ganador ? T.verde : T.rojo },
      ...(k.porQueGano ? [{ titulo: "por qué", texto: k.porQueGano }] : []),
    ]);
    b.texto(ld.x, y++, "ramas", { fg: T.suave });
    for (const c of k.candidatos) {
      if (y >= ld.y + ld.h) break;
      const marca = c.vivo ? "✓" : "×";
      const cola = c.vivo ? `+${c.forma?.agregadas ?? 0} −${c.forma?.quitadas ?? 0} en ${c.forma?.archivos ?? 0}` : `se cortó en ${c.murioEn ?? "?"}`;
      let x = ld.x;
      x += b.texto(x, y, `${marca} ${c.universo.id} `, { fg: c.vivo ? T.verde : T.rojo });
      x += b.texto(x, y, recortar(c.enfoque ?? c.modelo ?? "", 18).padEnd(19), { fg: T.acento });
      b.texto(x, y++, recortar(cola, ld.w - (x - ld.x)), { fg: T.suave });
    }
    y++;
    const pie = [k.suscripcion ? "con suscripción" : `US$ ${k.gastado.toFixed(2)}`, `${(k.ms / 1000).toFixed(1)} s`, k.pr?.url ?? ""].filter(Boolean).join(" · ");
    if (y < ld.y + ld.h) b.texto(ld.x, y, recortar(pie, ld.w), { fg: T.tenue });
  }
  return zonas;
}

// --- Memoria ---

const TIPO: Record<NonNullable<Recuerdo["tipo"]>, string> = { regla: "regla", error: "error", decision: "decisión", nota: "nota" };
const QUIEN: Record<NonNullable<Recuerdo["origen"]>, string> = { owner: "vos", agente: "un agente", sistema: "Dolphin", sesion: "una sesión", untrusted: "alguien de afuera" };

export function vistaMemoria(b: Bufer, area: Rect, datos: Instantanea, seleccion: number, foco: boolean, elegir: (i: number) => void): Zona[] {
  const [ri, rd] = partir(area);
  const activos = datos.recuerdos.filter((r) => r.activo && !r.candidato).length;
  const li = panel(b, ri, { titulo: `memoria · ${activos} ${activos === 1 ? "activa" : "activas"}`, foco });
  const ld = panel(b, rd, { titulo: "recuerdo" });
  if (datos.recuerdos.length === 0) {
    vacio(b, li, "La memoria del proyecto está vacía.", "/memoria <regla> le enseña la primera.");
    return [];
  }
  const filas: Fila[] = datos.recuerdos.map((r) => ({
    marca: r.candidato ? "?" : r.activo ? "●" : "○",
    colorMarca: r.candidato ? T.amarillo : r.activo ? T.acento : T.tenue,
    texto: r.dicho,
    nota: r.candidato ? "espera tu ok" : TIPO[r.tipo ?? "regla"],
    tenue: !r.activo,
  }));
  const zonas = lista(b, li, filas, seleccion, foco, elegir);
  const r = datos.recuerdos[Math.min(seleccion, datos.recuerdos.length - 1)];
  if (r) {
    const y = parrafos(b, ld, [
      { texto: r.dicho },
      { titulo: "tipo", texto: `${TIPO[r.tipo ?? "regla"]} · ${r.activo ? "activa" : "apagada"}${r.origen ? ` · la trajo ${QUIEN[r.origen]}` : ""} · ${haceCuanto(r.creado)}` },
      ...(r.porQue ? [{ titulo: "por qué entró", texto: r.porQue }] : []),
      ...(r.patron ? [{ titulo: "lo que vigila en el código", texto: r.patron, color: T.acento }] : []),
      ...(r.conflictoCon ? [{ titulo: "choca con", texto: r.conflictoCon, color: T.amarillo }] : []),
    ]);
    if (y < ld.y + ld.h) b.texto(ld.x, ld.y + ld.h - 1, r.candidato ? "a  aprobarla · espacio  descartarla" : "espacio  prenderla o apagarla", { fg: T.tenue });
  }
  return zonas;
}

// --- Bandeja ---

/** Lo abierto primero (errores antes que ideas), después lo demás. */
export function asuntosOrdenados(asuntos: readonly Asunto[]): Asunto[] {
  const peso = (a: Asunto) => (a.estado === "abierto" || a.estado === "implementando" ? 0 : 2) + (a.tipo === "error" ? 0 : 1);
  return [...asuntos].sort((a, b) => peso(a) - peso(b) || b.creado.localeCompare(a.creado));
}

export function vistaBandeja(b: Bufer, area: Rect, datos: Instantanea, seleccion: number, foco: boolean, elegir: (i: number) => void): Zona[] {
  const [ri, rd] = partir(area);
  const asuntos = asuntosOrdenados(datos.asuntos);
  const abiertos = asuntos.filter((a) => a.estado === "abierto").length;
  const li = panel(b, ri, { titulo: `bandeja · ${abiertos} ${abiertos === 1 ? "abierto" : "abiertos"}`, foco });
  const ld = panel(b, rd, { titulo: "asunto" });
  if (asuntos.length === 0) {
    vacio(b, li, "La bandeja está vacía.", "/idea <idea> anota una para después.");
    return [];
  }
  const filas: Fila[] = asuntos.map((a) => ({
    marca: a.tipo === "error" ? "!" : "◆",
    colorMarca: a.estado !== "abierto" ? T.tenue : a.tipo === "error" ? T.rojo : T.amarillo,
    texto: a.titulo,
    nota: a.estado === "abierto" ? haceCuanto(a.creado) : a.estado,
    tenue: a.estado === "rechazado" || a.estado === "hecho",
  }));
  const zonas = lista(b, li, filas, seleccion, foco, elegir);
  const a = asuntos[Math.min(seleccion, asuntos.length - 1)];
  if (a) {
    pastilla(b, ld.x, ld.y, a.tipo === "error" ? "error" : "idea", T.fondo, a.tipo === "error" ? T.rojo : T.amarillo, true);
    b.texto(ld.x + 8, ld.y, recortar(`${a.estado} · trajo ${a.origen} · ${haceCuanto(a.creado)}`, ld.w - 8), { fg: T.suave });
    parrafos(b, { ...ld, y: ld.y + 2, h: ld.h - 3 }, [
      { texto: a.titulo },
      ...(a.detalle && a.detalle !== a.titulo ? [{ titulo: "qué es", texto: a.detalle }] : []),
      ...(a.propuesta ? [{ titulo: "cómo se haría acá", texto: a.propuesta, color: T.acento }] : []),
      ...(a.pasos?.length ? [{ titulo: "pasos", texto: a.pasos.map((p, i) => `${i + 1}. ${p}`).join("\n") }] : []),
      ...(a.donde ? [{ titulo: "dónde", texto: a.donde }] : []),
    ]);
    if (a.estado === "abierto") b.texto(ld.x, ld.y + ld.h - 1, "enter  hacerla con el equipo · r  rechazarla", { fg: T.tenue });
  }
  return zonas;
}
