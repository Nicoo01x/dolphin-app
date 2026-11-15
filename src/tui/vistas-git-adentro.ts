import { partirEnRenglones, recortar, type Bufer } from "./celdas.js";
import type { EstadoGit, PasoGit } from "./git-estado.js";
import { panel, pastilla, T, vacio, type Rect, type Zona } from "./piezas.js";
import { detalle, fila, filaDeArchivo, filaDeCommit, pintarDiff, totalDeArchivos } from "./vistas-git.js";

/**
 * La sección Git cuando se entró a algo: los commits de una rama, los archivos de un commit o el
 * diff de un archivo. Arriba, las migas de por dónde se vino; tocar una vuelve hasta ahí.
 */

const RAIZ = { ramas: "Ramas", commits: "Commits", issues: "Issues" } as const;

const etiqueta = (p: PasoGit): string => (p.que === "rama" ? p.rama : p.que === "commit" ? `${p.hashCorto} ${p.mensaje}` : p.archivo);

function migas(b: Bufer, area: Rect, git: EstadoGit, volver: (pasos: number) => void): Zona[] {
  const zonas: Zona[] = [];
  const todas = [RAIZ[git.pestana], ...git.adentro.map(etiqueta)];
  let x = area.x + 1;
  for (const [i, m] of todas.entries()) {
    const ultima = i === todas.length - 1;
    const texto = recortar(m, ultima ? Math.max(8, area.x + area.w - x - 14) : 28);
    const ancho = ultima ? pastilla(b, x, area.y, texto, T.fondo, T.acento, true) : b.texto(x + 1, area.y, texto, { fg: T.suave }) + 1;
    if (!ultima) zonas.push({ x, y: area.y, w: ancho, h: 1, accion: () => volver(todas.length - 1 - i) });
    x += ancho;
    if (!ultima) x += b.texto(x, area.y, " › ", { fg: T.tenue });
  }
  const esc = "esc volver";
  b.texto(area.x + area.w - esc.length - 1, area.y, esc, { fg: T.tenue });
  zonas.push({ x: area.x + area.w - esc.length - 1, y: area.y, w: esc.length, h: 1, accion: () => volver(1) });
  return zonas;
}

/** Una lista que puede llevar renglones que no se eligen (el «ya en la base»), centrada en la fila elegida. */
function lista(b: Bufer, r: Rect, renglones: readonly (number | string)[], seleccion: number, pintar: (i: number, y: number) => void, elegir: (i: number) => void): Zona[] {
  const donde = Math.max(0, renglones.indexOf(seleccion));
  const desde = Math.max(0, Math.min(donde - Math.floor(r.h / 2), renglones.length - r.h));
  const zonas: Zona[] = [];
  for (let k = desde; k < renglones.length && k - desde < r.h; k++) {
    const y = r.y + k - desde;
    const renglon = renglones[k]!;
    if (typeof renglon === "string") {
      b.texto(r.x, y, recortar(renglon, r.w), { fg: T.tenue });
      continue;
    }
    pintar(renglon, y);
    zonas.push({ x: r.x - 1, y, w: r.w + 2, h: 1, accion: () => elegir(renglon) });
  }
  return zonas;
}

export function vistaGitAdentro(b: Bufer, area: Rect, git: EstadoGit, seleccion: number, foco: boolean, elegir: (i: number) => void, volver: (pasos: number) => void): Zona[] {
  const zonas = migas(b, area, git, volver);
  const cuerpo: Rect = { x: area.x, y: area.y + 2, w: area.w, h: area.h - 2 };
  const p = git.paso!;
  const d = git.delPaso();

  // Adentro de un archivo, el diff ocupa todo el ancho y se recorre con ↑↓.
  if (p.que === "archivo") {
    const caja = panel(b, cuerpo, { titulo: "diff", foco });
    git.altoDelDiff = caja.h;
    if (d === "cargando" || d === null) b.texto(caja.x, caja.y, "leyendo el diff…", { fg: T.tenue });
    else if ("error" in d) b.texto(caja.x, caja.y, recortar(`No pude leerlo: ${d.error}`, caja.w), { fg: T.rojo });
    else if (d.que === "diff") pintarDiff(b, caja, d.filas, seleccion, d.recortado);
    return zonas;
  }

  const izq = Math.max(40, Math.floor(cuerpo.w * 0.58));
  const ri: Rect = { ...cuerpo, w: izq };
  const rd: Rect = { x: cuerpo.x + izq, y: cuerpo.y, w: cuerpo.w - izq, h: cuerpo.h };
  const li = panel(b, ri, { titulo: p.que === "rama" ? "sus commits" : "sus archivos", foco });
  const ld = panel(b, rd, { titulo: p.que === "rama" ? "lo que cambió" : "diff" });

  if (d === "cargando" || d === null) return (b.texto(li.x, li.y, "leyendo…", { fg: T.tenue }), zonas);
  if ("error" in d) return (b.texto(li.x, li.y, recortar(`No pude leerlo: ${d.error}`, li.w), { fg: T.rojo }), zonas);

  if (d.que === "commits") {
    if (d.commits.length === 0) return (vacio(b, li, "Esta rama no tiene commits.", "esc para volver."), zonas);
    // Los propios arriba; lo que ya está en la base, después del separador y apagado.
    const propios = d.propios ?? d.commits.length;
    const renglones: (number | string)[] = d.commits.map((_, i) => i);
    if (propios > 0 && propios < d.commits.length) renglones.splice(propios, 0, "ya en la base");
    zonas.push(
      ...lista(b, li, renglones, seleccion, (i, y) => {
        const { izquierda, derecha } = filaDeCommit(d.commits[i]!, i >= propios);
        fila(b, li, y, izquierda, derecha, i === seleccion, foco);
      }, elegir),
    );
  } else if (d.que === "archivos") {
    // El mensaje entero arriba; la lista de archivos abajo.
    let y = li.y;
    for (const renglon of partirEnRenglones(d.mensaje.trim(), li.w).slice(0, Math.max(1, Math.floor(li.h / 4)))) b.texto(li.x, y++, renglon, { fg: T.texto });
    totalDeArchivos(b, li.x, ++y, d.archivos);
    y += 2;
    const r: Rect = { ...li, y, h: li.y + li.h - y };
    if (d.archivos.length === 0) b.texto(li.x, y, "Este commit no cambia archivos.", { fg: T.tenue });
    else zonas.push(...lista(b, r, d.archivos.map((_, i) => i), seleccion, (i, fy) => filaDeArchivo(b, r, fy, d.archivos[i]!, i === seleccion, foco), elegir));
  }

  detalle(b, { ...ld, h: ld.h - 1 }, git, seleccion);
  b.texto(ld.x, ld.y + ld.h - 1, recortar(p.que === "rama" ? "enter  ver sus archivos" : "enter  el diff entero", ld.w), { fg: T.tenue });
  return zonas;
}
