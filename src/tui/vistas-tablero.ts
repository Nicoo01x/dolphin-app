import { COLUMNAS, NOMBRE_DE_COLUMNA, type Columna, type Tarjeta } from "../nucleo/tarjetas.js";
import { laFrenan } from "../nucleo/tarjetas-espera.js";
import { recortar, type Bufer, type Rgb } from "./celdas.js";
import { haceCuanto, type Instantanea } from "./datos.js";
import { lista, parrafos, partir, type Fila } from "./vistas-datos.js";
import { panel, pastilla, T, vacio, type Rect, type Zona } from "./piezas.js";

/**
 * El tablero en la terminal: las mismas tarjetas que la consola y el escritorio, leídas de
 * `.dolphin/tablero/`. A la izquierda todas, agrupadas por columna; a la derecha la que elegiste.
 *
 * Mover es con ← y →, que es lo que reemplaza acá al arrastre.
 */

/**
 * El color de cada columna, con el mismo significado que en la consola: una idea es violeta, para
 * hacer azul, haciendo el ámbar de lo que corre, para revisar turquesa (te espera a vos) y hecho el
 * verde de lo que salió bien. Verde solo para lo que terminó.
 */
const COLOR: Record<Columna, Rgb> = {
  ideas: T.violeta,
  "para-hacer": T.azul,
  haciendo: T.amarillo,
  "para-revisar": T.cian,
  hecho: T.verde,
};

/** Las tarjetas en el orden del tablero: por columna, y adentro lo movido último arriba. */
export function tarjetasOrdenadas(tarjetas: readonly Tarjeta[]): Tarjeta[] {
  return [...tarjetas].sort(
    (a, b) => COLUMNAS.indexOf(a.columna) - COLUMNAS.indexOf(b.columna) || b.movida.localeCompare(a.movida),
  );
}

/** Adónde va una tarjeta al moverla con las flechas; `undefined` si ya está en la punta. */
export function columnaVecina(desde: Columna, hacia: -1 | 1): Columna | undefined {
  return COLUMNAS[COLUMNAS.indexOf(desde) + hacia];
}

export function vistaTablero(
  b: Bufer,
  area: Rect,
  datos: Instantanea,
  seleccion: number,
  foco: boolean,
  elegir: (i: number) => void,
): Zona[] {
  const [ri, rd] = partir(area);
  const tarjetas = tarjetasOrdenadas(datos.tarjetas);
  const porHacer = tarjetas.filter((t) => t.columna === "para-hacer").length;
  const li = panel(b, ri, { titulo: `tablero · ${tarjetas.length} ${tarjetas.length === 1 ? "tarjeta" : "tarjetas"}`, foco });
  const ld = panel(b, rd, { titulo: "tarjeta" });
  if (tarjetas.length === 0) {
    vacio(b, li, "El tablero está vacío.", "dolphin tarea nueva «lo que haya que hacer»");
    return [];
  }

  // Un renglón por tarjeta, con el nombre de la columna cuando cambia: se ve dónde está cada una
  // sin dibujar cinco columnas en una terminal angosta.
  let ultima: Columna | undefined;
  const filas: Fila[] = tarjetas.map((t) => {
    const nueva = t.columna !== ultima;
    ultima = t.columna;
    const frenada = laFrenan(t, tarjetas).length > 0;
    return {
      marca: nueva ? "▌" : " ",
      colorMarca: COLOR[t.columna],
      texto: nueva ? `${NOMBRE_DE_COLUMNA[t.columna].toLowerCase()}  ${t.titulo}` : `  ${t.titulo}`,
      nota: frenada ? "espera" : t.quien ? t.quien : haceCuanto(t.movida),
      tenue: t.columna === "hecho" || frenada,
    };
  });
  const zonas = lista(b, li, filas, seleccion, foco, elegir);

  const t = tarjetas[Math.min(seleccion, tarjetas.length - 1)];
  if (t) {
    const frenan = laFrenan(t, tarjetas);
    pastilla(b, ld.x, ld.y, NOMBRE_DE_COLUMNA[t.columna].toLowerCase(), T.fondo, COLOR[t.columna], true);
    const aire = NOMBRE_DE_COLUMNA[t.columna].length + 3;
    b.texto(ld.x + aire, ld.y, recortar(`${t.tipo} · ${t.quien ?? "sin dueño"} · ${haceCuanto(t.movida)}`, ld.w - aire), { fg: T.suave });
    parrafos(b, { ...ld, y: ld.y + 2, h: ld.h - 3 }, [
      { texto: t.titulo },
      ...(t.detalle ? [{ titulo: "qué hay que hacer", texto: t.detalle }] : []),
      ...(t.terminado ? [{ titulo: "está terminada cuando", texto: t.terminado, color: T.acento }] : []),
      ...(frenan.length > 0 ? [{ titulo: "espera a", texto: frenan.map((o) => o.titulo).join("\n"), color: T.amarillo }] : []),
      ...(t.rama ? [{ titulo: "rama", texto: t.rama }] : []),
      ...(t.comentarios.length > 0
        ? [{ titulo: "lo último", texto: t.comentarios.slice(-3).map((c) => `${c.quien}: ${c.texto}`).join("\n") }]
        : []),
    ]);
    const puedeHacer = t.columna === "para-hacer" && frenan.length === 0;
    b.texto(ld.x, ld.y + ld.h - 1, recortar(`← →  moverla${puedeHacer ? " · enter  que la haga el equipo" : ""}`, ld.w), { fg: T.tenue });
  }
  if (porHacer > 0) b.texto(li.x, li.y + li.h - 1, recortar(`${porHacer} para hacer`, li.w), { fg: T.tenue });
  return zonas;
}
