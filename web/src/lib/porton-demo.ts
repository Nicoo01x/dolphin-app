/**
 * Una rama cruzando el portón, para verlo andar en la página.
 *
 * Las ocho fases y su costo son las de verdad (`docs/porton.md`). Lo que cambia respecto de una
 * corrida real es el reloj: un portón de verdad tarda minutos, y acá la película dura nueve
 * segundos. Los tiempos que se muestran en pantalla son los reales, no los de la película.
 *
 * El rebote está a propósito en «tus scripts»: es el caso que explica el producto —algo falla
 * gratis, vuelve al agente con el motivo, se corrige y se reintenta la misma fase— y es lo que no
 * se entiende leyendo una lista de ocho renglones.
 *
 * Acá no corre nada: esto reproduce una grabación, y la página lo dice.
 */

export interface FaseDelPorton {
  readonly nombre: string;
  readonly mira: string;
  /** Las dos últimas cuestan plata; las seis primeras no. */
  readonly paga: boolean;
  /** Lo que tarda de verdad, para mostrarlo al lado cuando termina. */
  readonly tarda: string;
}

export const FASES_DEL_PORTON: readonly FaseDelPorton[] = [
  { nombre: "configuración", mira: "que la rama no toque lo que el repo ejecuta solo", paga: false, tarda: "0,2 s" },
  { nombre: "política", mira: "que lo automático no deploye ni toque migraciones", paga: false, tarda: "0,1 s" },
  { nombre: "seguridad", mira: "claves en el bundle, tablas sin candado, rutas sin permiso", paga: false, tarda: "3 s" },
  { nombre: "memoria", mira: "tus correcciones de siempre, ya convertidas en chequeos", paga: false, tarda: "1 s" },
  { nombre: "tus scripts", mira: "los tipos, los tests y el lint que ya tenías", paga: false, tarda: "48 s" },
  { nombre: "pantalla", mira: "la app de la rama, usada de punta a punta por cinco personas", paga: false, tarda: "1 m 10 s" },
  { nombre: "visión", mira: "un juez que mira la app andando, nunca el código", paga: true, tarda: "22 s" },
  { nombre: "revisión", mira: "otro modelo lee el diff contra lo que se había pedido", paga: true, tarda: "31 s" },
];

export type EstadoDeFase = "espera" | "corriendo" | "paso" | "rebote" | "corrigiendo";

/** Lo que pasa, con el momento en que pasa (ms desde que la rama entró al portón). */
type Momento =
  | { readonly t: number; readonly tipo: "corre"; readonly fase: number }
  | { readonly t: number; readonly tipo: "pasa"; readonly fase: number }
  | { readonly t: number; readonly tipo: "rebota"; readonly fase: number; readonly porQue: string }
  | { readonly t: number; readonly tipo: "corrige"; readonly fase: number }
  | { readonly t: number; readonly tipo: "cruza" };

export const GUION_DEL_PORTON: readonly Momento[] = [
  { t: 100, tipo: "corre", fase: 0 },
  { t: 500, tipo: "pasa", fase: 0 },
  { t: 600, tipo: "corre", fase: 1 },
  { t: 900, tipo: "pasa", fase: 1 },
  { t: 1000, tipo: "corre", fase: 2 },
  { t: 1600, tipo: "pasa", fase: 2 },
  { t: 1700, tipo: "corre", fase: 3 },
  { t: 2100, tipo: "pasa", fase: 3 },
  { t: 2200, tipo: "corre", fase: 4 },
  // El rebote: gratis, temprano, y con el motivo exacto que vuelve al agente.
  { t: 3300, tipo: "rebota", fase: 4, porQue: "2 tests en rojo · carrito.test.ts" },
  { t: 3900, tipo: "corrige", fase: 4 },
  { t: 5200, tipo: "pasa", fase: 4 },
  { t: 5300, tipo: "corre", fase: 5 },
  { t: 6300, tipo: "pasa", fase: 5 },
  { t: 6400, tipo: "corre", fase: 6 },
  { t: 7300, tipo: "pasa", fase: 6 },
  { t: 7400, tipo: "corre", fase: 7 },
  { t: 8600, tipo: "pasa", fase: 7 },
  { t: 8800, tipo: "cruza" },
];

/** Cuánto dura la película. El último momento del guion. */
export const DURACION_PORTON = 8800;

export interface EstadoDelPorton {
  readonly fases: readonly EstadoDeFase[];
  /** El motivo del rebote, mientras está rebotada o corrigiéndose. */
  readonly porQue: string | null;
  readonly cruzo: boolean;
  readonly rebotes: number;
}

/**
 * El estado en el milisegundo `t`.
 *
 * Se recalcula entero desde el guion en vez de ir acumulando: así volver para atrás no deja medio
 * estado de la pasada anterior. Es el mismo criterio que la demo de la siembra (`lib/demo.ts`).
 */
export function porCruzar(t: number): EstadoDelPorton {
  const fases: EstadoDeFase[] = FASES_DEL_PORTON.map(() => "espera");
  let porQue: string | null = null;
  let cruzo = false;
  let rebotes = 0;

  for (const m of GUION_DEL_PORTON) {
    if (m.t > t) {
      break;
    }
    switch (m.tipo) {
      case "corre":
        fases[m.fase] = "corriendo";
        break;
      case "pasa":
        fases[m.fase] = "paso";
        porQue = null;
        break;
      case "rebota":
        fases[m.fase] = "rebote";
        porQue = m.porQue;
        rebotes += 1;
        break;
      case "corrige":
        fases[m.fase] = "corrigiendo";
        break;
      case "cruza":
        cruzo = true;
        break;
    }
  }
  return { fases, porQue, cruzo, rebotes };
}

/** La línea que resume cómo va, abajo de la escalera. */
export function comoVaElPorton(estado: EstadoDelPorton): string {
  if (estado.cruzo) {
    return `La rama cruzó · ${estado.rebotes} rebote y se corrigió sola · 2 de 8 fases pagaron`;
  }
  const i = estado.fases.findIndex((f) => f !== "paso" && f !== "espera");
  if (i === -1) {
    return "Esperando una rama…";
  }
  const fase = FASES_DEL_PORTON[i]!;
  if (estado.fases[i] === "rebote") {
    return `Rebotó en ${fase.nombre} · vuelve al agente con el motivo`;
  }
  if (estado.fases[i] === "corrigiendo") {
    return `El agente corrige y ${fase.nombre} se vuelve a correr`;
  }
  return `Corriendo ${fase.nombre}${fase.paga ? " · esta paga" : ""}`;
}
