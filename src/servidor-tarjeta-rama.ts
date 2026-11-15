import type { IncomingMessage, ServerResponse } from "node:http";
import { leerBitacora, type ComandoCorrido } from "./nucleo/bitacora.js";
import { descartarRama, estadoDeRama, mergearRama, type RamaEntregada } from "./nucleo/entrega.js";
import { gitValor } from "./nucleo/git.js";
import { cambiarTarjeta, comentarLineaDeTarjeta, comentarTarjeta, moverTarjeta, buscarTarjeta, type Tarjeta } from "./nucleo/tarjetas.js";
import { recordarCandidato } from "./nucleo/memoria.js";
import { probarRama } from "./nucleo/porton-de-una-rama.js";
import { commitsDeLaRama, detalleDeCommit, diffDeCommit, ramaBase } from "./nucleo/vista-git.js";
import { cuerpoDeLaConsola, json } from "./servidor-comun.js";

/**
 * Revisar la rama de una tarjeta sin salir de la tarjeta (ver docs/idea.md).
 *
 * Sembrar y cosechar dejaron de ser una puerta aparte (Nico, 31/10: «que lo tenga integrado
 * directamente»): la tarjeta es el lugar. Termina en Para revisar con su rama, y acá mismo se ve
 * qué cambió y se decide.
 *
 *   GET  /api/tablero/<id>/rama       lo que cambió, y si se puede integrar
 *   POST /api/tablero/<id>/probar     la cruza por el portón (solo lo gratis) y deja el veredicto
 *   POST /api/tablero/<id>/integrar   la mergea y la tarjeta pasa a Hecho
 *   POST /api/tablero/<id>/comentario {archivo, linea, texto, patron?} marca una línea del diff
 *   POST /api/tablero/<id>/devolver   {porQue} tira la rama y la tarjeta vuelve a Para hacer
 *
 * Integrar toca el repo de verdad, así que se niega por las mismas razones que en la terminal: con
 * cambios sin commitear o parado en otra rama, no se toca nada (ver nucleo/entrega.ts).
 */

/** Lo que cambió una rama, archivo por archivo, con su diff y con lo que se corrió sobre ella. */
export interface CambiosDeLaRama {
  readonly rama: string;
  readonly estado: "probada" | "mergeada" | "descartada";
  readonly commits: number;
  readonly archivos: readonly { readonly archivo: string; readonly agregadas: number; readonly quitadas: number }[];
  readonly diff: string;
  readonly recortado: boolean;
  /**
   * Lo que se corrió de verdad sobre la rama, con su código de salida (ver nucleo/bitacora.ts). El
   * diff dice qué quedó escrito; esto dice qué se ejecutó, que es lo que el agente no narra.
   */
  readonly corrido: readonly ComandoCorrido[];
}

/** Hasta dónde se lee el diff de una rama: lo que entra en la tarjeta sin trabar la consola. */
const TOPE_DE_DIFF = 2000;

async function entregadaDe(repo: string, rama: string): Promise<RamaEntregada | undefined> {
  const commit = await gitValor(["rev-parse", rama], repo).catch(() => "");
  if (!commit) return undefined;
  const base = await ramaBase(repo);
  const desde = base ? await gitValor(["merge-base", base, rama], repo).catch(() => commit) : commit;
  return { rama, commit, base: desde, ...(base ? { ramaBase: base } : {}) };
}

/** Lo que cambió la rama de una tarjeta. `undefined` si la tarjeta no tiene rama o ya no existe. */
export async function cambiosDeLaRama(repo: string, rama: string): Promise<CambiosDeLaRama | undefined> {
  const entregada = await entregadaDe(repo, rama);
  if (!entregada) return undefined;
  const estado = await estadoDeRama(repo, entregada);
  const { commits, propios } = await commitsDeLaRama(repo, rama, 100);
  // Lo que trajo la rama: sus commits propios, del más viejo al más nuevo.
  const suyos = commits.slice(0, propios ?? commits.length).reverse();
  const detalles = await Promise.all(suyos.map((c) => detalleDeCommit(repo, c.hash)));
  const porArchivo = new Map<string, { archivo: string; agregadas: number; quitadas: number }>();
  for (const d of detalles) {
    for (const a of d.archivos) {
      const previo = porArchivo.get(a.archivo);
      porArchivo.set(a.archivo, {
        archivo: a.archivo,
        agregadas: (previo?.agregadas ?? 0) + a.agregadas,
        quitadas: (previo?.quitadas ?? 0) + a.quitadas,
      });
    }
  }
  const diffs = await Promise.all(suyos.map((c) => diffDeCommit(repo, c.hash, undefined, TOPE_DE_DIFF)));
  return {
    rama,
    estado,
    commits: suyos.length,
    archivos: [...porArchivo.values()].sort((a, b) => b.agregadas + b.quitadas - (a.agregadas + a.quitadas)),
    diff: diffs.map((d) => d.texto).join("\n"),
    recortado: diffs.some((d) => d.recortado),
    corrido: await leerBitacora(repo, rama),
  };
}

/** Por qué no se puede revisar esta tarjeta ahora; nada si se puede. */
function porQueNo(t: Tarjeta): string | undefined {
  if (!t.rama) return "esta tarjeta no tiene una rama: todavía no la hizo nadie";
  return undefined;
}

export async function rutaDeLaRamaDeTarjeta(
  ruta: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  repo: string,
  token: string,
): Promise<boolean> {
  const [, idCrudo = "", accion = ""] = /^\/api\/tablero\/([^/]+)\/(rama|probar|integrar|devolver|comentario)$/.exec(ruta) ?? [];
  if (!accion) return false;
  if (accion === "rama" ? pedido.method !== "GET" : pedido.method !== "POST") return false;

  let tarjeta: Tarjeta;
  try {
    tarjeta = await buscarTarjeta(repo, decodeURIComponent(idCrudo));
  } catch (error) {
    json(respuesta, 404, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    return true;
  }
  const no = porQueNo(tarjeta);
  if (no) {
    json(respuesta, 409, { ok: false, porQue: no });
    return true;
  }
  const rama = tarjeta.rama!;

  if (accion === "rama") {
    const cambios = await cambiosDeLaRama(repo, rama);
    if (!cambios) {
      json(respuesta, 200, { ok: true, cambios: null, porQue: `la rama «${rama}» ya no está en el repo` });
      return true;
    }
    json(respuesta, 200, { ok: true, cambios });
    return true;
  }

  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 20_000);
  if (!datos) return true;

  /*
   * Probar la rama antes de integrarla, desde la tarjeta: cruza el portón en un worktree propio y
   * descartable, así que no toca tu árbol de trabajo, y **solo corre las fases gratis** — las que
   * pagan un modelo quedan listadas aparte. Es lo que falta entre «ver el diff» y «integrar»:
   * mirar un diff no dice si los tests pasan.
   *
   * El veredicto queda como comentario de la tarjeta, a nombre de Dolphin: una prueba que no deja
   * rastro obliga a volver a correrla cada vez que alguien pregunta cómo salió.
   */
  if (accion === "probar") {
    const probada = await probarRama(repo, rama);
    const fallidas = probada.fases.filter((f) => !f.paso);
    const resumen = probada.paso
      ? `Probada: cruzó el portón (${probada.fases.length} ${probada.fases.length === 1 ? "fase" : "fases"} gratis).`
      : `Probada: rebotó en ${fallidas.map((f) => f.nombre).join(", ")}.`;
    await comentarTarjeta(repo, tarjeta.id, resumen, "dolphin");
    // Y fase por fase, para la tira del portón que dibuja el escritorio en la tarjeta.
    const porton = [
      ...probada.fases.map((f) => ({ fase: f.nombre, estado: f.salteada ? ("salteada" as const) : f.paso ? ("paso" as const) : ("fallo" as const) })),
      ...probada.sinCorrer.map((fase) => ({ fase, estado: "sin-correr" as const })),
    ];
    await cambiarTarjeta(repo, tarjeta.id, (t) => ({ ...t, porton }));
    json(respuesta, 200, { ok: true, ...probada });
    return true;
  }

  // Un comentario sobre una línea del diff. Se dejan varios y después se
  // devuelve la tarjeta una sola vez: así se revisa de corrido, como se revisa
  // un PR, en vez de rebotar la rama en el primer renglón que no gustó.
  if (accion === "comentario") {
    const archivo = typeof datos.archivo === "string" ? datos.archivo.trim() : "";
    const linea = typeof datos.linea === "number" ? datos.linea : Number.NaN;
    const texto = typeof datos.texto === "string" ? datos.texto.trim().slice(0, 2000) : "";
    if (!archivo || !Number.isInteger(linea) || linea <= 0 || !texto) {
      json(respuesta, 400, { ok: false, porQue: "un comentario de línea necesita archivo, línea y texto" });
      return true;
    }
    const conComentario = await comentarLineaDeTarjeta(repo, tarjeta.id, { archivo, linea, texto });
    // Con un patrón, la corrección no se queda en esta rama: queda propuesta a
    // la memoria, y aprobarla la vuelve un verificador que el portón corre para
    // siempre. Candidata y no activa: una regla que corta ramas se aprueba a mano.
    const patron = typeof datos.patron === "string" ? datos.patron.trim() : "";
    let regla = null;
    let porQueNoLaRegla: string | undefined;
    if (patron) {
      // Si el patrón no sirve hay que decirlo: tragarse el error dejaba a la
      // persona creyendo que el portón iba a chequear algo que nunca se guardó.
      try {
        regla = await recordarCandidato(repo, texto, `lo marcaste en ${archivo}:${linea}`, patron);
      } catch (error) {
        porQueNoLaRegla = error instanceof Error ? error.message : String(error);
      }
    }
    json(respuesta, 200, {
      ok: true,
      tarjeta: conComentario,
      ...(regla ? { candidata: regla } : {}),
      ...(porQueNoLaRegla ? { porQueNoLaRegla } : {}),
    });
    return true;
  }

  if (accion === "integrar") {
    const entregada = await entregadaDe(repo, rama);
    if (!entregada) {
      json(respuesta, 409, { ok: false, porQue: `la rama «${rama}» ya no está en el repo` });
      return true;
    }
    const resultado = await mergearRama(repo, entregada, tarjeta.titulo);
    if (!resultado.ok) {
      json(respuesta, 409, { ok: false, porQue: resultado.porQue });
      return true;
    }
    await comentarTarjeta(repo, tarjeta.id, `Integrada: la rama ${rama} entró en ${entregada.ramaBase ?? "la rama base"}.`);
    json(respuesta, 200, { ok: true, tarjeta: await moverTarjeta(repo, tarjeta.id, "hecho") });
    return true;
  }

  // devolver: la rama se va y la tarjeta vuelve a Para hacer con el porqué, que es lo que el equipo
  // va a leer la próxima vez (objetivoDeTarjeta le pasa los comentarios al agente).
  const porQue = typeof datos.porQue === "string" ? datos.porQue.trim().slice(0, 2000) : "";
  // Si ya marcaste líneas del diff, no hay que volver a escribir lo mismo abajo:
  // esas marcas SON el motivo, y le llegan al agente con su archivo y su línea.
  const marcadas = tarjeta.comentarios.filter((c) => c.donde).length;
  if (!porQue && marcadas === 0) {
    json(respuesta, 400, { ok: false, porQue: "decí qué hay que cambiar: es lo que va a leer quien la retome" });
    return true;
  }
  const entregada = await entregadaDe(repo, rama);
  if (entregada) await descartarRama(repo, entregada);
  await comentarTarjeta(
    repo,
    tarjeta.id,
    porQue ? `Devuelta: ${porQue}` : `Devuelta: ${marcadas} ${marcadas === 1 ? "línea marcada" : "líneas marcadas"} en la revisión.`,
    // Lo que escribe Dolphin para dejar constancia va a su nombre: así no se le
    // repite al agente como si fuera una corrección más (ver loQueSeLeMarco).
    porQue ? "vos" : "dolphin",
  );
  // Se le saca la rama: la que había ya no está, y la tarjeta arranca de nuevo desde la base.
  await cambiarTarjeta(repo, tarjeta.id, ({ rama: _rama, ...resto }) => resto as Tarjeta);
  json(respuesta, 200, { ok: true, tarjeta: await moverTarjeta(repo, tarjeta.id, "para-hacer") });
  return true;
}
