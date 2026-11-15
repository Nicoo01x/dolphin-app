import { anchoDeTexto, mezclar, recortar, type Bufer, type Rgb } from "./celdas.js";
import { pintarDelfin3d } from "./delfin3d.js";
import { ETAPAS_DE_EQUIPO, progresoDe, type EstadoEquipo, type TareaDeEquipo } from "./equipo-estado.js";
import { COLOR_DE_MASCOTA, mascotaDe, pintarMascota, type Animo, type Mascota } from "./mascotas.js";
import { barra, brillo, colorDeDueno, giro, panel, pastilla, reloj, T, vacio, type Rect, type Zona } from "./piezas.js";
import type { CambiosDeCompanero } from "../equipo/equipo.js";
import type { RenglonDeTerminal, Sesion } from "./sesion.js";
import { lineasDeTerminal, partirHerramienta, pintarLinea } from "./transcripcion.js";

/**
 * El equipo como en la app de escritorio: un cuadradito por agente (el líder, cada compañero, el
 * revisor), cada uno con su mascota moviéndose según lo que hace, y al entrar a uno, su terminal en
 * vivo: lo que lee, lo que edita, los comandos que corre y lo que le contesta el portón.
 */

export interface Tarjeta {
  /** La clave de su terminal en la sesión: «lider», el id de la tarea o «revisor». */
  readonly clave: string;
  readonly nombre: string;
  readonly modelo: string;
  readonly mascota: Mascota;
  readonly animo: Animo;
  readonly estado: string;
  readonly color: Rgb;
  readonly progreso: number;
  readonly detalle: string;
}

const animoDeTarea = (x: TareaDeEquipo): Animo =>
  x.estado === "trabajando" ? "trabaja" : x.estado === "lista" || x.estado === "integrada" ? "lista" : x.estado === "esperando" || x.estado === "deshecha" ? "espera" : "fallo";

const ESTADO: Record<TareaDeEquipo["estado"], string> = {
  esperando: "espera",
  trabajando: "trabaja",
  lista: "lista",
  integrada: "integrada",
  "no-salio": "no salió",
  "en-conflicto": "conflicto",
  choco: "chocó",
  deshecha: "deshecha",
};

const ESTADO_COMPANERO: Record<NonNullable<TareaDeEquipo["estadoCompanero"]>, string> = {
  trabajando: "trabajando",
  esperando: "esperando",
  libre: "libre",
  terminado: "terminado",
};

/** Los cuadraditos, en orden: el líder, los compañeros y el revisor. */
export function tarjetasDelEquipo(equipo: EstadoEquipo, agente: string): Tarjeta[] {
  const enPlan = !equipo.etapa || equipo.etapa === "plan" || equipo.etapa === "spawn";
  const integrando = equipo.etapa === "merge";
  const lider: Tarjeta = {
    clave: "lider",
    nombre: "líder",
    modelo: equipo.lider ?? agente,
    mascota: mascotaDe(equipo.lider, agente, true),
    animo: equipo.fin ? (equipo.fin.rama ? "lista" : "fallo") : enPlan || integrando ? "trabaja" : "espera",
    estado: equipo.fin ? (equipo.fin.rama ? "listo" : "no salió") : enPlan ? "parte la tarea" : integrando ? "integra" : "coordina",
    color: COLOR_DE_MASCOTA[mascotaDe(equipo.lider, agente, true)],
    progreso: equipo.tareas.length ? equipo.tareas.filter((x) => x.estado === "integrada").length / equipo.tareas.length : 0,
    detalle: equipo.resumen ?? "",
  };
  const companeros = equipo.tareas.map((x): Tarjeta => ({
    clave: x.id,
    nombre: x.dueno,
    modelo: x.modelo ?? agente,
    mascota: mascotaDe(x.modelo, agente),
    animo: animoDeTarea(x),
    estado: `${ESTADO[x.estado]} · ${ESTADO_COMPANERO[x.estadoCompanero ?? "esperando"]}`,
    color: colorDeDueno(x.dueno),
    progreso: progresoDe(x),
    detalle: x.titulo,
  }));
  const revisando = equipo.finales.some((f) => f.estado === "corre");
  const revision = equipo.finales.find((f) => f.verificador === "revisión");
  const revisor: Tarjeta = {
    clave: "revisor",
    nombre: "revisor",
    modelo: equipo.revisor ?? agente,
    mascota: mascotaDe(equipo.revisor, agente),
    animo: revisando ? "trabaja" : revision?.estado === "paso" ? "lista" : revision?.estado === "fallo" ? "fallo" : "espera",
    estado: revisando ? "revisa" : revision?.estado === "paso" ? "aceptó" : revision?.estado === "fallo" ? "rechazó" : "espera",
    color: T.suave,
    progreso: equipo.finales.length ? equipo.finales.filter((f) => f.estado !== "corre").length / Math.max(1, equipo.finales.length) : 0,
    detalle: "portón y revisión de lo integrado",
  };
  return [lider, ...companeros, revisor];
}

/** Claude × Dolphin: la mascota del que dirige y el delfín, juntos y moviéndose. */
export function pintarDupla(b: Bufer, x: number, y: number, mascota: Mascota, t: number, animo: Animo, fondo: Rgb): number {
  pintarMascota(b, x, y, 14, 5, mascota, t, animo, fondo);
  b.texto(x + 15, y + 2, "×", { fg: T.suave, negrita: true });
  // Acá solo gira: el salto lo achica y en 5 renglones no se lo vería.
  pintarDelfin3d(b, x + 17, y, 14, 5, t + 900, { vueltasPorSegundo: animo === "trabaja" ? 0.45 : 0.15, cadaSalto: 0 });
  return 31;
}

const ANIMO_A_COLOR: Record<Animo, Rgb> = { espera: T.tenue, trabaja: T.naranja, lista: T.verde, fallo: T.rojo };

/** Una tarjeta: la mascota arriba, el nombre y el estado, el modelo y una barra. */
function tarjeta(b: Bufer, r: Rect, x: Tarjeta, elegida: boolean, t: number, ultima?: RenglonDeTerminal, archivos?: ReadonlySet<string>): void {
  const deshacible = x.estado === "integrada";
  const dentro = panel(b, r, { foco: elegida, ...(elegida ? { titulo: deshacible ? "enter · d deshacer" : "enter: su terminal" } : {}) });
  pintarMascota(b, dentro.x, dentro.y, dentro.w, 5, x.mascota, t, x.animo, T.panel);
  const y = dentro.y + 5;
  b.texto(dentro.x, y, recortar(x.nombre, dentro.w - 12), { fg: x.color, negrita: true });
  const estado = x.animo === "trabaja" ? `${giro(t + x.clave.length * 97)} ${x.estado}` : x.estado;
  b.texto(dentro.x + dentro.w - anchoDeTexto(estado), y, estado, { fg: ANIMO_A_COLOR[x.animo] });
  // Con candados, el modelo cede el lugar a lo que toca: los archivos dicen más que el nombre del modelo.
  const toca = archivos && archivos.size > 0 ? `toca ${[...archivos].map((a) => a.split("/").pop()).join(", ")}` : `${x.modelo} · ${x.detalle}`;
  b.texto(dentro.x, y + 1, recortar(toca, dentro.w), { fg: archivos && archivos.size > 0 ? T.suave : T.tenue });
  if (dentro.h >= 8) {
    if (x.animo === "trabaja" && ultima) b.texto(dentro.x, y + 2, recortar(enUnaLinea(ultima), dentro.w), { fg: T.suave });
    else barra(b, dentro.x, y + 2, dentro.w, x.progreso, ANIMO_A_COLOR[x.animo]);
  }
}

export function vistaEquipo(b: Bufer, area: Rect, sesion: Sesion, elegida: number, t: number, alElegir: (i: number) => void): Zona[] {
  const equipo = sesion.equipo;
  const principal = sesion.lider ?? (sesion.config.agente === "mentira" ? "demo" : "opus");
  if (!equipo) {
    const r = panel(b, area, { titulo: "equipo" });
    const ancho = 31;
    // Sin equipo todavía: la dupla de siempre, la mascota del motor × Dolphin (con el de mentira, la de Claude).
    const mascota = mascotaDe(principal === "demo" ? "opus" : principal, sesion.config.agente === "mentira" ? "claude" : sesion.config.agente, true);
    pintarDupla(b, r.x + Math.floor((r.w - ancho) / 2), r.y + Math.max(0, Math.floor(r.h / 2) - 6), mascota, t, "espera", T.panel);
    vacio(b, { ...r, y: r.y + 2, h: r.h }, "Todavía no armaste ningún equipo.", `Escribí un proyecto abajo. El modelo principal es ${principal} (/lider para cambiarlo).`);
    return [];
  }
  const terminado = !!equipo.fin;
  const transcurrido = (equipo.fin ? equipo.desde + equipo.fin.ms : t) - equipo.desde;

  // Arriba: el objetivo, la tira de etapas y la dupla Claude × Dolphin.
  const cabeza = panel(b, { x: area.x, y: area.y, w: area.w, h: 7 }, { titulo: "equipo", foco: !terminado });
  if (equipo.fin?.rama && equipo.fin.ruta) b.texto(cabeza.x, cabeza.y + 1, "r: revisar e integrar", { fg: T.tenue });
  const anchoDupla = cabeza.w >= 80 ? pintarDupla(b, cabeza.x + cabeza.w - 31, cabeza.y, mascotaDe(equipo.lider, equipo.agente, true), t, terminado ? (equipo.fin?.rama ? "lista" : "fallo") : "trabaja", T.panel) + 2 : 0;
  const textoW = cabeza.w - anchoDupla;
  b.texto(cabeza.x, cabeza.y, recortar(equipo.objetivo, textoW), { fg: T.texto, negrita: true });
  let col = cabeza.x;
  const actual = equipo.etapa ? ETAPAS_DE_EQUIPO.indexOf(equipo.etapa) : -1;
  for (const [k, etapa] of ETAPAS_DE_EQUIPO.entries()) {
    if (k > 0) col += b.texto(col, cabeza.y + 2, " › ", { fg: T.tenue });
    const hecha = k < actual || (terminado && k <= actual);
    col += k === actual && !terminado ? pastilla(b, col, cabeza.y + 2, etapa, T.fondo, T.naranja, true) : b.texto(col, cabeza.y + 2, etapa, { fg: hecha ? T.verde : T.tenue, negrita: hecha });
  }
  const resumen = `líder ${equipo.lider ?? equipo.agente} · ${equipo.tareas.length} compañeros · ${reloj(transcurrido)}${equipo.fin?.gastado ? ` · US$ ${equipo.fin.gastado.toFixed(2)}` : ""}`;
  b.texto(cabeza.x, cabeza.y + 4, recortar(resumen, textoW), { fg: T.suave });
  if (equipo.fin) {
    const final = equipo.fin.rama ? ` ✓ ${equipo.fin.rama} ` : ` × ${equipo.fin.porQue} `;
    b.texto(cabeza.x + Math.min(textoW - 2, anchoDeTexto(resumen) + 2), cabeza.y + 4, recortar(final, Math.max(0, textoW - anchoDeTexto(resumen) - 2)), { fg: T.fondo, bg: equipo.fin.rama ? T.verde : T.rojo, negrita: true });
  }

  // Los cuadraditos: tantas columnas como entren, de 26 de ancho como mínimo.
  const tarjetas = tarjetasDelEquipo(equipo, equipo.agente);
  const grilla: Rect = { x: area.x, y: area.y + 7, w: area.w, h: area.h - 7 };
  const columnas = Math.max(1, Math.min(tarjetas.length, Math.floor(grilla.w / 26)));
  const anchoT = Math.floor(grilla.w / columnas);
  const altoT = grilla.h >= 22 ? 11 : 10;
  const zonas: Zona[] = [];
  tarjetas.forEach((x, i) => {
    const r: Rect = { x: grilla.x + (i % columnas) * anchoT, y: grilla.y + Math.floor(i / columnas) * altoT, w: anchoT, h: altoT };
    if (r.y + r.h > grilla.y + grilla.h) return;
    tarjeta(b, r, x, i === elegida, t, sesion.terminales.get(x.clave)?.findLast((v) => v.tipo !== "listo"), sesion.archivosDe.get(x.clave));
    zonas.push({ ...r, accion: () => alElegir(i) });
  });

  // Lo que sobra abajo: la línea de tiempo por rol (con los candados que chocan) y el log.
  const filas = Math.ceil(tarjetas.length / columnas);
  const libre = grilla.h - filas * altoT;
  const abajoY = grilla.y + filas * altoT;
  const anchoTiempo = area.w >= 110 && libre >= 5 ? Math.floor(area.w * 0.48) : 0;
  if (anchoTiempo > 0) lineaDeTiempo(b, { x: area.x, y: abajoY, w: anchoTiempo, h: libre }, equipo, tarjetas, sesion.choques, t);
  if (libre >= 4) {
    const log = panel(b, { x: area.x + anchoTiempo, y: abajoY, w: area.w - anchoTiempo, h: libre }, { titulo: "log" });
    for (const [i, r] of equipo.log.slice(-log.h).entries()) {
      let c = log.x;
      c += b.texto(c, log.y + i, reloj(r.t - equipo.desde), { fg: T.tenue }) + 1;
      c += b.texto(c, log.y + i, r.quien.padEnd(9), { fg: r.quien === "líder" ? T.naranja : r.quien === "revisor" || r.quien === "portón" ? T.amarillo : colorDeDueno(r.quien), negrita: true });
      b.texto(c, log.y + i, recortar(r.texto, log.w - (c - log.x)), { fg: r.tono === "bien" ? T.verde : r.tono === "mal" ? T.rojo : r.tono === "aviso" ? T.amarillo : T.texto });
    }
  }
  return zonas;
}

/**
 * La línea de tiempo por rol: una fila por agente, con cuándo trabajó (de cuando arrancó el equipo a
 * ahora). Abajo, los candados que chocan: el mismo archivo tocado por dos compañeros.
 */
function lineaDeTiempo(b: Bufer, r: Rect, equipo: EstadoEquipo, tarjetas: readonly Tarjeta[], choques: readonly { archivo: string; quienes: string[] }[], t: number): void {
  const dentro = panel(b, r, { titulo: "línea de tiempo" });
  const fin = equipo.fin ? equipo.desde + equipo.fin.ms : t;
  const total = Math.max(1, fin - equipo.desde);
  const anchoBarra = Math.max(8, dentro.w - 11);
  const col = (ms: number) => Math.max(0, Math.min(anchoBarra - 1, Math.floor(((ms - equipo.desde) / total) * anchoBarra)));
  const lugarParaChoques = choques.length > 0 ? Math.min(choques.length, 2) + 1 : 0;
  const filas = tarjetas.slice(0, Math.max(0, dentro.h - lugarParaChoques));
  filas.forEach((x, i) => {
    const y = dentro.y + i;
    b.texto(dentro.x, y, recortar(x.nombre, 9).padEnd(10), { fg: x.color, negrita: true });
    for (let c = 0; c < anchoBarra; c++) b.poner(dentro.x + 10 + c, y, "·", { fg: T.linea });
    const tarea = equipo.tareas.find((tt) => tt.id === x.clave);
    // El líder trabaja al principio (el plan) y al final (integra); el revisor, al final; cada compañero, su tramo.
    const tramos: [number, number][] =
      x.clave === "lider"
        ? [[equipo.desde, equipo.tareas.find((tt) => tt.empezo)?.empezo ?? fin]]
        : x.clave === "revisor"
          ? equipo.finales.length > 0 ? [[Math.min(...equipo.tareas.map((tt) => tt.termino ?? fin)), fin]] : []
          : tarea?.empezo ? [[tarea.empezo, tarea.termino ?? fin]] : [];
    for (const [desde, hasta] of tramos) for (let c = col(desde); c <= col(hasta); c++) b.poner(dentro.x + 10 + c, y, "█", { fg: ANIMO_A_COLOR[x.animo] === T.tenue ? x.color : ANIMO_A_COLOR[x.animo] });
  });
  choques.slice(0, 2).forEach((ch, i) => {
    b.texto(dentro.x, dentro.y + dentro.h - Math.min(choques.length, 2) + i, recortar(`▲ ${ch.archivo}: ${ch.quienes.map((q) => tarjetas.find((x) => x.clave === q)?.nombre ?? q).join(" y ")}`, dentro.w), { fg: T.amarillo });
  });
}

// --- Revisar lo que hizo el equipo: por compañero, archivo por archivo ---

/**
 * La rama del equipo agrupada por quién hizo qué: cada compañero con los archivos de su merge y lo que
 * sumó y sacó. Desde acá se integra a tu rama o se descarta (con una segunda x, por las dudas).
 */
export function vistaRevision(b: Bufer, area: Rect, sesion: Sesion, cambios: readonly CambiosDeCompanero[], confirmarDescarte: boolean): void {
  const equipo = sesion.equipo;
  const r = panel(b, area, { titulo: "revisar lo que hizo el equipo", foco: true });
  if (!equipo?.fin?.rama) {
    vacio(b, r, "No hay una rama del equipo para revisar.", "Cuando un equipo pase el portón, la revisás acá.");
    return;
  }
  const destino = equipo.fin.ramaBase ?? "tu rama";
  b.texto(r.x, r.y, recortar(`${equipo.fin.rama} → ${destino}`, r.w), { fg: T.texto, negrita: true });
  const total = cambios.reduce((s, c) => ({ mas: s.mas + c.agregadas, menos: s.menos + c.quitadas, archivos: s.archivos + c.archivos.length }), { mas: 0, menos: 0, archivos: 0 });
  let c = r.x;
  c += b.texto(c, r.y + 1, `+${total.mas}`, { fg: T.verde });
  c += b.texto(c, r.y + 1, ` −${total.menos}`, { fg: T.rojo });
  b.texto(c, r.y + 1, ` en ${total.archivos} archivo${total.archivos === 1 ? "" : "s"} · ${cambios.length} compañero${cambios.length === 1 ? "" : "s"} · ${equipo.fin.porQue}`, { fg: T.suave });

  let y = r.y + 3;
  const fin = r.y + r.h - 2;
  for (const grupo of cambios) {
    if (y >= fin) break;
    const x = equipo.tareas.find((t) => t.id === grupo.id);
    const nombre = x?.dueno ?? grupo.id;
    let col = r.x;
    col += b.texto(col, y, "● ", { fg: colorDeDueno(nombre) });
    col += b.texto(col, y, nombre, { fg: colorDeDueno(nombre), negrita: true });
    col += b.texto(col, y, `  ${x?.titulo ?? ""}  `, { fg: T.texto });
    col += b.texto(col, y, `+${grupo.agregadas}`, { fg: T.verde });
    b.texto(col, y, ` −${grupo.quitadas}`, { fg: T.rojo });
    y++;
    for (const a of grupo.archivos) {
      if (y >= fin) break;
      const cifras = `+${a.agregadas} −${a.quitadas}`;
      b.texto(r.x + 4, y, recortar(a.ruta, r.w - 6 - cifras.length), { fg: T.suave });
      b.texto(r.x + r.w - cifras.length, y, `+${a.agregadas}`, { fg: T.verde });
      b.texto(r.x + r.w - cifras.length + `+${a.agregadas}`.length, y, ` −${a.quitadas}`, { fg: T.rojo });
      y++;
    }
    y++;
  }
  const deshechas = equipo.tareas.filter((t) => t.estado === "deshecha");
  if (deshechas.length > 0 && y < fin) b.texto(r.x, y, recortar(`Deshechas: ${deshechas.map((t) => t.dueno).join(", ")} (no entran)`, r.w), { fg: T.tenue });

  const pie = confirmarDescarte
    ? "x otra vez para descartar la rama · cualquier otra tecla lo deja"
    : equipo.fin.ruta
      ? `i integrar a ${destino} · x descartar · esc volver`
      : "esc volver";
  b.texto(r.x, r.y + r.h - 1, recortar(pie, r.w), { fg: confirmarDescarte ? T.amarillo : T.suave, negrita: confirmarDescarte });
}

// --- La terminal de un agente ---

/** Lo último que hizo un agente, en una línea para su tarjeta. */
function enUnaLinea(r: RenglonDeTerminal): string {
  if (r.tipo === "herramienta") {
    const { nombre, arg } = partirHerramienta(r.texto);
    return arg ? `${nombre}(${arg})` : nombre;
  }
  const renglones = r.texto.split("\n");
  if (r.tipo === "tareas") {
    const enCurso = renglones.find((x) => x.startsWith("[~]")) ?? renglones.find((x) => x.startsWith("[ ]")) ?? renglones[0] ?? "";
    return `tarea: ${enCurso.slice(4)}`;
  }
  return r.tipo === "diff" ? `editó: ${renglones[0] ?? ""}` : renglones[0] ?? "";
}

export function vistaTerminal(b: Bufer, area: Rect, sesion: Sesion, x: Tarjeta, t: number, desplazamiento: number): void {
  const r = panel(b, area, { titulo: `terminal · ${x.nombre} · ${x.modelo}`, foco: true });
  pintarMascota(b, r.x, r.y, 14, 5, x.mascota, t, x.animo, T.panel);
  b.texto(r.x + 16, r.y + 1, x.nombre, { fg: x.color, negrita: true });
  const estado = x.animo === "trabaja" ? `${giro(t)} ${x.estado}` : x.estado;
  b.texto(r.x + 17 + anchoDeTexto(x.nombre), r.y + 1, estado, { fg: ANIMO_A_COLOR[x.animo] });
  b.texto(r.x + 16, r.y + 2, recortar(x.detalle, r.w - 16), { fg: T.suave });
  b.texto(r.x + 16, r.y + 3, recortar(`${x.modelo} · esc para volver al equipo · repág para subir`, r.w - 16), { fg: T.tenue });
  for (let i = r.x; i < r.x + r.w; i++) b.poner(i, r.y + 5, "─", { fg: T.linea });

  const renglones = sesion.terminales.get(x.clave) ?? [];
  const alto = r.h - 7;
  if (renglones.length === 0) {
    b.texto(r.x, r.y + 7, x.animo === "espera" ? "Todavía no arrancó." : "Sin nada para mostrar todavía.", { fg: T.tenue });
    return;
  }
  const lineas = lineasDeTerminal(renglones, r.w, t, x.animo === "trabaja");
  const fin = Math.max(0, lineas.length - desplazamiento);
  const desdeLinea = Math.max(0, fin - alto);
  for (let i = desdeLinea; i < fin; i++) {
    const l = lineas[i]!;
    // Lo que recién llega entra fundiéndose desde el panel.
    pintarLinea(b, r.x, r.y + 7 + (i - desdeLinea), r.w, l, T.panel, Math.min(1, Math.max(0, (t - l.t) / 220)));
  }
  // Mientras trabaja, abajo, el «✻ trabajando» de Claude Code con el tiempo que lleva.
  if (x.animo === "trabaja" && desplazamiento === 0 && fin - desdeLinea < alto) {
    const y = r.y + 7 + (fin - desdeLinea) + 1;
    if (y < r.y + r.h) {
      b.poner(r.x, y, giro(t), { fg: T.naranja });
      brillo(b, r.x + 2, y, `${x.estado}…`, t, T.naranjaTenue, T.naranja);
    }
  }
  if (desplazamiento > 0) b.texto(r.x + r.w - 18, r.y + 6, ` ↓ ${desplazamiento} renglones `, { fg: T.fondo, bg: T.suave });
}
