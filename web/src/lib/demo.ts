/**
 * La siembra que se ve andar en la web, sin instalar nada.
 *
 * El guion es el MISMO que usa `dolphin tablero --demo` en la terminal: está copiado de
 * `src/tablero/simulacion.ts` —tiempos, enfoques, modelos y motivos— y `tests/demo-web.test.ts`,
 * en el repo, falla si los dos dejan de contar la misma historia. Una demo que muestra algo que
 * el producto no hace es peor que no tener demo.
 *
 * Acá no corre nada: esto reproduce una grabación. Lo que de verdad cruza el portón son las ramas
 * de tu repo, en tu máquina.
 */

export type Fase = "escribe" | "sintaxis" | "test" | "peso";

/** Lo que pasa, con el momento en que pasa (ms desde que arrancó la siembra). */
export type MomentoDeLaDemo =
  | { readonly t: number; readonly tipo: "nace"; readonly u: string; readonly enfoque: string }
  | { readonly t: number; readonly tipo: "escribio"; readonly u: string; readonly archivos: number; readonly agregadas: number; readonly quitadas: number; readonly modelo: string }
  | { readonly t: number; readonly tipo: "verifica"; readonly u: string; readonly fase: Fase }
  | { readonly t: number; readonly tipo: "veredicto"; readonly u: string; readonly fase: Fase; readonly paso: boolean; readonly detalle?: string }
  | { readonly t: number; readonly tipo: "corrige"; readonly u: string; readonly fase: Fase }
  | { readonly t: number; readonly tipo: "cosecha"; readonly elegida: string; readonly porQue: string; readonly gastado: number };

export const TAREA = "conIva suma la alícuota en vez de aplicarla";
export const FASES: readonly Fase[] = ["escribe", "sintaxis", "test", "peso"];
/** Cuánto dura la película. El último momento del guion. */
export const DURACION = 12_000;

export const GUION: readonly MomentoDeLaDemo[] = [
  { t: 100, tipo: "nace", u: "u1", enfoque: "minimalista" },
  { t: 120, tipo: "nace", u: "u2", enfoque: "tests primero" },
  { t: 140, tipo: "nace", u: "u3", enfoque: "refactor amplio" },
  { t: 4000, tipo: "escribio", u: "u1", archivos: 1, agregadas: 3, quitadas: 1, modelo: "sonnet" },
  { t: 4100, tipo: "verifica", u: "u1", fase: "sintaxis" },
  { t: 4300, tipo: "veredicto", u: "u1", fase: "sintaxis", paso: true },
  { t: 5000, tipo: "escribio", u: "u3", archivos: 6, agregadas: 140, quitadas: 60, modelo: "haiku" },
  { t: 5100, tipo: "verifica", u: "u3", fase: "sintaxis" },
  { t: 5300, tipo: "veredicto", u: "u3", fase: "sintaxis", paso: false, detalle: "Unexpected token" },
  { t: 6000, tipo: "escribio", u: "u2", archivos: 2, agregadas: 12, quitadas: 2, modelo: "opus" },
  { t: 6100, tipo: "verifica", u: "u1", fase: "test" },
  { t: 6200, tipo: "verifica", u: "u2", fase: "sintaxis" },
  { t: 6400, tipo: "veredicto", u: "u2", fase: "sintaxis", paso: true },
  { t: 7300, tipo: "veredicto", u: "u1", fase: "test", paso: true },
  { t: 7400, tipo: "verifica", u: "u2", fase: "test" },
  { t: 8400, tipo: "veredicto", u: "u2", fase: "test", paso: false, detalle: "2 tests fallan" },
  { t: 8500, tipo: "corrige", u: "u2", fase: "test" },
  { t: 9000, tipo: "verifica", u: "u1", fase: "peso" },
  { t: 9400, tipo: "veredicto", u: "u1", fase: "peso", paso: true },
  { t: 11000, tipo: "veredicto", u: "u2", fase: "test", paso: true },
  { t: 11500, tipo: "veredicto", u: "u2", fase: "peso", paso: true },
  { t: 12000, tipo: "cosecha", elegida: "dolphin/abc/u1", porQue: "el diff más chico que pasó todo", gastado: 0.42 },
];

/** Cómo está una celda de la grilla en un instante. */
export type EstadoDeCelda = "nada" | "haciendo" | "paso" | "corta" | "corrigiendo";

export interface RamaDeLaDemo {
  readonly id: string;
  readonly enfoque: string;
  readonly modelo?: string;
  readonly forma?: { readonly archivos: number; readonly agregadas: number; readonly quitadas: number };
  readonly celdas: Readonly<Record<Fase, EstadoDeCelda>>;
  readonly viva: boolean;
  /** Por qué se cortó, si se cortó. */
  readonly porQue?: string;
}

export interface EstadoDeLaDemo {
  readonly ramas: readonly RamaDeLaDemo[];
  /** Cuando terminó: qué rama se eligió y por qué. */
  readonly cosecha?: { readonly elegida: string; readonly porQue: string; readonly gastado: number };
}

const VACIAS: Record<Fase, EstadoDeCelda> = { escribe: "nada", sintaxis: "nada", test: "nada", peso: "nada" };

/**
 * El estado en el milisegundo `t`.
 *
 * Se recalcula entero desde el guion en vez de ir acumulando: así moverse para atrás —volver a
 * empezar, o arrastrar la línea de tiempo— no deja medio estado de la pasada anterior.
 */
export function enElMomento(t: number): EstadoDeLaDemo {
  const ramas = new Map<string, { enfoque: string; modelo?: string; forma?: RamaDeLaDemo["forma"]; celdas: Record<Fase, EstadoDeCelda>; viva: boolean; porQue?: string }>();
  let cosecha: EstadoDeLaDemo["cosecha"];

  for (const m of GUION) {
    if (m.t > t) break;
    if (m.tipo === "cosecha") {
      cosecha = { elegida: m.elegida, porQue: m.porQue, gastado: m.gastado };
      continue;
    }
    const rama = ramas.get(m.u) ?? { enfoque: "", celdas: { ...VACIAS }, viva: true };
    switch (m.tipo) {
      case "nace":
        // Nace escribiendo: es lo primero que hace, y la columna «escribe» tiene que mostrarlo.
        ramas.set(m.u, { ...rama, enfoque: m.enfoque, celdas: { ...rama.celdas, escribe: "haciendo" } });
        break;
      case "escribio":
        ramas.set(m.u, {
          ...rama,
          modelo: m.modelo,
          forma: { archivos: m.archivos, agregadas: m.agregadas, quitadas: m.quitadas },
          celdas: { ...rama.celdas, escribe: "paso" },
        });
        break;
      case "verifica":
        ramas.set(m.u, { ...rama, celdas: { ...rama.celdas, [m.fase]: "haciendo" } });
        break;
      case "corrige": {
        // Vuelve a estar en juego: el portón le da otra vuelta con el veredicto a la vista.
        const { porQue: _yaNo, ...enJuego } = rama;
        ramas.set(m.u, { ...enJuego, viva: true, celdas: { ...rama.celdas, [m.fase]: "corrigiendo" } });
        break;
      }
      case "veredicto":
        ramas.set(m.u, {
          ...rama,
          viva: m.paso ? rama.viva : false,
          ...(m.paso ? {} : { porQue: m.detalle }),
          celdas: { ...rama.celdas, [m.fase]: m.paso ? "paso" : "corta" },
        });
        break;
    }
  }

  return {
    // Las claves opcionales se ponen solo si hay algo: el núcleo compila con
    // `exactOptionalPropertyTypes`, donde `modelo: undefined` no es lo mismo que no tener modelo.
    ramas: [...ramas.entries()]
      .map(([id, r]) => ({
        id,
        enfoque: r.enfoque,
        viva: r.viva,
        celdas: r.celdas as Readonly<Record<Fase, EstadoDeCelda>>,
        ...(r.modelo ? { modelo: r.modelo } : {}),
        ...(r.forma ? { forma: r.forma } : {}),
        ...(r.porQue ? { porQue: r.porQue } : {}),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ...(cosecha ? { cosecha } : {}),
  };
}

/** Lo que se cuenta abajo mientras corre: es el titular del producto, medido sobre la película. */
export function comoVa(estado: EstadoDeLaDemo): string {
  if (estado.cosecha) {
    const vivas = estado.ramas.filter((r) => r.viva).length;
    return `${vivas} de ${estado.ramas.length} pasaron el portón · ganó ${estado.cosecha.elegida.split("/").pop()}, ${estado.cosecha.porQue}`;
  }
  const escribiendo = estado.ramas.filter((r) => r.celdas.escribe === "haciendo").length;
  const probando = estado.ramas.filter((r) => FASES.some((f) => f !== "escribe" && (r.celdas[f] === "haciendo" || r.celdas[f] === "corrigiendo"))).length;
  const cortadas = estado.ramas.filter((r) => !r.viva).length;
  const partes: string[] = [];
  if (escribiendo > 0) partes.push(`${escribiendo} escribiendo`);
  if (probando > 0) partes.push(`${probando} en el portón`);
  if (cortadas > 0) partes.push(`${cortadas} ${cortadas === 1 ? "se cortó" : "se cortaron"}`);
  return partes.join(" · ") || "arrancando…";
}
