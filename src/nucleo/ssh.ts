import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna } from "./escritura.js";
import type { Correr } from "./pr.js";
import { salioElTurno, type Turno } from "./calendario.js";
import { comandoDeCola, comandoDeConsulta, comandoDeCorte, comandoDesprendido, idValido, leerEstadoRemoto, seguirTurno } from "./turno-remoto.js";
import { anotarDesprendido, tacharDesprendido } from "./turnos-desprendidos.js";

/**
 * Un turno que corre en otra máquina —tu VPS— por SSH.
 *
 * Dolphin está clonado allá y el repo también. El comando se arma acá, se
 * corre con `ssh -o BatchMode=yes` (sin preguntar nada: si la clave no
 * está, falla en vez de quedarse esperando una contraseña que nadie va a
 * escribir a las 3 de la mañana), y la cosecha vuelve a esta máquina para
 * que la consola la muestre como cualquier otra. El turno corre desprendido
 * allá y desde acá se lo sigue con consultas cortas: un corte de red o la PC
 * suspendida no lo matan (ver turno-remoto.ts).
 *
 * Se configura por repo en dolphin.config.json:
 *   "hosts": { "vps": { "destino": "nico@1.2.3.4", "repo": "/var/www/app", "dolphin": "/opt/dolphin-app" } }
 */

export interface Host {
  /** usuario@máquina, o un alias de ~/.ssh/config. */
  readonly destino: string;
  /** Dónde está el repo allá. */
  readonly repo: string;
  /** Dónde está Dolphin allá. */
  readonly dolphin: string;
}

/**
 * Adónde va un turno por SSH: a la máquina que quedó firmada al agendarlo
 * (ver calendario.ts), y solo si el host del repo sigue siendo esa. Si el
 * dolphin.config.json cambió adónde apunta el nombre, no se corre en
 * ninguna de las dos: se avisa y se agenda de nuevo.
 */
export function maquinaDelTurno(
  turno: Pick<Turno, "host" | "maquina">,
  hostsDeAhora: Readonly<Record<string, Host>>,
): { readonly ok: true; readonly maquina: Host } | { readonly ok: false; readonly porQue: string } {
  const nombre = turno.host ?? "";
  if (!turno.maquina) return { ok: false, porQue: "se agendó sin la máquina adonde va: agendalo de nuevo" };
  const ahora = hostsDeAhora[nombre];
  if (!ahora) return { ok: false, porQue: `ya no hay un host «${nombre}» en dolphin.config.json` };
  const firmada = turno.maquina;
  if (ahora.destino !== firmada.destino || ahora.repo !== firmada.repo || ahora.dolphin !== firmada.dolphin) {
    return { ok: false, porQue: `«${nombre}» apunta a otro lado desde que se agendó (${firmada.destino} → ${ahora.destino}): agendalo de nuevo si querés que vaya allá` };
  }
  return { ok: true, maquina: firmada };
}

/** Comillas simples de POSIX: lo único que no hay que escapar es todo, salvo la comilla misma. */
export function citarShell(texto: string): string {
  return `'${texto.replace(/'/g, `'\\''`)}'`;
}

/** El comando que corre allá: la misma siembra (o cola) que acá, corriendo sola. */
export function comandoRemoto(turno: Pick<Turno, "tareas" | "agente" | "modelo">, host: Host): string {
  const varias = turno.tareas.length > 1;
  const partes = [
    "cd",
    citarShell(host.dolphin),
    "&&",
    "node",
    "--import",
    "tsx",
    varias ? "src/cola-cli.ts" : "src/cli.ts",
    "--repo",
    citarShell(host.repo),
    "--agente",
    citarShell(turno.agente),
    ...(turno.modelo ? ["--modelo", citarShell(turno.modelo)] : []),
    "--automatico",
    ...(varias ? turno.tareas.flatMap((t) => ["--tarea", citarShell(t)]) : ["--tarea", citarShell(turno.tareas[0] ?? ""), "--igual"]),
  ];
  return partes.join(" ");
}

export interface ResultadoRemoto {
  readonly salio: boolean;
  readonly porQue?: string;
  /** Dónde quedó, en esta máquina, la cosecha que se trajo. */
  readonly cosecha?: string;
}

/**
 * Un destino que se le puede pasar a ssh: `usuario@máquina` o un alias. Uno
 * que empieza con «-» ssh lo leería como una opción (`-oProxyCommand=…`
 * corre lo que quiera en esta máquina), y el `dolphin.config.json` que lo
 * trae viene versionado con el código.
 */
export function destinoValido(destino: string): boolean {
  return /^[\w.@:%[\]-]+$/.test(destino) && !destino.startsWith("-");
}

/** Lo más que puede durar un turno allá: una siembra larga, no una noche entera colgada. */
export const TOPE_DEL_TURNO = 3 * 60 * 60_000;
/** Acá se espera un poco más que el tope de allá: así el `timeout` de allá llega primero y deja su código. */
const MARGEN_DE_ACA = 10 * 60_000;
/** `timeout` sale con 124 cuando corta por tiempo. */
const CORTADO_POR_TOPE = 124;

/** Lo que se puede cambiar en los tests: cada cuánto se pregunta, cómo se espera y qué hora es. */
export interface OpcionesDeSsh {
  readonly cada?: number;
  readonly esperar?: (ms: number, senal?: AbortSignal) => Promise<void>;
  readonly ahora?: () => number;
}

/**
 * Corre el turno allá, desprendido, lo sigue hasta que termina y se trae la
 * cosecha. `correr` es el de verdad en producción y un doble en los tests:
 * así se prueba sin tocar ningún VPS.
 */
export async function correrPorSsh(
  repoLocal: string,
  turno: Pick<Turno, "tareas" | "agente" | "modelo"> & { readonly id?: string },
  host: Host,
  correr: Correr,
  senal?: AbortSignal,
  opciones: OpcionesDeSsh = {},
): Promise<ResultadoRemoto> {
  if (!destinoValido(host.destino)) return { salio: false, porQue: `«${host.destino}» no es un destino de ssh: va usuario@máquina o un alias` };
  const id = turno.id && idValido(turno.id) ? turno.id : `r${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const ahora = opciones.ahora ?? Date.now;
  // `--` antes del destino: nada de lo que venga después se lee como opción.
  // ServerAlive: una conexión muerta se nota en dos minutos, no a la mañana.
  // Todo va por `sh -c`: el shell de login de allá puede no ser POSIX (fish).
  const ssh = (comando: string, tope?: number) =>
    correr("ssh", ["-o", "BatchMode=yes", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=4", "--", host.destino, comando], repoLocal, {
      ...(tope ? { tope } : {}),
      ...(senal ? { senal } : {}),
    });
  const enSh = (comando: string, tope = 30_000) => ssh(`sh -c ${citarShell(comando)}`, tope);
  const enPalabras = (error: unknown) => {
    const detalle = String((error as { stderr?: string }).stderr ?? (error as Error).message ?? error);
    return `en ${host.destino}: ${detalle.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 200) ?? "falló"}`;
  };
  const ultimaLinea = async () =>
    (await enSh(comandoDeCola(host, id)).catch(() => ""))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .at(-1)
      ?.slice(0, 200);

  // Se lanza desprendido: si después se corta el ssh, allá sigue corriendo.
  const lanzado = ahora();
  let inicial;
  try {
    inicial = leerEstadoRemoto(await enSh(comandoDesprendido(comandoRemoto(turno, host), host, id, TOPE_DEL_TURNO / 1000), 60_000));
  } catch (error) {
    return { salio: false, porQue: enPalabras(error) };
  }
  if (!inicial?.pid) {
    const linea = await ultimaLinea();
    return { salio: false, porQue: `en ${host.destino}: el turno no arrancó${linea ? ` (${linea})` : ""}` };
  }
  await anotarDesprendido(repoLocal, id, host, new Date(lanzado)).catch(() => undefined);

  const fin = await seguirTurno({
    consultar: () => enSh(comandoDeConsulta(host, id)),
    tope: TOPE_DEL_TURNO + MARGEN_DE_ACA,
    desde: lanzado,
    ahora,
    ...(opciones.cada !== undefined ? { cada: opciones.cada } : {}),
    ...(opciones.esperar ? { esperar: opciones.esperar } : {}),
    ...(senal ? { senal } : {}),
  });
  const terminar = async (como: string, resultado: ResultadoRemoto): Promise<ResultadoRemoto> => {
    await tacharDesprendido(repoLocal, id, como).catch(() => undefined);
    return resultado;
  };

  if (fin.que === "cancelado") {
    // La señal ya está abortada: el corte va por una conexión propia, sin ella.
    await correr("ssh", ["-o", "BatchMode=yes", "--", host.destino, `sh -c ${citarShell(comandoDeCorte(host, id, inicial.pid, inicial.arranque))}`], repoLocal, { tope: 30_000 }).catch(() => undefined);
    return terminar("cancelado", { salio: false, porQue: `se canceló mientras corría en ${host.destino} (lo corté allá también)` });
  }
  if (fin.que === "tope") {
    if (!fin.sinRespuesta) await enSh(comandoDeCorte(host, id, inicial.pid, inicial.arranque)).catch(() => undefined);
    return terminar("tope", {
      salio: false,
      porQue: fin.sinRespuesta
        ? `${host.destino} no contesta y pasó el tope de ${TOPE_DEL_TURNO / 3_600_000} h: mirá el turno con «dolphin turno adjuntar ${id}»`
        : `pasó el tope de ${TOPE_DEL_TURNO / 3_600_000} h en ${host.destino}: lo corté`,
    });
  }
  if (fin.que === "se-corto") {
    const linea = await ultimaLinea();
    return terminar("se cortó", { salio: false, porQue: `se cortó en ${host.destino}: el proceso ya no está y no dejó su código (¿se reinició la máquina?)${linea ? `. Lo último del log: ${linea}` : ""}` });
  }
  if (fin.codigo !== 0) {
    const linea = await ultimaLinea();
    const motivo = fin.codigo === CORTADO_POR_TOPE ? `pasó el tope de ${TOPE_DEL_TURNO / 3_600_000} h` : `salió con código ${fin.codigo}`;
    return terminar(motivo, { salio: false, porQue: `en ${host.destino}: ${motivo}${linea ? ` (${linea})` : ""}` });
  }
  await tacharDesprendido(repoLocal, id, "terminó").catch(() => undefined);

  // Con el reloj de allá: lo de antes de que arrancara es de otra corrida.
  const desde = inicial.inicio && !Number.isNaN(Date.parse(inicial.inicio)) ? new Date(inicial.inicio).toISOString() : new Date(lanzado - 10 * 60_000).toISOString();
  const varias = turno.tareas.length > 1;
  if (varias) {
    // Varias tareas van a la cola: lo que salió lo dice la cola de allá, no la última cosecha.
    const cola = await ssh(`cat ${citarShell(`${host.repo}/.dolphin/cola.json`)}`).catch(() => "");
    let tareas: { creada: string; estado: string }[] = [];
    try {
      tareas = (JSON.parse(cola) as { tareas?: { creada: string; estado: string }[] }).tareas ?? [];
    } catch {
      return { salio: false, porQue: `corrió en ${host.destino} pero su cola no se entiende` };
    }
    return salioElTurno(true, { tareas }, desde);
  }

  // La cosecha vuelve: es lo que hace que un turno remoto se vea igual que uno local.
  const crudo = await ssh(`cat ${citarShell(`${host.repo}/.dolphin/ultima.json`)}`).catch(() => "");
  if (!crudo) return { salio: false, porQue: `corrió en ${host.destino} pero no dejó cosecha` };

  let cosecha: { cuando?: string; ganador?: unknown; porQueGano?: string };
  try {
    cosecha = JSON.parse(crudo) as typeof cosecha;
  } catch {
    return { salio: false, porQue: `la cosecha que volvió de ${host.destino} no se entiende` };
  }
  const veredicto = salioElTurno(false, { cosecha }, desde);
  // Una cosecha de antes es de otra corrida: no se trae ni se da por buena.
  if ((cosecha.cuando ?? "") < desde) return { salio: false, porQue: `corrió en ${host.destino} pero no dejó una cosecha nueva` };

  const nombre = `${(cosecha.cuando ?? new Date().toISOString()).replace(/[:.]/g, "-")}.json`;
  const carpeta = await carpetaDeDolphin(repoLocal, "cosechas");
  const ruta = join(carpeta, nombre);
  await escribirDeUna(ruta, crudo);
  await escribirDeUna(join(repoLocal, ".dolphin", "ultima.json"), crudo);

  return { salio: veredicto.salio, ...(veredicto.porQue ? { porQue: veredicto.porQue } : {}), cosecha: ruta };
}
