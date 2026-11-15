import { anchoDeTexto, mezclar, partirEnRenglones, recortar, type Bufer, type Rgb } from "./celdas.js";
import { haceCuanto } from "./datos.js";
import { PESTANAS_GIT, type EstadoGit, type FilaDiff, type PestanaGit } from "./git-estado.js";
import { panel, pastilla, T, vacio, type Rect, type Zona } from "./piezas.js";
import type { CambioDeArchivo, Commit, Persona, Rama } from "../nucleo/vista-git.js";

/**
 * La sección Git de la terminal, como lazygit: ramas, el grafo de commits e issues a la izquierda,
 * el detalle de lo elegido a la derecha. Cada persona con sus iniciales en un color propio; el grafo
 * con un color por carril. Verde solo para lo que terminó bien (una rama mergeada, un issue cerrado
 * y los renglones agregados), como en el resto de la app.
 */

/** Los colores de las personas y de los carriles: ni verde (es «salió bien») ni naranja (es «trabajando»). */
const PALETA: readonly Rgb[] = [T.azul, T.violeta, T.cian, T.rosa, [150, 170, 255], [120, 190, 255], [210, 160, 255], [255, 150, 190]];
const colorDe = (clave: string): Rgb => {
  let h = 0;
  for (const ch of clave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
};
const iniciales = (p: Persona): string =>
  (p.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => [...x][0]!.toUpperCase())
    .join("") || "?").padEnd(2);

const NOMBRE: Record<PestanaGit, string> = { ramas: "Ramas", commits: "Commits", issues: "Issues" };

/** Un tramo de texto con su color, para armar una fila de izquierda a derecha. */
export type Tramo = readonly [texto: string, fg: Rgb, negrita?: boolean];

export function fila(b: Bufer, r: Rect, y: number, izquierda: readonly Tramo[], derecha: readonly Tramo[], elegida: boolean, foco: boolean): void {
  if (elegida) b.rellenar(r.x - 1, y, r.w + 2, 1, foco ? T.pastilla : T.panelAlto);
  const anchoDerecha = derecha.reduce((s, [t]) => s + anchoDeTexto(t), 0);
  let x = r.x;
  const limite = r.x + r.w - anchoDerecha - 1;
  for (const [texto, fg, negrita] of izquierda) {
    if (x >= limite) break;
    x += b.texto(x, y, recortar(texto, limite - x), { fg, negrita: !!negrita || (elegida && fg === T.texto) });
  }
  let xd = r.x + r.w - anchoDerecha;
  for (const [texto, fg, negrita] of derecha) xd += b.texto(xd, y, texto, { fg, negrita: !!negrita });
}

export const personas = (lista: readonly Persona[], max = 3): Tramo[] => lista.slice(0, max).flatMap((p): Tramo[] => [[iniciales(p), colorDe(p.login ?? p.nombre), true], [" ", T.tenue]]);

// --- Las tres listas ---

function filaDeRama(r: Rama): { izquierda: Tramo[]; derecha: Tramo[] } {
  const marca: Tramo = r.actual ? ["● ", T.acento, true] : r.mergeada ? ["✓ ", T.verde] : r.adelante > 0 ? ["◆ ", T.amarillo] : ["  ", T.tenue];
  const izquierda: Tramo[] = [marca, [r.nombre, r.mergeada ? T.suave : T.texto, r.actual]];
  if (r.pr) izquierda.push(["  ", T.tenue], [`#${r.pr.numero}`, r.pr.estado === "open" ? T.azul : T.suave]);
  if (r.deDolphin) izquierda.push(["  dolphin", T.tenue]);
  const distancia: Tramo[] = r.adelante || r.atras ? [[`↑${r.adelante}`, r.adelante ? T.texto : T.tenue], [` ↓${r.atras}  `, T.tenue]] : [];
  return { izquierda, derecha: [...distancia, ...personas(r.autores, 2), [haceCuanto(r.fecha).padStart(9), T.tenue]] };
}

/** Los carriles del grafo, cada uno con su color; el nodo del commit, un punto. */
function pintarGrafo(b: Bufer, x: number, y: number, grafo: string, max: number): number {
  const letras = [...grafo].slice(0, max);
  letras.forEach((ch, i) => {
    const carril = PALETA[Math.floor(i / 2) % PALETA.length]!;
    b.poner(x + i, y, ch === "*" ? "●" : ch, { fg: ch === " " ? T.tenue : carril });
  });
  return letras.length;
}

function listaDelGrafo(b: Bufer, r: Rect, git: EstadoGit, seleccion: number, foco: boolean, elegir: (i: number) => void): Zona[] {
  const renglones = git.grafo ?? [];
  // Qué renglón del grafo es el commit elegido, para centrar la vista ahí.
  let n = -1;
  const indice = renglones.findIndex((x) => x.commit && ++n === seleccion);
  const desde = Math.max(0, Math.min(indice - Math.floor(r.h / 2), renglones.length - r.h));
  const zonas: Zona[] = [];
  let numero = renglones.slice(0, desde).filter((x) => x.commit).length;
  for (let i = desde; i < renglones.length && i - desde < r.h; i++) {
    const y = r.y + i - desde;
    const renglon = renglones[i]!;
    const c = renglon.commit;
    const elegida = !!c && numero === seleccion;
    if (elegida) b.rellenar(r.x - 1, y, r.w + 2, 1, foco ? T.pastilla : T.panelAlto);
    const anchoGrafo = pintarGrafo(b, r.x, y, renglon.grafo, 14);
    if (c) {
      const esta = numero;
      const izquierda: Tramo[] = [[`${c.hashCorto} `, T.tenue]];
      for (const ref of c.refs.slice(0, 2)) izquierda.push([` ${ref} `, ref.startsWith("origin/") ? T.suave : T.azul], [" ", T.tenue]);
      izquierda.push([c.mensaje, T.texto]);
      fila(b, { x: r.x + anchoGrafo + 1, y: r.y, w: r.w - anchoGrafo - 1, h: r.h }, y, izquierda, [...personas([c.autor], 1), [haceCuanto(c.fecha).padStart(9), T.tenue]], elegida, foco);
      zonas.push({ x: r.x - 1, y, w: r.w + 2, h: 1, accion: () => elegir(esta) });
      numero++;
    }
  }
  return zonas;
}

export function listaSimple<T>(b: Bufer, r: Rect, items: readonly T[], seleccion: number, foco: boolean, elegir: (i: number) => void, armar: (x: T) => { izquierda: Tramo[]; derecha: Tramo[] }): Zona[] {
  const desde = Math.max(0, Math.min(seleccion - Math.floor(r.h / 2), items.length - r.h));
  const zonas: Zona[] = [];
  for (let i = desde; i < items.length && i - desde < r.h; i++) {
    const y = r.y + i - desde;
    const { izquierda, derecha } = armar(items[i]!);
    fila(b, r, y, izquierda, derecha, i === seleccion, foco);
    zonas.push({ x: r.x - 1, y, w: r.w + 2, h: 1, accion: () => elegir(i) });
  }
  return zonas;
}

// --- El detalle ---

export function detalle(b: Bufer, r: Rect, git: EstadoGit, seleccion: number): void {
  if (git.pestana === "issues") {
    const i = git.issues?.[seleccion];
    if (!i) return;
    let y = r.y;
    for (const renglon of partirEnRenglones(i.titulo, r.w)) b.texto(r.x, y++, renglon, { fg: T.texto, negrita: true });
    y++;
    pastilla(b, r.x, y, i.abierto ? "abierto" : "cerrado", T.fondo, i.abierto ? T.acento : T.verde, true);
    b.texto(r.x + 11, y++, recortar(`#${i.numero} · ${haceCuanto(i.fecha)}${i.autor ? ` · lo abrió ${i.autor.nombre}` : ""}`, r.w - 11), { fg: T.suave });
    y++;
    if (i.etiquetas.length) (b.texto(r.x, y++, "etiquetas", { fg: T.tenue }), b.texto(r.x, y++, recortar(i.etiquetas.join(" · "), r.w), { fg: T.azul }), y++);
    if (i.asignados.length) (b.texto(r.x, y++, "asignados", { fg: T.tenue }), b.texto(r.x, y++, recortar(i.asignados.map((p) => p.nombre).join(", "), r.w), { fg: T.texto }), y++);
    b.texto(r.x, r.y + r.h - 1, recortar(`o  abrir en GitHub · ${i.url}`, r.w), { fg: T.tenue });
    return;
  }
  const d = git.detalle(seleccion);
  if (d === null) return;
  if (d === "cargando") return void b.texto(r.x, r.y, "leyendo…", { fg: T.tenue });
  if ("error" in d) return void b.texto(r.x, r.y, recortar(`No pude leerlo: ${d.error}`, r.w), { fg: T.rojo });
  let y = r.y;
  if (d.que === "commits") {
    const rama = git.ramas?.[seleccion];
    if (rama) {
      b.texto(r.x, y++, recortar(rama.nombre, r.w), { fg: T.texto, negrita: true });
      const base = !rama.mergeada && rama.adelante === 0 && rama.atras === 0;
      const propios = rama.adelante === 1 ? "1 commit que la base no tiene" : `${rama.adelante} commits que la base no tiene`;
      const estado = base ? "la rama base: sus últimos commits" : rama.mergeada ? "ya está en la base" : rama.adelante ? propios : "sin commits propios";
      b.texto(r.x, y++, recortar(estado, r.w), { fg: rama.mergeada ? T.verde : T.suave });
      y++;
    }
    // Los propios van arriba (vienen de `base..rama`, ver commitsDeLaRama); lo que sigue ya está en la base y se apaga.
    const propios = !rama || rama.mergeada || d.propios === undefined ? d.commits.length : d.propios;
    for (const [n, c] of d.commits.entries()) {
      if (y >= r.y + r.h) break;
      if (n === propios && n > 0) {
        b.texto(r.x, y++, recortar("ya en la base", r.w), { fg: T.tenue });
        if (y >= r.y + r.h) break;
      }
      let x = r.x;
      x += b.texto(x, y, `${c.hashCorto} `, { fg: T.tenue });
      const cola = ` ${haceCuanto(c.fecha)}`;
      b.texto(x, y, recortar(c.mensaje, r.w - (x - r.x) - anchoDeTexto(cola)), { fg: n < propios ? T.texto : T.suave });
      b.texto(r.x + r.w - anchoDeTexto(cola), y++, cola, { fg: T.tenue });
    }
    return;
  }
  if (d.que === "diff") return pintarDiff(b, r, d.filas, 0, d.recortado);
  for (const renglon of partirEnRenglones(d.mensaje.trim(), r.w).slice(0, Math.max(2, Math.floor(r.h / 3)))) b.texto(r.x, y++, renglon, { fg: T.texto });
  y++;
  if (y < r.y + r.h) totalDeArchivos(b, r.x, y++, d.archivos);
  for (const a of d.archivos) {
    if (y >= r.y + r.h) break;
    filaDeArchivo(b, { ...r, y }, y++, a, false, false);
  }
}

/** «3 archivos  +40 −12». */
export function totalDeArchivos(b: Bufer, x: number, y: number, archivos: readonly CambioDeArchivo[]): void {
  const total = archivos.reduce((s, a) => [s[0]! + a.agregadas, s[1]! + a.quitadas], [0, 0]);
  x += b.texto(x, y, `${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"}  `, { fg: T.suave });
  x += b.texto(x, y, `+${total[0]}`, { fg: T.verde });
  b.texto(x, y, ` −${total[1]}`, { fg: T.rojo });
}

export function filaDeArchivo(b: Bufer, r: Rect, y: number, a: CambioDeArchivo, elegida: boolean, foco: boolean): void {
  fila(b, r, y, [[`+${a.agregadas}`.padStart(5), T.verde], [` −${a.quitadas}`.padEnd(7), T.rojo], [a.archivo, T.texto]], [], elegida, foco);
}

/**
 * Un diff como se lee: sin la cabecera que es para git, cada trozo como separador y cada renglón con
 * su número (el nuevo, o el viejo si se sacó) y su fondo, verde lo que entró y rojo lo que se fue.
 */
export function pintarDiff(b: Bufer, r: Rect, filas: readonly FilaDiff[], desde: number, recortado: boolean): void {
  if (filas.length === 0) return void b.texto(r.x, r.y, "Este archivo no cambió de texto (un binario, o solo los permisos).", { fg: T.tenue });
  const fondoMas = mezclar(T.panel, T.verde, 0.14);
  const fondoMenos = mezclar(T.panel, T.rojo, 0.14);
  let y = r.y;
  for (const f of filas.slice(Math.max(0, Math.min(desde, filas.length - 1)))) {
    if (y >= r.y + r.h) return;
    if (f.clase === "trozo") {
      b.texto(r.x, y++, recortar(`      ··· ${f.texto}`, r.w), { fg: T.tenue });
      continue;
    }
    const bg = f.clase === "mas" ? fondoMas : f.clase === "menos" ? fondoMenos : undefined;
    if (bg) b.rellenar(r.x, y, r.w, 1, bg);
    b.texto(r.x, y, String(f.numero).padStart(5), { fg: T.tenue, bg });
    b.texto(r.x + 6, y, f.clase === "mas" ? "+" : f.clase === "menos" ? "−" : " ", { fg: f.clase === "mas" ? T.verde : T.rojo, bg });
    b.texto(r.x + 8, y++, recortar(f.texto.replace(/\t/g, "  "), r.w - 8), { fg: f.clase === "ctx" ? T.suave : T.texto, bg });
  }
  if (recortado && y < r.y + r.h) b.texto(r.x, y, "El diff sigue: es más largo de lo que se muestra acá.", { fg: T.tenue });
}

/** Un commit en una lista: el hash, el mensaje (apagado si ya está en la base), quién y cuándo. */
export const filaDeCommit = (c: Commit, apagado = false): { izquierda: Tramo[]; derecha: Tramo[] } => ({
  izquierda: [[`${c.hashCorto} `, T.tenue], [c.mensaje, apagado ? T.suave : T.texto]],
  derecha: [...personas([c.autor], 1), [haceCuanto(c.fecha).padStart(9), T.tenue]],
});

/** Las pestañas de adentro (Ramas · Commits · Issues) y las dos columnas. */
export function vistaGit(b: Bufer, area: Rect, git: EstadoGit, seleccion: number, foco: boolean, elegir: (i: number) => void, irA: (p: PestanaGit) => void): Zona[] {
  const zonas: Zona[] = [];
  let x = area.x + 1;
  for (const p of PESTANAS_GIT) {
    const cuenta = p === "ramas" ? git.ramas?.length : p === "commits" ? (git.grafo ? git.commitsDelGrafo().length : undefined) : git.issues?.length;
    const etiqueta = `${NOMBRE[p]}${cuenta === undefined ? "" : ` ${cuenta}`}`;
    const ancho = p === git.pestana ? pastilla(b, x, area.y, etiqueta, T.fondo, T.acento, true) : b.texto(x + 1, area.y, etiqueta, { fg: T.suave }) + 2;
    zonas.push({ x, y: area.y, w: ancho, h: 1, accion: () => irA(p) });
    x += ancho + 1;
  }
  if (git.error) b.texto(x + 2, area.y, recortar(`git no contestó: ${git.error}`, area.x + area.w - x - 2), { fg: T.rojo });

  const cuerpo: Rect = { x: area.x, y: area.y + 2, w: area.w, h: area.h - 2 };
  const izq = Math.max(40, Math.floor(cuerpo.w * 0.58));
  const ri: Rect = { ...cuerpo, w: izq };
  const rd: Rect = { x: cuerpo.x + izq, y: cuerpo.y, w: cuerpo.w - izq, h: cuerpo.h };
  const li = panel(b, ri, { titulo: git.pestana === "commits" ? "grafo de la rama actual" : NOMBRE[git.pestana].toLowerCase(), foco });
  const ld = panel(b, rd, { titulo: "detalle" });

  if (git.pestana === "ramas") {
    if (!git.ramas) return (b.texto(li.x, li.y, "leyendo las ramas…", { fg: T.tenue }), zonas);
    if (git.ramas.length === 0) return (vacio(b, li, "Este repo no tiene ramas todavía.", "Hacé el primer commit."), zonas);
    zonas.push(...listaSimple(b, li, git.ramas, seleccion, foco, elegir, filaDeRama));
  } else if (git.pestana === "commits") {
    if (!git.grafo) return (b.texto(li.x, li.y, "leyendo el historial…", { fg: T.tenue }), zonas);
    if (git.grafo.length === 0) return (vacio(b, li, "Esta rama no tiene commits.", "Hacé el primer commit."), zonas);
    zonas.push(...listaDelGrafo(b, li, git, seleccion, foco, elegir));
  } else {
    if (!git.issues) return (b.texto(li.x, li.y, "preguntándole a GitHub…", { fg: T.tenue }), zonas);
    if (git.issues.length === 0) return (vacio(b, li, git.sinIssues ? "Sin issues para mostrar" : "Este repo no tiene issues.", git.sinIssues ?? "Cuando los haya, aparecen acá."), zonas);
    zonas.push(
      ...listaSimple(b, li, git.issues, seleccion, foco, elegir, (i) => ({
        izquierda: [[i.abierto ? "○ " : "✓ ", i.abierto ? T.acento : T.verde], [`#${i.numero} `, T.tenue], [i.titulo, i.abierto ? T.texto : T.suave], ...i.etiquetas.slice(0, 2).map((e): Tramo => [`  ${e}`, T.azul])],
        derecha: [...personas(i.asignados, 2), [haceCuanto(i.fecha).padStart(9), T.tenue]],
      })),
    );
  }
  // Abajo del detalle, cómo se entra: de la rama a sus commits, del commit a sus archivos.
  const entrar = git.pestana === "ramas" ? "enter  ver sus commits" : git.pestana === "commits" ? "enter  ver sus archivos" : null;
  detalle(b, entrar ? { ...ld, h: ld.h - 1 } : ld, git, seleccion);
  if (entrar) b.texto(ld.x, ld.y + ld.h - 1, recortar(entrar, ld.w), { fg: T.tenue });
  return zonas;
}
