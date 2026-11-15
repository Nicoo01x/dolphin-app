import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { leerBandeja, promptDeImplementacion, tomarParaLaNoche } from "./nucleo/bandeja.js";
import { esLimiteDeUso } from "./nucleo/cuentas.js";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./nucleo/escritura.js";
import { nuevoId } from "./nucleo/ids.js";
import type { Motor } from "./nucleo/router.js";
import type { Cosecha } from "./nucleo/tipos.js";
import { armarInforme, fasesDePasadas } from "./nucleo/informe.js";
import { prepararSiembra, sembrarTarea, type PedidoDeTarea } from "./siembra.js";
import { descartarRama } from "./nucleo/entrega.js";
import { abrirOActualizarPr, comentarIssue } from "./nucleo/pr.js";
import { listasParaHacer } from "./nucleo/tarjetas-espera.js";
import { cambiarTarjeta, leerTablero, type Tarjeta } from "./nucleo/tarjetas.js";
import { objetivoDeTarjeta } from "./equipo/con-tarjeta.js";
export { issuesParaLaNoche, pendientesDeIssues } from "./nucleo/issues-noche.js";
export type { IssueDeLaNoche, ResultadoDeIssuesDeNoche } from "./nucleo/issues-noche.js";

/**
 * El turno de noche: tus pendientes, hechos mientras dormís con el cupo que ya pagaste.
 *
 * Toma lo que marcaste «para esta noche» en la bandeja y lo que le pases suelto, y lo hace de a una
 * tarea, cada una en su rama y con el portón. Si el motor se queda sin cupo, primero cambia de cuenta
 * solo (ver cuentas.ts); si no queda ninguna, espera a que se reinicie la ventana y retoma la MISMA
 * tarea, hasta la hora en que dijiste que te despertás. Cada noche queda escrita en
 * `.dolphin/noches/` a medida que avanza: de ahí sale el parte de la mañana.
 */

export interface PendienteDeLaNoche {
  readonly id: string;
  readonly titulo: string;
  readonly tarea: string;
  /** El asunto de la bandeja, si vino de ahí: la siembra lo marca hecho o lo devuelve abierto. */
  readonly asunto?: string;
  /** La tarjeta del tablero que originó la tarea: la noche la mueve sola al terminar. */
  readonly tarjeta?: string;
  /** Número del issue que originó la tarea nocturna. */
  readonly issue?: number;
  readonly issueUrl?: string;
}

export type EstadoNocturno = "lista" | "no-salio" | "sin-cupo" | "sin-tiempo";

export interface TareaDeLaNoche {
  readonly id: string;
  readonly titulo: string;
  readonly tarea: string;
  estado: EstadoNocturno;
  porQue: string;
  gastado: number;
  /** Cuántas veces esperó a que volviera el cupo. */
  esperas: number;
  rama?: string;
  ruta?: string;
  /** El commit entregado y de dónde salió: con eso se integra a la mañana. */
  commit?: string;
  base?: string;
  ramaBase?: string;
  parte?: string;
  pr?: string;
  videos?: string[];
  empezo?: string;
  termino?: string;
  /** Lo que quedó sin comprobar (ver informe.ts): va en el parte, a la vista. */
  sinComprobar?: string[];
  /** Lo que decidiste a la mañana (ver manana.ts). */
  decidida?: { readonly accion: "aprobada" | "descartada"; readonly en: string };
}

export interface Noche {
  readonly id: string;
  readonly repo: string;
  readonly agente: string;
  readonly desde: string;
  readonly hasta: string;
  readonly tareas: TareaDeLaNoche[];
  termino?: string;
}

export interface PedidoDeNoche {
  readonly repo: string;
  readonly agente: Motor;
  readonly hasta: Date;
  readonly pendientes: readonly PendienteDeLaNoche[];
  readonly verificar?: readonly string[];
}

export interface DepsDeNoche {
  /** Siembra una tarea y devuelve la cosecha cuando TERMINÓ. */
  readonly sembrar?: (pedido: PedidoDeTarea, asunto?: string, senal?: AbortSignal) => Promise<Cosecha>;
  readonly ahora?: () => Date;
  readonly esperar?: (ms: number) => Promise<void>;
  /** Lo que va pasando, en una línea: lo imprime el CLI. */
  readonly contar?: (texto: string) => void;
  readonly issueAbierto?: (numero: number) => Promise<boolean>;
  readonly abrirPr?: (repo: string, cosecha: Cosecha) => Promise<{ readonly ok: true; readonly url: string } | { readonly ok: false; readonly porQue: string }>;
  readonly comentarIssue?: (repo: string, numero: number, pr: string) => Promise<void>;
}

/** Cada cuánto se vuelve a probar cuando no queda cupo en ninguna cuenta. */
export const ESPERA_POR_CUPO = 30 * 60_000;

/**
 * Lo que hay para esta noche, en orden: lo marcado en la bandeja (lo que más vale primero), lo que
 * se pasó suelto, y las tarjetas que están listas en Para hacer.
 *
 * De las tarjetas van las que puede arrancar el equipo —sin dueño o con «agentes»— y que no esperan
 * a ninguna otra (ver nucleo/tarjetas-espera.ts): empezar algo encima de una rama que todavía no
 * integraste es trabajo tirado.
 */
export async function pendientesDeLaNoche(repo: string, sueltas: readonly string[] = []): Promise<PendienteDeLaNoche[]> {
  const deLaBandeja = (await leerBandeja(repo)).asuntos
    .filter((a) => a.estado === "abierto" && a.paraLaNoche)
    .sort((a, b) => (b.valoracion?.valor ?? 0) - (a.valoracion?.valor ?? 0) || a.creado.localeCompare(b.creado))
    .map((a) => ({ id: a.id, titulo: a.titulo, tarea: promptDeImplementacion(a), asunto: a.id }));
  const sueltasLimpias = sueltas.map((t) => t.trim()).filter(Boolean);
  // Lo que frena a una tarjeta se calcula contra el tablero ENTERO: filtrar antes dejaría pasar una
  // que espera a otra que tiene dueño, que es justo la que no hay que empezar.
  const tablero = await leerTablero(repo).catch(() => [] as Tarjeta[]);
  const delTablero = listasParaHacer(tablero)
    .filter((t) => esDelEquipo(t))
    .map((t) => ({ id: `t-${t.id}`, titulo: t.titulo, tarea: objetivoDeTarjeta(t), tarjeta: t.id }));
  return [
    ...deLaBandeja,
    ...sueltasLimpias.map((tarea, i) => ({ id: `s${i + 1}`, titulo: tarea.split(/[.\n]/)[0]!.slice(0, 80), tarea })),
    ...delTablero,
  ];
}

/** Una tarjeta que puede arrancar el equipo: sin dueño, o con los agentes como dueños. */
const esDelEquipo = (t: Tarjeta): boolean => !t.quien?.trim() || t.quien.trim().toLowerCase() === "agentes";

/** La hora a la que te despertás, de «07:00»: la próxima vez que el reloj marque esa hora. */
export function horaDeDespertar(texto: string, ahora: Date): Date | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(texto.trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2] ?? 0);
  if (horas > 23 || minutos > 59) return null;
  const hasta = new Date(ahora);
  hasta.setHours(horas, minutos, 0, 0);
  if (hasta.getTime() <= ahora.getTime()) hasta.setDate(hasta.getDate() + 1);
  return hasta;
}

const sinCupo = (cosecha: Cosecha) => [cosecha.porQueGano ?? "", ...cosecha.candidatos.map((c) => c.porQue ?? "")].some((t) => t !== "" && esLimiteDeUso(t));

async function sembrarDeVerdad(pedido: PedidoDeTarea, asunto?: string, senal?: AbortSignal): Promise<Cosecha> {
  const preparada = await prepararSiembra(pedido);
  const { cosecha } = await sembrarTarea(pedido, preparada, { reintentos: 1, ...(asunto ? { asunto } : {}), ...(senal ? { senal } : {}) });
  return cosecha;
}

async function guardarNoche(noche: Noche): Promise<void> {
  const carpeta = await carpetaDeDolphin(noche.repo, "noches");
  await enFila(join(carpeta, `${noche.id}.json`), () => escribirDeUna(join(carpeta, `${noche.id}.json`), `${JSON.stringify(noche, null, 2)}\n`));
}

const rutaDeNoche = (noche: Pick<Noche, "repo" | "id">) => join(noche.repo, ".dolphin", "noches", `${noche.id}.json`);

/** Guarda solo una tarea y conserva la decisión que ya pueda estar en disco. */
export async function guardarTareaDeLaNoche(noche: Noche, tarea: TareaDeLaNoche): Promise<void> {
  const ruta = rutaDeNoche(noche);
  await enFila(ruta, async () => {
    const actual = JSON.parse(await readFile(ruta, "utf8")) as Noche;
    const tareas = actual.tareas.map((x) => x.id === tarea.id ? { ...x, ...tarea, decidida: x.decidida ?? tarea.decidida } : x);
    await escribirDeUna(ruta, `${JSON.stringify({ ...actual, tareas }, null, 2)}\n`);
  });
}

async function guardarFinDeLaNoche(noche: Noche): Promise<void> {
  const ruta = rutaDeNoche(noche);
  await enFila(ruta, async () => {
    const actual = JSON.parse(await readFile(ruta, "utf8")) as Noche;
    await escribirDeUna(ruta, `${JSON.stringify({ ...actual, termino: noche.termino }, null, 2)}\n`);
  });
}

export async function correrNoche(pedido: PedidoDeNoche, deps: DepsDeNoche = {}): Promise<Noche> {
  const ahora = deps.ahora ?? (() => new Date());
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sembrar = deps.sembrar ?? sembrarDeVerdad;
  const contar = deps.contar ?? (() => {});
  // Si `gh` falla (sin red, sin sesión) no se corta la noche: ante la duda, el issue sigue abierto.
  const issueAbierto = deps.issueAbierto ? (numero: number) => deps.issueAbierto!(numero).catch(() => true) : undefined;
  const noche: Noche = {
    id: nuevoId("n", ahora().getTime()),
    repo: pedido.repo,
    agente: pedido.agente,
    desde: ahora().toISOString(),
    hasta: pedido.hasta.toISOString(),
    tareas: pedido.pendientes.map((p) => ({ id: p.id, titulo: p.titulo, tarea: p.tarea, estado: "sin-tiempo", porQue: "no llegó a empezar", gastado: 0, esperas: 0 })),
  };
  await guardarNoche(noche);

  for (const [i, pendiente] of pedido.pendientes.entries()) {
    const t = noche.tareas[i]!;
    if (ahora().getTime() >= pedido.hasta.getTime()) {
      t.porQue = "se hizo la hora antes de empezarla";
      await guardarTareaDeLaNoche(noche, t);
      continue;
    }
    // La de la bandeja se toma de forma atómica: si la desmarcaste o alguien la hizo a mano, no corre.
    if (pendiente.asunto && !(await tomarParaLaNoche(pedido.repo, pendiente.asunto))) {
      t.estado = "no-salio";
      t.porQue = "ya no estaba marcada para esta noche";
      await guardarTareaDeLaNoche(noche, t);
      continue;
    }
    if (pendiente.issue && issueAbierto && !(await issueAbierto(pendiente.issue))) {
      t.estado = "no-salio";
      t.porQue = "el issue se cerró antes de empezar";
      await guardarTareaDeLaNoche(noche, t);
      continue;
    }
    t.empezo = ahora().toISOString();
    contar(`${i + 1}/${pedido.pendientes.length} · ${t.titulo}`);
    for (;;) {
      const control = pendiente.issue && issueAbierto ? new AbortController() : undefined;
      let vigia: NodeJS.Timeout | undefined;
      if (control && pendiente.issue) {
        vigia = setInterval(() => {
          void issueAbierto!(pendiente.issue!).then((abierto) => {
            if (!abierto) control.abort();
          });
        }, 30_000);
        vigia.unref();
      }
      let cosecha: Cosecha;
      try {
        cosecha = await sembrar({ repo: pedido.repo, tarea: pendiente.tarea, agente: pedido.agente, automatico: true, ...(pedido.verificar ? { verificar: pedido.verificar } : {}) }, pendiente.asunto, control?.signal);
      } catch (error) {
        if (vigia) clearInterval(vigia);
        if (control?.signal.aborted) {
          t.estado = "no-salio";
          t.porQue = "el issue se cerró mientras corría; se limpió la rama";
          await guardarTareaDeLaNoche(noche, t);
          break;
        }
        throw error;
      }
      if (vigia) clearInterval(vigia);
      const cerrado = Boolean(control?.signal.aborted) || Boolean(pendiente.issue && issueAbierto && !(await issueAbierto(pendiente.issue)));
      if (cerrado) {
        await limpiarCosechaCerrada(pedido.repo, cosecha);
        t.estado = "no-salio";
        t.porQue = "el issue se cerró mientras corría; se limpió la rama";
        await guardarTareaDeLaNoche(noche, t);
        break;
      }
      t.gastado += cosecha.gastado;
      if (cosecha.ganador) {
        t.estado = "lista";
        t.porQue = cosecha.porQueGano ?? "pasó el portón";
        t.rama = cosecha.entregada?.rama ?? cosecha.ganador.universo.rama;
        t.ruta = cosecha.ganador.universo.ruta;
        if (cosecha.entregada) {
          t.commit = cosecha.entregada.commit;
          t.base = cosecha.entregada.base;
          if (cosecha.entregada.ramaBase) t.ramaBase = cosecha.entregada.ramaBase;
        }
        if (cosecha.parte) t.parte = cosecha.parte;
        const videos = cosecha.ganador.pasadas.flatMap((p) => p.videos ?? []);
        if (videos.length > 0) t.videos = videos;
        if (pendiente.issue) {
          const pr = await (deps.abrirPr ?? abrirOActualizarPr)(pedido.repo, cosecha).catch((error: unknown) => ({ ok: false as const, porQue: error instanceof Error ? error.message : String(error) }));
          if (pr.ok) {
            t.pr = pr.url;
            await (deps.comentarIssue ?? comentarIssue)(pedido.repo, pendiente.issue, pr.url).catch((error: unknown) => contar(`   no pude comentar el issue: ${error instanceof Error ? error.message : String(error)}`));
          } else {
            t.porQue = `${t.porQue}; no se pudo abrir el PR: ${pr.porQue}`;
          }
        }
        const { sinComprobar } = armarInforme({ tarea: pendiente.tarea, fases: fasesDePasadas(cosecha.ganador.pasadas), tocados: (cosecha.ganador.forma?.tocados ?? []).map((x) => x.ruta) });
        if (sinComprobar.length > 0) t.sinComprobar = [...sinComprobar];
        contar(`   lista: ${t.rama}`);
        break;
      }
      if (!sinCupo(cosecha)) {
        t.estado = "no-salio";
        t.porQue = cosecha.porQueGano ?? cosecha.candidatos[0]?.porQue ?? "no pasó el portón";
        contar(`   no salió: ${t.porQue.split("\n")[0]}`);
        break;
      }
      // Sin cupo en ninguna cuenta: se espera la ventana siguiente, si todavía hay noche.
      const queda = pedido.hasta.getTime() - ahora().getTime();
      if (queda <= 0) {
        t.estado = "sin-cupo";
        t.porQue = "se quedó sin cupo y se hizo la hora";
        break;
      }
      t.esperas += 1;
      const espera = Math.min(ESPERA_POR_CUPO, queda);
      contar(`   sin cupo: espero ${Math.round(espera / 60_000)} min y retomo esta misma tarea`);
      await guardarTareaDeLaNoche(noche, t);
      await esperar(espera);
    }
    t.termino = ahora().toISOString();
    if (pendiente.tarjeta) await moverLaTarjeta(pedido.repo, pendiente.tarjeta, t, ahora()).catch(() => {});
    await guardarTareaDeLaNoche(noche, t);
  }
  noche.termino = ahora().toISOString();
  await guardarFinDeLaNoche(noche);
  return noche;
}

/**
 * La tarjeta que hizo la noche, movida sola: con rama, a Para revisar; si no salió, vuelve a Para
 * hacer con el porqué, que es lo que vas a leer a la mañana. Es lo mismo que hace el equipo cuando
 * le das «dale» (ver equipo/con-tarjeta.ts): la tarjeta nunca queda trabada en Haciendo.
 */
async function moverLaTarjeta(repo: string, id: string, t: TareaDeLaNoche, cuando: Date): Promise<void> {
  const en = cuando.toISOString();
  const gasto = t.gastado > 0 ? ` · US$ ${t.gastado.toFixed(2)}` : "";
  await cambiarTarjeta(repo, id, (tarjeta) => {
    const columna = t.estado === "lista" ? "para-revisar" : "para-hacer";
    const texto =
      t.estado === "lista"
        ? `La noche la dejó lista${gasto}: ${t.porQue}. Rama: ${t.rama}.`
        : `La noche no pudo${gasto}: ${t.porQue}`;
    return {
      ...tarjeta,
      ...(t.estado === "lista" && t.rama ? { rama: t.rama } : {}),
      quien: tarjeta.quien ?? "agentes",
      columna,
      movida: en,
      historial: [...tarjeta.historial, { columna, cuando: en }],
      comentarios: [...tarjeta.comentarios, { quien: "dolphin", texto, cuando: en }],
    };
  });
}

async function limpiarCosechaCerrada(repo: string, cosecha: Cosecha): Promise<void> {
  if (!cosecha.entregada) return;
  await descartarRama(repo, cosecha.entregada, cosecha.ganador?.universo.ruta).catch(() => {});
}
