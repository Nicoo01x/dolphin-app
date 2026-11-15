import { homedir } from "node:os";
import { leerBandeja, promptDeImplementacion, tomarParaLaNoche } from "./nucleo/bandeja.js";
import { leerUltimaCosecha } from "./nucleo/archivo.js";
import { salioElTurno, type PausaDeCupo, type Turno } from "./nucleo/calendario.js";
import { leerConfig } from "./nucleo/config.js";
import { bloqueoDe, leerPlanDeUso, textoVentana } from "./nucleo/cupo.js";
import type { PedidoDeSiembra } from "./servidor.js";

/**
 * El autopiloto nocturno: un turno del calendario que, en vez de una tarea
 * fija, toma las ideas que el dueño marcó «para esta noche» en la bandeja y
 * las implementa de a una, con el mismo pedido que el botón «Implementar».
 *
 * De a una y esperando cada siembra: así cada idea deja su cosecha antes de
 * la siguiente, y lo que se lee después de sembrar es la cosecha de ESA idea.
 * El orden es el de la valoración (lo que más vale primero) y, entre iguales,
 * lo más viejo: lo que esperó más no se queda afuera por el tope noche tras
 * noche.
 */

export interface DepsDelAutopiloto {
  /** Lanza la siembra y resuelve cuando TERMINÓ. */
  readonly sembrar: (pedido: PedidoDeSiembra) => unknown;
  readonly leerCosecha?: typeof leerUltimaCosecha;
  /** Para tests y para que la app de escritorio use su casa temporal. */
  readonly casa?: string;
  readonly ahora?: () => Date;
  readonly esperar?: (milisegundos: number) => Promise<void>;
  /** El turno nocturno dura cuatro horas desde el cuándo que lo disparó. */
  readonly finDeTurno?: (turno: Turno, ahora: Date) => Date;
  /** Actualiza el estado visible en la tarjeta mientras el turno espera. */
  readonly alCambiarPausa?: (pausa: PausaDeCupo | undefined) => Promise<void>;
}

const HORA = 60 * 60_000;
const CUATRO_HORAS = 4 * HORA;
const TOPE_CUPO_PCT = 90;

export async function correrBandeja(
  repo: string,
  turno: Turno,
  senal: AbortSignal | undefined,
  { sembrar, leerCosecha = leerUltimaCosecha, casa = homedir(), ahora = () => new Date(), esperar, finDeTurno, alCambiarPausa }: DepsDelAutopiloto,
): Promise<{ salio: boolean; porQue?: string; parte?: string }> {
  const tope = turno.deLaBandeja?.tope ?? 0;
  const asuntos = (await leerBandeja(repo)).asuntos
    .filter((a) => a.estado === "abierto" && a.paraLaNoche)
    .sort((a, b) => (b.valoracion?.valor ?? 0) - (a.valoracion?.valor ?? 0) || a.creado.localeCompare(b.creado))
    .slice(0, tope);
  if (asuntos.length === 0) return { salio: false, porQue: "no había ideas para esta noche" };
  let pasaron = 0;
  let corrieron = 0;
  let ultimoParte: string | undefined;
  let notaCupo: string | undefined;
  let canceladoPorCupo = false;
  try {
    for (const candidato of asuntos) {
      if (senal?.aborted) break;
      const espera = await esperarPorCupo({
        repo,
        turno,
        casa,
        ahora,
        ...(senal ? { senal } : {}),
        ...(esperar ? { esperar } : {}),
        ...(finDeTurno ? { finDeTurno } : {}),
        ...(alCambiarPausa ? { alCambiarPausa } : {}),
      });
      if (espera.nota) notaCupo = espera.nota;
      if (espera.termino || espera.cancelado) {
        canceladoPorCupo = espera.cancelado === true;
        break;
      }
      // Se toma en la fila de la bandeja: si la desmarcaron o alguien la implementó a mano, no corre.
      const asunto = await tomarParaLaNoche(repo, candidato.id);
      if (!asunto) continue;
      const inicio = ahora().toISOString();
      await sembrar({
        tarea: promptDeImplementacion(asunto),
        n: 1,
        agente: turno.agente,
        ...(turno.modelo ? { modelo: turno.modelo } : {}),
        automatico: true,
        asunto: asunto.id,
        // Una idea la trajo el scout de la web: lo que deje en la memoria es de afuera.
        ...(asunto.tipo === "idea" ? { deAfuera: true } : {}),
      });
      corrieron += 1;
      if (senal?.aborted) break;
      const resultado = salioElTurno(false, { cosecha: await leerCosecha(repo) }, inicio);
      if (resultado.salio) pasaron += 1;
      if (resultado.parte) ultimoParte = resultado.parte;
    }
  } finally {
    await alCambiarPausa?.(undefined);
  }
  const cancelado = senal?.aborted || canceladoPorCupo ? "; se canceló antes de terminar" : "";
  const nota = notaCupo ? `; ${notaCupo}` : "";
  return {
    salio: pasaron > 0,
    porQue: `${pasaron} de ${corrieron} pasaron el portón${cancelado}${nota}`,
    ...(ultimoParte ? { parte: ultimoParte } : {}),
  };
}

async function esperarPorCupo(opciones: {
  readonly repo: string;
  readonly turno: Turno;
  readonly casa: string;
  readonly ahora: () => Date;
  readonly esperar?: (milisegundos: number) => Promise<void>;
  readonly finDeTurno?: (turno: Turno, ahora: Date) => Date;
  readonly alCambiarPausa?: (pausa: PausaDeCupo | undefined) => Promise<void>;
  readonly senal?: AbortSignal;
}): Promise<{ readonly termino: boolean; readonly cancelado?: boolean; readonly nota?: string }> {
  const umbral = (await leerConfig(opciones.repo)).autopiloto?.topeCupoPct;
  const tope = typeof umbral === "number" && Number.isFinite(umbral) ? umbral : TOPE_CUPO_PCT;
  const fin = opciones.finDeTurno?.(opciones.turno, opciones.ahora()) ?? finPorDefecto(opciones.turno, opciones.ahora());
  let nota: string | undefined;
  for (;;) {
    if (opciones.senal?.aborted) return { termino: true, cancelado: true, ...(nota ? { nota } : {}) };
    const instante = opciones.ahora();
    const plan = await leerPlanDeUso(opciones.casa, instante);
    const bloqueo = bloqueoDe(plan, opciones.turno.agente, tope, instante);
    if (!bloqueo) return { termino: false, ...(nota ? { nota } : {}) };
    nota = `Esperé al reinicio del cupo (${bloqueo.ventana.usadoPct} % de ${textoVentana(bloqueo.ventana.nombre)})`;
    const hasta = bloqueo.hasta.getTime() < fin.getTime() ? bloqueo.hasta : fin;
    await opciones.alCambiarPausa?.({ hasta: hasta.toISOString(), ventana: bloqueo.ventana.nombre, usadoPct: bloqueo.ventana.usadoPct });
    if (instante.getTime() >= fin.getTime() || bloqueo.hasta.getTime() >= fin.getTime()) return { termino: true, nota };
    const milisegundos = Math.max(0, bloqueo.hasta.getTime() - instante.getTime());
    if (opciones.esperar) await opciones.esperar(milisegundos);
    else await dormir(milisegundos, opciones.senal);
  }
}

function finPorDefecto(turno: Turno, ahora: Date): Date {
  const inicio = new Date(turno.cuando).getTime();
  return new Date(Number.isFinite(inicio) ? inicio + CUATRO_HORAS : ahora.getTime() + CUATRO_HORAS);
}

function dormir(milisegundos: number, senal?: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(resolver, milisegundos);
    senal?.addEventListener("abort", () => {
      clearTimeout(temporizador);
      resolver();
    }, { once: true });
  });
}
