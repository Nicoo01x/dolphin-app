import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { procesoVivo } from "../agentes/ejecutar.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { nuevoId } from "./ids.js";

/**
 * La bandeja: lo que Dolphin encontró para vos sin que se lo pidieras.
 *
 * Dos cosas caen acá, con la misma forma: IDEAS (el scout vio algo en otro
 * producto que acá se podría hacer) y ERRORES (el explorador recorrió la
 * app como una persona y algo no anduvo). Cada asunto se decide con un
 * botón: rechazar —y no vuelve nunca— o implementar, que siembra una rama
 * con un pedido armado entero.
 *
 * La firma es lo que impide el ruido: el mismo error encontrado en diez
 * pasadas es UN asunto, y una idea rechazada no se vuelve a proponer
 * aunque el scout la encuentre otra vez la semana que viene.
 */

export type TipoDeAsunto = "idea" | "error";
/**
 * «anotado» es el estado del medio que faltaba: ni se tira ni se hace ahora, se copia al tablero
 * como idea y se decide ahí (ver descubrimientos-al-tablero.ts). Sin él, lo que no se quería
 * rechazar ni pagar se quedaba en la bandeja para siempre.
 */
export type EstadoDeAsunto = "abierto" | "rechazado" | "implementando" | "hecho" | "anotado";

export interface Fuente {
  readonly titulo: string;
  readonly url: string;
}

export interface Asunto {
  readonly id: string;
  readonly tipo: TipoDeAsunto;
  /** Una línea: lo que se ve en la lista. */
  readonly titulo: string;
  /** Qué es, en voz humana: la idea concreta, o qué pasa y qué se esperaba. */
  readonly detalle: string;
  /** Cómo se haría en ESTE proyecto: es lo que convierte una idea en trabajo. */
  readonly propuesta?: string;
  /** Ideas: dónde se vio. */
  readonly fuentes?: readonly Fuente[];
  /** Errores: los pasos para reproducirlo, en orden. */
  readonly pasos?: readonly string[];
  /** Errores: la pantalla o ruta donde pasa. */
  readonly donde?: string;
  /** Errores: lo que dijo la consola, la red o la medición. */
  readonly evidencia?: string;
  /** Errores: la captura del momento, relativa a `.dolphin/bandeja/`. */
  readonly captura?: string;
  /** Errores: el video del recorrido (en `.dolphin/videos/`) y el segundo en que pasó. */
  readonly video?: string;
  readonly momento?: number;
  /** Quién lo trajo: el explorador, el scout, una persona. */
  readonly origen: string;
  readonly firma: string;
  readonly estado: EstadoDeAsunto;
  readonly creado: string;
  /** Cuántas veces se volvió a encontrar después de la primera. */
  readonly vecesVisto?: number;
  /** Quién comprobó que ya no pasa: no lo cierra una persona, lo prueba Dolphin. */
  readonly resuelto?: string;
  readonly resueltoEn?: string;
  /** Ideas: cuánto vale comparada con las otras (ver valorar.ts). */
  readonly valoracion?: import("./valorar.js").Valoracion;
  /** La aprobó para el turno nocturno, con la fecha en que lo hizo. */
  readonly paraLaNoche?: string;
  /** Mientras una siembra lo implementa: desde cuándo y qué proceso (ver liberarCortados). */
  readonly implementando?: { readonly desde: string; readonly pid?: number };
  /** La última vez que se implementó, la siembra se cortó antes de terminar. */
  readonly cortado?: { readonly en: string; readonly porQue: string };
}

export type AsuntoNuevo = Omit<Asunto, "id" | "firma" | "estado" | "creado" | "vecesVisto">;

export interface Bandeja {
  readonly asuntos: readonly Asunto[];
}

const rutaBandeja = (repo: string) => join(repo, ".dolphin", "bandeja.json");
export const carpetaDeBandeja = (repo: string) => join(repo, ".dolphin", "bandeja");

export function leerBandeja(repo: string): Promise<Bandeja> {
  return leerEstado(rutaBandeja(repo), { asuntos: [] }, (datos) => {
    const asuntos = (datos as { asuntos?: Asunto[] } | null)?.asuntos;
    return { asuntos: Array.isArray(asuntos) ? asuntos : [] };
  });
}

// De una sola vez y en fila (ver escritura.ts): la consola la relee mientras el explorador o Guardian la cambian.
async function guardarBandeja(repo: string, bandeja: Bandeja): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaBandeja(repo), `${JSON.stringify(bandeja, null, 2)}\n`);
}

/** Lo que cambia entre dos pasadas (números, horas, ids) no hace a un asunto distinto. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+/g, "#")
    // Las letras de cualquier idioma: con «[^a-z]», dos ideas en ruso o en japonés tenían la misma firma.
    .replace(/[^\p{L}#/ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La huella de un asunto. Un error es el mismo si pasa en el mismo lugar y
 * dice lo mismo; una idea es la misma si se llama igual — el scout la
 * puede describir distinto cada vez, pero el título lo elige corto.
 */
export function firmaDe(asunto: Pick<AsuntoNuevo, "tipo" | "titulo" | "donde" | "detalle">): string {
  const base =
    asunto.tipo === "error"
      ? `error|${normalizar(asunto.donde ?? "")}|${normalizar(asunto.titulo)}`
      : `idea|${normalizar(asunto.titulo)}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}

export interface ResultadoDeSumar {
  readonly sumados: readonly Asunto[];
  /** Ya estaban abiertos: se cuenta que se volvieron a ver, no se duplican. */
  readonly yaEstaban: number;
  /** Alguien los rechazó antes: no vuelven. */
  readonly rechazados: number;
}

export function sumarAsuntos(repo: string, nuevos: readonly AsuntoNuevo[]): Promise<ResultadoDeSumar> {
  return enFila(rutaBandeja(repo), () => sumarAhora(repo, nuevos));
}

async function sumarAhora(repo: string, nuevos: readonly AsuntoNuevo[]): Promise<ResultadoDeSumar> {
  const bandeja = await leerBandeja(repo);
  const asuntos = [...bandeja.asuntos];
  const porFirma = new Map(asuntos.map((a, i) => [a.firma, i]));

  const sumados: Asunto[] = [];
  let yaEstaban = 0;
  let rechazados = 0;

  for (const nuevo of nuevos) {
    if (nuevo.titulo.trim() === "") continue;
    const firma = firmaDe(nuevo);
    const existente = porFirma.get(firma);

    if (existente !== undefined) {
      const previo = asuntos[existente]!;
      if (previo.estado === "rechazado") {
        rechazados += 1;
      } else if (previo.estado === "hecho" && nuevo.tipo === "error") {
        // Un error que se había cerrado («ya no pasa») y vuelve es una regresión de algo
        // arreglado: se reabre con la evidencia nueva. Antes seguía en «hecho» y no se veía.
        const { resuelto: _resuelto, resueltoEn: _cuando, ...sinCierre } = previo;
        const reabierto: Asunto = {
          ...sinCierre,
          estado: "abierto",
          vecesVisto: (previo.vecesVisto ?? 0) + 1,
          ...(nuevo.captura ? { captura: nuevo.captura } : {}),
          ...(nuevo.video ? { video: nuevo.video } : {}),
          ...(nuevo.momento !== undefined ? { momento: nuevo.momento } : {}),
          ...(nuevo.evidencia ? { evidencia: nuevo.evidencia } : {}),
        };
        asuntos[existente] = reabierto;
        sumados.push(reabierto);
      } else {
        yaEstaban += 1;
        // Visto otra vez: la evidencia se actualiza a la más nueva (la captura, el
        // video y el momento de esta pasada), el resto del asunto queda igual.
        asuntos[existente] = {
          ...previo,
          vecesVisto: (previo.vecesVisto ?? 0) + 1,
          ...(nuevo.captura ? { captura: nuevo.captura } : {}),
          ...(nuevo.video ? { video: nuevo.video } : {}),
          ...(nuevo.momento !== undefined ? { momento: nuevo.momento } : {}),
          ...(nuevo.evidencia ? { evidencia: nuevo.evidencia } : {}),
        };
      }
      continue;
    }

    const asunto: Asunto = {
      ...nuevo,
      titulo: nuevo.titulo.trim(),
      id: nuevoId("a"),
      firma,
      estado: "abierto",
      creado: new Date().toISOString(),
    };
    asuntos.push(asunto);
    porFirma.set(firma, asuntos.length - 1);
    sumados.push(asunto);
  }

  await guardarBandeja(repo, { asuntos });
  return { sumados, yaEstaban, rechazados };
}

/**
 * Cambia el estado de un asunto: es lo que decide la consola (rechazar,
 * reabrir, implementar). «implementando» anota desde cuándo; cualquier otro
 * estado borra las constancias del intento anterior.
 */
export function cambiarEstado(repo: string, id: string, estado: EstadoDeAsunto): Promise<Asunto | null> {
  return enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const indice = bandeja.asuntos.findIndex((a) => a.id === id);
    if (indice < 0) return null;
    const { implementando: previo, cortado: _cortado, ...resto } = bandeja.asuntos[indice]!;
    const asunto: Asunto =
      estado === "implementando"
        ? { ...resto, estado, implementando: { desde: previo?.desde ?? new Date().toISOString(), ...(previo?.pid !== undefined ? { pid: previo.pid } : {}) } }
        : { ...resto, estado };
    const asuntos = [...bandeja.asuntos];
    asuntos[indice] = asunto;
    await guardarBandeja(repo, { asuntos });
    return asunto;
  });
}

/** Marca o desmarca una idea para la próxima noche. Solo un asunto abierto se puede reservar. */
export function marcarParaLaNoche(repo: string, id: string, fecha: string | undefined): Promise<Asunto | null> {
  return enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const indice = bandeja.asuntos.findIndex((a) => a.id === id);
    const previo = bandeja.asuntos[indice];
    if (!previo || previo.estado !== "abierto") return null;
    const { paraLaNoche: _anterior, ...resto } = previo;
    const asunto: Asunto = fecha ? { ...resto, paraLaNoche: fecha } : resto;
    const asuntos = [...bandeja.asuntos];
    asuntos[indice] = asunto;
    await guardarBandeja(repo, { asuntos });
    return asunto;
  });
}

/** Toma una aprobación nocturna de forma atómica antes de lanzar su siembra. */
export function tomarParaLaNoche(repo: string, id: string): Promise<Asunto | null> {
  return enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const indice = bandeja.asuntos.findIndex((a) => a.id === id);
    const previo = bandeja.asuntos[indice];
    if (!previo || previo.estado !== "abierto" || !previo.paraLaNoche) return null;
    const { paraLaNoche: _paraLaNoche, cortado: _cortado, ...resto } = previo;
    const asunto: Asunto = { ...resto, estado: "implementando", implementando: { desde: new Date().toISOString() } };
    const asuntos = [...bandeja.asuntos];
    asuntos[indice] = asunto;
    await guardarBandeja(repo, { asuntos });
    return asunto;
  });
}

/**
 * Cada cuánto late la siembra que implementa un asunto, y cuánto silencio la
 * da por cortada. El latido va en su propio archivo (`.dolphin/latidos/`) y
 * no en la bandeja: la bandeja la escriben varios procesos, y un latido por
 * minuto ahí podía pisar un «rechazar» que caía en el mismo instante.
 */
export const LATIDO_MS = 60_000;
const SIN_LATIDO_MS = 3 * LATIDO_MS;

const rutaLatido = (repo: string, id: string) => join(repo, ".dolphin", "latidos", `${id.replace(/[^\w-]/g, "_")}.json`);

/** Late por la siembra que implementa el asunto: «sigo acá». */
export async function latirAsunto(repo: string, id: string, pid: number, ahora = Date.now()): Promise<void> {
  await carpetaDeDolphin(repo);
  await mkdir(join(repo, ".dolphin", "latidos"), { recursive: true });
  await escribirDeUna(rutaLatido(repo, id), `${JSON.stringify({ pid, latido: ahora })}\n`);
}

async function leerLatido(repo: string, id: string): Promise<{ pid?: number; latido?: number } | null> {
  try {
    return JSON.parse(await readFile(rutaLatido(repo, id), "utf8")) as { pid?: number; latido?: number };
  } catch {
    return null;
  }
}

/**
 * Lo toma la siembra que lo implementa, apenas arranca: anota su pid y late
 * por primera vez. Solo si sigue abierto o implementando: si mientras tanto
 * alguien lo rechazó, o una comprobación lo cerró, eso no se pisa.
 */
export async function tomarAsunto(repo: string, id: string, pid: number, ahora = new Date()): Promise<Asunto | null> {
  const tomado = await enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const indice = bandeja.asuntos.findIndex((a) => a.id === id);
    const previo = bandeja.asuntos[indice];
    if (!previo || (previo.estado !== "abierto" && previo.estado !== "implementando")) return null;
    const { cortado: _cortado, ...resto } = previo;
    const asunto: Asunto = { ...resto, estado: "implementando", implementando: { desde: previo.implementando?.desde ?? ahora.toISOString(), pid } };
    const asuntos = [...bandeja.asuntos];
    asuntos[indice] = asunto;
    await guardarBandeja(repo, { asuntos });
    return asunto;
  });
  if (tomado) await latirAsunto(repo, id, pid, ahora.getTime());
  return tomado;
}

/**
 * Lo devuelve la siembra al terminar: hecho si una rama pasó, abierto si no.
 * Solo si sigue siendo suyo —implementando, con su pid—: si lo rechazaron
 * mientras corría, o ya lo tomó otra siembra, eso queda como está.
 */
export async function soltarAsunto(repo: string, id: string, pid: number, estado: "hecho" | "abierto"): Promise<Asunto | null> {
  const soltado = await enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const indice = bandeja.asuntos.findIndex((a) => a.id === id);
    const previo = bandeja.asuntos[indice];
    if (!previo || previo.estado !== "implementando" || (previo.implementando?.pid ?? pid) !== pid) return null;
    const { implementando: _implementando, cortado: _cortado, ...resto } = previo;
    const asunto: Asunto = { ...resto, estado };
    const asuntos = [...bandeja.asuntos];
    asuntos[indice] = asunto;
    await guardarBandeja(repo, { asuntos });
    return asunto;
  });
  await rm(rutaLatido(repo, id), { force: true }).catch(() => {});
  return soltado;
}

/**
 * Una siembra que se corta —se cerró la app, se apagó la máquina— no llega a
 * devolver su asunto, y quedaba «implementando» para siempre: Implementar
 * contestaba 409 y no había cómo volver a intentarlo. Vuelve a abierto, con la
 * constancia del corte, lo que implementaba un proceso que ya no existe o que
 * dejó de latir: en Windows un pid muerto se le da enseguida a otro programa,
 * así que «el pid existe» solo no alcanza. Sin latido todavía (la siembra
 * recién lanzada), cuenta desde que se marcó.
 */
export function liberarCortados(
  repo: string,
  vivo: (pid: number) => boolean = procesoVivo,
  ahora = new Date(),
): Promise<Asunto[]> {
  return enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const liberados: Asunto[] = [];
    const asuntos: Asunto[] = [];
    for (const a of bandeja.asuntos) {
      if (a.estado !== "implementando") {
        asuntos.push(a);
        continue;
      }
      const latido = await leerLatido(repo, a.id);
      // Sin latido ni «desde» es de antes de que se anotara: ya nadie lo está implementando.
      const ultimo = latido?.latido ?? Date.parse(a.implementando?.desde ?? "");
      const pid = a.implementando?.pid ?? latido?.pid;
      const sigue = (pid === undefined || vivo(pid)) && ahora.getTime() - ultimo < SIN_LATIDO_MS;
      if (sigue) {
        asuntos.push(a);
        continue;
      }
      const { implementando: _implementando, ...resto } = a;
      const liberado: Asunto = {
        ...resto,
        estado: "abierto",
        cortado: { en: ahora.toISOString(), porQue: "la siembra que lo implementaba se cortó antes de terminar" },
      };
      liberados.push(liberado);
      asuntos.push(liberado);
      await rm(rutaLatido(repo, a.id), { force: true }).catch(() => {});
    }
    if (liberados.length > 0) await guardarBandeja(repo, { asuntos });
    return liberados;
  });
}

/**
 * El explorador volvió a tocar algo y anduvo: los errores que tenía
 * anotados ahí se cierran solos, con la constancia de la comprobación.
 * Es la otra mitad de «el orquestador no le cree al agente»: tampoco le
 * cree a una persona que dice «ya está». Lo vuelve a probar.
 */
export async function marcarResueltos(
  repo: string,
  comprobados: readonly { readonly donde: string; readonly texto: string }[],
): Promise<Asunto[]> {
  if (comprobados.length === 0) return [];
  const anduvo = (a: Asunto) =>
    a.tipo === "error" && a.origen === "explorador" && comprobados.some((c) => c.donde === a.donde && a.titulo.includes(`«${c.texto}»`));
  return cerrarAsuntos(repo, anduvo, "el explorador lo volvió a probar y ya no pasa");
}

/**
 * Cierra los asuntos abiertos que cumplen la condición, con la constancia
 * de quién comprobó que ya no pasa. Lo usa Guardian: una fase que se había
 * roto y vuelve a pasar cierra su tarjeta sola.
 */
export function cerrarAsuntos(repo: string, cumple: (asunto: Asunto) => boolean, resuelto: string): Promise<Asunto[]> {
  return enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const cuando = new Date().toISOString();
    const cerrados: Asunto[] = [];
    const asuntos = bandeja.asuntos.map((a) => {
      if ((a.estado !== "abierto" && a.estado !== "implementando") || !cumple(a)) return a;
      const { implementando: _implementando, cortado: _cortado, ...resto } = a;
      const cerrado: Asunto = { ...resto, estado: "hecho", resuelto, resueltoEn: cuando };
      cerrados.push(cerrado);
      return cerrado;
    });
    if (cerrados.length > 0) await guardarBandeja(repo, { asuntos });
    return cerrados;
  });
}

/**
 * El pedido que recibe el agente cuando tocás «Implementar» o «Arreglar».
 *
 * Va entero porque el agente arranca de cero: qué es, de dónde salió, cómo
 * se haría acá y —lo que más falta en un pedido normal— cuándo está
 * terminado. El perfil del proyecto y las reglas de la casa se suman
 * después, al sembrar, igual que en cualquier otra siembra.
 */
export function promptDeImplementacion(asunto: Asunto): string {
  const partes: string[] = [];

  if (asunto.tipo === "error") {
    partes.push(`Arreglá este error que Dolphin encontró recorriendo la app como una persona: ${asunto.titulo}`);
    partes.push("", "Qué pasa:", asunto.detalle);
    if (asunto.donde) partes.push("", `Dónde: ${asunto.donde}`);
    if (asunto.pasos && asunto.pasos.length > 0) {
      partes.push("", "Cómo reproducirlo:", ...asunto.pasos.map((p, i) => `${i + 1}. ${p}`));
    }
    if (asunto.evidencia) partes.push("", "Lo que se midió:", "```", asunto.evidencia.slice(0, 3000), "```");
    if (asunto.propuesta) partes.push("", `Por dónde va el arreglo: ${asunto.propuesta}`);
    partes.push(
      "",
      "Está terminado cuando:",
      "- siguiendo los pasos de arriba, el error ya no aparece;",
      "- hay un test que reproduce el error y ahora pasa (si el repo tiene tests);",
      "- no se rompió nada de lo que ya andaba: corré los tests que haya.",
      "",
      "Arreglá la causa, no el síntoma, y con el cambio más chico que la resuelva.",
    );
  } else {
    partes.push(`Implementá esta idea en el proyecto: ${asunto.titulo}`);
    partes.push("", "La idea:", asunto.detalle);
    if (asunto.fuentes && asunto.fuentes.length > 0) {
      partes.push("", "Dónde se vio (para entender cómo lo resolvieron otros):");
      partes.push(...asunto.fuentes.map((f) => `- ${f.titulo}: ${f.url}`));
    }
    if (asunto.propuesta) partes.push("", "Cómo se haría acá:", asunto.propuesta);
    partes.push(
      "",
      "Está terminado cuando:",
      "- la funcionalidad anda de punta a punta, no solo la parte fácil;",
      "- respeta las convenciones del repo y el perfil del proyecto;",
      "- tiene tests que la cubren (si el repo tiene tests) y los que ya había siguen pasando;",
      "- cubre los estados de verdad: vacío, error, carga y datos largos, si tiene pantalla.",
      "",
      "No copies a quien lo hizo primero: adaptalo a cómo está hecho este proyecto.",
    );
  }

  return partes.join("\n");
}
