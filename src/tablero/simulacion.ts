import type { EventoConHora } from "./estado.js";

/** La hora de arranque de la siembra de mentira. */
export const SIMULACION_DESDE = 1_000_000;
const T0 = SIMULACION_DESDE;

/** Una siembra de tres ramas: u1 pasa todo, u2 corrige el test y pasa, u3 se corta en sintaxis. */
export function siembraSimulada(hasta = Number.POSITIVE_INFINITY): EventoConHora[] {
  const eventos: EventoConHora[] = [
    { t: T0, tipo: "siembra", tarea: "conIva suma la alícuota en vez de aplicarla", universos: 3, fases: ["sintaxis", "test", "peso"], agente: "claude" },
    { t: T0 + 100, tipo: "nace", u: "u1", enfoque: "minimalista" },
    { t: T0 + 120, tipo: "nace", u: "u2", enfoque: "tests primero" },
    { t: T0 + 140, tipo: "nace", u: "u3", enfoque: "refactor amplio" },
    { t: T0 + 4000, tipo: "escribio", u: "u1", archivos: 1, agregadas: 3, quitadas: 1, modelo: "sonnet" },
    { t: T0 + 4100, tipo: "verifica", u: "u1", verificador: "sintaxis", costo: "gratis" },
    { t: T0 + 4300, tipo: "veredicto", u: "u1", verificador: "sintaxis", paso: true, detalle: "", ms: 200 },
    { t: T0 + 5000, tipo: "escribio", u: "u3", archivos: 6, agregadas: 140, quitadas: 60, modelo: "haiku" },
    { t: T0 + 5100, tipo: "verifica", u: "u3", verificador: "sintaxis", costo: "gratis" },
    { t: T0 + 5300, tipo: "veredicto", u: "u3", verificador: "sintaxis", paso: false, detalle: "Unexpected token", ms: 200 },
    { t: T0 + 6000, tipo: "escribio", u: "u2", archivos: 2, agregadas: 12, quitadas: 2, modelo: "opus" },
    { t: T0 + 6100, tipo: "verifica", u: "u1", verificador: "test", costo: "barato" },
    { t: T0 + 6200, tipo: "verifica", u: "u2", verificador: "sintaxis", costo: "gratis" },
    { t: T0 + 6400, tipo: "veredicto", u: "u2", verificador: "sintaxis", paso: true, detalle: "", ms: 200 },
    { t: T0 + 7300, tipo: "veredicto", u: "u1", verificador: "test", paso: true, detalle: "", ms: 1200 },
    { t: T0 + 7400, tipo: "verifica", u: "u2", verificador: "test", costo: "barato" },
    { t: T0 + 8400, tipo: "veredicto", u: "u2", verificador: "test", paso: false, detalle: "2 tests fallan", ms: 1000 },
    { t: T0 + 8500, tipo: "corrige", u: "u2", verificador: "test", intento: 1 },
    { t: T0 + 9000, tipo: "verifica", u: "u1", verificador: "peso", costo: "barato" },
    { t: T0 + 9400, tipo: "veredicto", u: "u1", verificador: "peso", paso: true, detalle: "", ms: 400 },
    { t: T0 + 11000, tipo: "veredicto", u: "u2", verificador: "test", paso: true, detalle: "", ms: 1100, intento: 1 },
    { t: T0 + 11500, tipo: "veredicto", u: "u2", verificador: "peso", paso: true, detalle: "", ms: 300 },
    { t: T0 + 12000, tipo: "cosecha", elegida: "dolphin/abc/u1", porQue: "el diff más chico que pasó todo", ms: 12000, gastado: 0.42 },
  ];
  return eventos.filter((e) => e.t <= hasta);
}

