import type { Turno } from "./tipos";
import { logoDeModelo } from "./datos";

/**
 * Los números del tablero, derivados del historial de verdad. Acá no se
 * inventa nada: si el repo tiene dos siembras, el tablero muestra dos.
 */

export interface MetricaModelo {
  readonly modelo: string;
  readonly nombre: string;
  readonly logo: string;
  readonly intentos: number;
  readonly pasaron: number;
  readonly gastado: number;
}

export interface Metricas {
  readonly siembras: number;
  readonly intentos: number;
  readonly pasaron: number;
  /** 0–1, sobre las ramas que tuvieron fases; NaN si no hubo ninguna. */
  readonly tasaDePaso: number;
  /** Ramas que se entregaron sin ninguna fase: nadie las probó. */
  readonly sinProbar: number;
  readonly gastado: number;
  /** Gasto por siembra, de la más vieja a la más nueva (para barras). */
  readonly gastoPorSiembra: readonly number[];
  /** Todas las siembras corrieron con suscripción: la plata no se muestra. */
  readonly todoSuscripcion: boolean;
  /** Alguna siembra corrió con un motor que no informa su costo: el total es un piso. */
  readonly costoDesconocido: boolean;
  readonly cortadosGratis: number;
  readonly porModelo: readonly MetricaModelo[];
}

export function medir(turnos: readonly Turno[]): Metricas {
  const intentos = turnos.flatMap((t) => t.intentos ?? []);
  // Sin fases no hubo prueba: una rama que «pasó» sin nada que pasar no
  // cuenta como pasada, se cuenta aparte. (Historiales viejos no traen
  // `fases`: esas se toman como probadas, que es lo que decían entonces.)
  const sinProbar = intentos.filter((x) => x.vivo && x.fases === 0).length;
  const pasaron = intentos.filter((x) => x.vivo && x.fases !== 0).length;
  const probables = intentos.length - sinProbar;

  const modelos = new Map<string, { intentos: number; pasaron: number; gastado: number }>();
  for (const x of intentos) {
    const clave = x.modelo ?? "sin registrar";
    const m = modelos.get(clave) ?? { intentos: 0, pasaron: 0, gastado: 0 };
    m.intentos += 1;
    if (x.vivo) m.pasaron += 1;
    m.gastado += x.gastado;
    modelos.set(clave, m);
  }

  return {
    siembras: turnos.length,
    intentos: intentos.length,
    pasaron,
    tasaDePaso: probables > 0 ? pasaron / probables : Number.NaN,
    sinProbar,
    // La plata se cuenta solo donde se pagó por uso: una siembra con
    // suscripción no es gasto, y si TODAS lo son, el costo ni se muestra.
    gastado: turnos.reduce((n, t) => n + (t.suscripcion ? 0 : t.gastado), 0),
    // Sin las de suscripción: como 0 dibujaban una barra mínima que se leía como «barata».
    gastoPorSiembra: turnos.filter((t) => !t.suscripcion).reverse().map((t) => t.gastado),
    todoSuscripcion: turnos.length > 0 && turnos.every((t) => t.suscripcion === true),
    costoDesconocido: turnos.some((t) => !t.suscripcion && t.costoDesconocido === true),
    // Gratis es que el PORTÓN no gastó nada en ella: escribirla se paga igual.
    cortadosGratis: intentos.filter((x) => !x.vivo && (x.gastadoFases ?? x.gastado) === 0).length,
    porModelo: [...modelos.entries()]
      .map(([modelo, m]) => ({
        modelo,
        nombre: modelo === "sin registrar" ? "sin registrar" : logoDeModelo(modelo).nombre,
        logo: logoDeModelo(modelo).src,
        ...m,
      }))
      .sort((a, b) => b.intentos - a.intentos),
  };
}
