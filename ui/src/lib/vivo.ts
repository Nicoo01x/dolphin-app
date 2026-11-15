import type { Candidato, Cosecha } from "./tipos";
import type { Escalon } from "./datos";

/**
 * El estado de una siembra EN CURSO, armado evento a evento desde el
 * canal `/en-vivo`. Es un reductor puro: se prueba sin navegador, y la
 * grilla viva no es más que este estado dibujado.
 */

export type EventoVivo =
  | { t: number; tipo: "siembra"; tarea: string; universos: number }
  | { t: number; tipo: "nace"; u: string; enfoque: string }
  | { t: number; tipo: "escribio"; u: string; archivos: number; agregadas: number; quitadas: number; modelo?: string }
  | { t: number; tipo: "fallo-escribiendo"; u: string; porQue: string }
  | { t: number; tipo: "verifica"; u: string; verificador: string; costo: string }
  | { t: number; tipo: "veredicto"; u: string; verificador: string; paso: boolean; detalle: string; ms: number; intento?: number; salteada?: boolean }
  | { t: number; tipo: "corrige"; u: string; verificador: string; intento: number }
  | { t: number; tipo: "cosecha" };

export interface IntentoVivo {
  readonly id: string;
  readonly enfoque: string;
  readonly modelo?: string;
  /** Qué está haciendo AHORA: escribiendo, una fase de testing, o ya terminó. */
  readonly haciendo: "escribe" | "espera" | string | null;
  /** Desde cuándo (ms epoch): el reloj por fila sale de acá. */
  readonly cambio: number;
  readonly vivo: boolean;
  readonly porQue?: string;
  readonly murioEn?: string;
  readonly pasadas: readonly { verificador: string; costo: string; paso: boolean; detalle: string; ms: number; intento?: number }[];
  readonly forma?: { archivos: number; agregadas: number; quitadas: number };
}

export interface Vivo {
  readonly tarea: string;
  readonly universos: number;
  readonly desde: number;
  readonly intentos: readonly IntentoVivo[];
  readonly termino: boolean;
}

export function reducirVivo(previo: Vivo | null, evento: EventoVivo): Vivo | null {
  if (evento.tipo === "siembra") {
    return { tarea: evento.tarea, universos: evento.universos, desde: evento.t, intentos: [], termino: false };
  }
  if (!previo) return null;
  if (evento.tipo === "cosecha") return { ...previo, termino: true };

  const intentos = [...previo.intentos];
  const i = intentos.findIndex((x) => x.id === evento.u);
  const actual: IntentoVivo =
    i >= 0
      ? intentos[i]!
      : { id: evento.u, enfoque: "—", haciendo: null, vivo: true, pasadas: [], cambio: evento.t };

  let siguiente = actual;
  switch (evento.tipo) {
    case "nace":
      siguiente = { ...actual, enfoque: evento.enfoque, haciendo: "escribe", cambio: evento.t };
      break;
    case "escribio":
      siguiente = {
        ...actual,
        haciendo: "espera",
        cambio: evento.t,
        forma: { archivos: evento.archivos, agregadas: evento.agregadas, quitadas: evento.quitadas },
        ...(evento.modelo ? { modelo: evento.modelo } : {}),
      };
      break;
    case "fallo-escribiendo":
      siguiente = { ...actual, haciendo: null, vivo: false, murioEn: "el agente", porQue: evento.porQue, cambio: evento.t };
      break;
    case "verifica":
      siguiente = { ...actual, haciendo: evento.verificador, cambio: evento.t };
      break;
    case "corrige": {
      // El agente está arreglando lo que esa fase rebotó: la rama vuelve a estar
      // en juego. El veredicto en contra la había dado por cortada, pero el
      // portón le da otra vuelta; sin esto quedaba «cortada» aunque pasara.
      const enJuego: { -readonly [K in keyof IntentoVivo]: IntentoVivo[K] } = { ...actual };
      delete enJuego.murioEn;
      delete enJuego.porQue;
      siguiente = { ...enJuego, vivo: true, haciendo: evento.verificador, cambio: evento.t };
      break;
    }
    case "veredicto": {
      const pasadas = [
        ...actual.pasadas,
        {
          verificador: evento.verificador,
          costo: "gratis",
          paso: evento.paso,
          detalle: evento.detalle,
          ms: evento.ms,
          ...(evento.intento !== undefined ? { intento: evento.intento } : {}),
          ...(evento.salteada ? { salteada: true } : {}),
        },
      ];
      siguiente = evento.paso
        ? { ...actual, haciendo: "espera", pasadas, cambio: evento.t }
        : { ...actual, haciendo: null, vivo: false, murioEn: evento.verificador, porQue: evento.detalle, pasadas, cambio: evento.t };
      break;
    }
  }

  if (i >= 0) intentos[i] = siguiente;
  else intentos.push(siguiente);
  intentos.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  return { ...previo, intentos };
}

/**
 * El vivo con la forma de una cosecha, para dibujarlo con la MISMA grilla
 * que lo terminado: la pantalla no tiene dos lenguajes.
 */
export function cosechaDeVivo(vivo: Vivo): Cosecha {
  const candidatos: Candidato[] = vivo.intentos.map((x) => ({
    universo: { id: x.id, rama: "", ruta: "", nacido: vivo.desde },
    vivo: x.vivo,
    // «escribe» entra como primera pasada para que la celda se pinte con
    // la misma maquinaria: escribió → pasó; se cayó escribiendo → se cortó.
    pasadas: [
      ...(x.forma
        ? [{ verificador: "escribe", costo: "caro" as const, paso: true, detalle: `escribe: ${x.modelo ?? "listo"}`, gastado: 0, ms: 0 }]
        : x.murioEn === "el agente"
          ? [{ verificador: "escribe", costo: "caro" as const, paso: false, detalle: x.porQue ?? "se cayó escribiendo", gastado: 0, ms: 0 }]
          : []),
      ...x.pasadas.map((p) => ({ ...p, costo: p.costo as Candidato["pasadas"][number]["costo"], gastado: 0 })),
    ],
    enfoque: x.enfoque,
    ...(x.modelo ? { modelo: x.modelo } : {}),
    ...(x.forma ? { forma: { ...x.forma, dependenciasNuevas: 0 } } : {}),
    ...(x.porQue ? { porQue: x.porQue } : {}),
    ...(x.murioEn ? { murioEn: x.murioEn } : {}),
  }));

  return { tarea: vivo.tarea, candidatos, gastado: 0, muertosGratis: 0, ms: Date.now() - vivo.desde };
}

/** Qué celda está trabajando cada intento, para el pulso de la grilla. */
export function haciendoDe(vivo: Vivo): Record<string, string> {
  const haciendo: Record<string, string> = {};
  for (const x of vivo.intentos) {
    if (x.haciendo && x.haciendo !== "espera") haciendo[x.id] = x.haciendo;
  }
  return haciendo;
}

/**
 * Las fases que el vivo ya conoce, empezando por «escribe»: las que se
 * vieron en algún verifica/veredicto, en orden de aparición.
 */
export function fasesDe(vivo: Vivo): Escalon[] {
  const vistas = new Map<string, Escalon>();
  vistas.set("escribe", { nombre: "escribe", costo: "caro" });
  for (const x of vivo.intentos) {
    for (const p of x.pasadas) {
      if (!vistas.has(p.verificador)) vistas.set(p.verificador, { nombre: p.verificador, costo: p.costo as Escalon["costo"] });
    }
    if (x.haciendo && x.haciendo !== "escribe" && x.haciendo !== "espera" && !vistas.has(x.haciendo)) {
      vistas.set(x.haciendo, { nombre: x.haciendo, costo: "gratis" });
    }
  }
  return [...vistas.values()];
}

/** El resumen de arriba mientras corre: quién está en qué. */
export function resumenDeVivo(vivo: Vivo): string {
  const escribiendo = vivo.intentos.filter((x) => x.haciendo === "escribe").length;
  const probando = vivo.intentos.filter((x) => x.haciendo && x.haciendo !== "escribe" && x.haciendo !== "espera").length;
  const cortados = vivo.intentos.filter((x) => !x.vivo).length;
  const partes: string[] = [];
  if (escribiendo > 0) partes.push(`${escribiendo} escribiendo`);
  if (probando > 0) partes.push(`${probando} en testing`);
  if (cortados > 0) partes.push(`${cortados} ${cortados === 1 ? "se cortó" : "se cortaron"}`);
  return partes.join(" · ") || "arrancando…";
}
