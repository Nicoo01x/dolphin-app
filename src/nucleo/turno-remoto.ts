import type { Host } from "./ssh.js";

/**
 * Un turno en el VPS que sobrevive al corte (la idea de herdr: el trabajo vive allá, la conexión
 * solo lo mira).
 *
 * Antes el turno corría en primer plano DENTRO de la conexión ssh: si se cortaba el wifi o la PC se
 * suspendía, ssh moría, el turno se daba por fallado y allá quedaba un proceso a medias. Ahora se
 * lanza desprendido (`setsid nohup … &`, con su log y su estado en `.dolphin/turnos/<id>.*` del repo
 * de allá) y desde acá se lo sigue con consultas cortas que pueden fallar sin que pase nada: un corte
 * de red solo alarga la espera hasta la próxima. Lo único que lo da por perdido es el tope total, o
 * que allá el proceso ya no esté y no haya dejado su código (el VPS se reinició).
 *
 * Este archivo arma los comandos de allá y lee lo que contestan; correr y traer la cosecha sigue en
 * ssh.ts.
 */

/** Lo que el turno de allá dejó escrito sobre sí mismo. */
export interface EstadoRemoto {
  readonly pid?: number;
  /** Cuándo arrancó, con el reloj de allá: separa la cosecha de esta corrida de la de ayer. */
  readonly inicio?: string;
  /** El boot_id de Linux al arrancar: si cambió, el pid que se ve es de otro proceso. */
  readonly arranque?: string;
  readonly codigo?: number;
  readonly fin?: string;
}

export type Consulta =
  | { readonly que: "corriendo"; readonly estado: EstadoRemoto }
  | { readonly que: "termino"; readonly estado: EstadoRemoto; readonly codigo: number }
  | { readonly que: "se-corto"; readonly estado: EstadoRemoto };

/** Un id que puede ir en un nombre de archivo de allá sin comillas que se rompan. */
export const idValido = (id: string) => /^[\w-]{1,64}$/.test(id);

/** Comillas simples de POSIX (la misma regla que citarShell de ssh.ts, sin importarla en círculo). */
const q = (texto: string) => `'${texto.replace(/'/g, `'\\''`)}'`;

export function rutasRemotas(host: Pick<Host, "repo">, id: string): { carpeta: string; log: string; estado: string } {
  const carpeta = `${host.repo.replace(/\/+$/, "")}/.dolphin/turnos`;
  return { carpeta, log: `${carpeta}/${id}.log`, estado: `${carpeta}/${id}.json` };
}

const AHORA_UTC = "$(date -u +%Y-%m-%dT%H:%M:%SZ)";
const BOOT_ID = "$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)";

/**
 * El comando que lanza el turno desprendido y devuelve su estado inicial (con el pid). El proceso
 * queda en su propia sesión (`setsid`), sin terminal, con la salida al log: cerrar el ssh no lo toca.
 * Allá mismo lo corta un `timeout` con el tope, así no queda colgado aunque nadie lo esté mirando.
 */
export function comandoDesprendido(comando: string, host: Pick<Host, "repo">, id: string, topeSegundos: number): string {
  const r = rutasRemotas(host, id);
  const j = q(r.estado);
  const tmp = q(`${r.estado}.tmp`);
  const adentro = [
    `i=${AHORA_UTC}; b=${BOOT_ID}`,
    `printf '{"pid":%s,"inicio":"%s","arranque":"%s"}\\n' $$ "$i" "$b" > ${tmp} && mv ${tmp} ${j}`,
    `t=; command -v timeout >/dev/null 2>&1 && t="timeout -k 60 ${Math.max(1, Math.round(topeSegundos))}"`,
    `$t sh -c ${q(comando)}; c=$?`,
    `printf '{"pid":%s,"inicio":"%s","arranque":"%s","codigo":%s,"fin":"%s"}\\n' $$ "$i" "$b" "$c" "${AHORA_UTC}" > ${tmp} && mv ${tmp} ${j}`,
  ].join("; ");
  return [
    `mkdir -p ${q(r.carpeta)} && rm -f ${j} ${q(r.log)}`,
    `s=; command -v setsid >/dev/null 2>&1 && s=setsid`,
    // Entre paréntesis: el que queda corriendo no es hijo del shell del ssh, que se cierra enseguida.
    `($s nohup sh -c ${q(adentro)} > ${q(r.log)} 2>&1 < /dev/null &)`,
    // Se espera a que escriba su estado (hasta 5 s): así vuelve el pid y se sabe que arrancó.
    `n=0; while [ ! -s ${j} ] && [ $n -lt 50 ]; do sleep 0.1; n=$((n+1)); done`,
    `cat ${j}`,
  ].join("; ");
}

/** Una consulta corta: el estado, el boot_id de ahora y si el pid sigue vivo. */
export function comandoDeConsulta(host: Pick<Host, "repo">, id: string): string {
  const j = q(rutasRemotas(host, id).estado);
  return [
    `cat ${j} 2>/dev/null; echo`,
    `echo "arranque=${BOOT_ID}"`,
    `p=$(sed -n 's/.*"pid":\\([0-9]*\\).*/\\1/p' ${j} 2>/dev/null)`,
    `if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo vivo; else echo muerto; fi`,
  ].join("; ");
}

/**
 * Corta el turno de allá entero: su sesión (el `timeout` arma su propio grupo adentro). Antes de
 * matar se asegura de que ese pid siga siendo el turno: la máquina no se reinició (boot_id), el turno
 * no dejó su código y el proceso es el que escribe ESTE estado. Si no, no toca nada: un pid reusado es
 * de otro. Y nunca mata un pid suelto, solo la sesión o el grupo que encabeza el turno.
 */
export function comandoDeCorte(host: Pick<Host, "repo">, id: string, pid: number, arranque?: string): string {
  const j = q(rutasRemotas(host, id).estado);
  return [
    `p=${Math.trunc(pid)}`,
    ...(arranque ? [`[ "${BOOT_ID}" = ${q(arranque)} ] || exit 0`] : []),
    `grep -q '"codigo"' ${j} 2>/dev/null && exit 0`,
    // Si el pid está vivo tiene que ser el nuestro; si no está, su sesión no se le pudo dar a otro.
    `[ -r /proc/$p/cmdline ] && ! tr '\\0' ' ' < /proc/$p/cmdline | grep -qF -- ${q(`${id}.json`)} && exit 0`,
    `pkill -TERM -s "$p" 2>/dev/null || kill -TERM -- "-$p" 2>/dev/null; true`,
  ].join("; ");
}

/** Las últimas líneas del log: el porqué de un turno que se cortó o salió mal. */
export function comandoDeCola(host: Pick<Host, "repo">, id: string, lineas = 20): string {
  return `tail -n ${Math.trunc(lineas)} ${q(rutasRemotas(host, id).log)} 2>/dev/null; true`;
}

/** El log en vivo, hasta que el turno termine (`--pid`); si ya terminó, lo que dejó y listo. */
export function comandoDeAdjuntar(host: Pick<Host, "repo">, id: string): string {
  const r = rutasRemotas(host, id);
  return [
    `if [ ! -f ${q(r.log)} ]; then echo ${q(`no hay un turno ${id} en ${host.repo}`)} >&2; exit 3; fi`,
    `p=$(sed -n 's/.*"pid":\\([0-9]*\\).*/\\1/p' ${q(r.estado)} 2>/dev/null)`,
    `c=$(sed -n 's/.*"codigo":\\([0-9]*\\).*/\\1/p' ${q(r.estado)} 2>/dev/null)`,
    `if [ -z "$c" ] && [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then tail -n 200 --pid="$p" -F ${q(r.log)}; else tail -n 200 ${q(r.log)}; fi`,
  ].join("; ");
}

export function leerEstadoRemoto(texto: string): EstadoRemoto | null {
  const linea = texto.split("\n").map((l) => l.trim()).find((l) => l.startsWith("{"));
  if (!linea) return null;
  try {
    const datos = JSON.parse(linea) as Record<string, unknown>;
    const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const texto = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
    const pid = numero(datos.pid);
    const inicio = texto(datos.inicio);
    const arranque = texto(datos.arranque);
    const codigo = numero(datos.codigo);
    const fin = texto(datos.fin);
    return { ...(pid !== undefined ? { pid } : {}), ...(inicio ? { inicio } : {}), ...(arranque ? { arranque } : {}), ...(codigo !== undefined ? { codigo } : {}), ...(fin ? { fin } : {}) };
  } catch {
    return null;
  }
}

/** Lo que contestó una consulta. Un pid «vivo» de otro arranque de la máquina no es el nuestro. */
export function leerConsulta(salida: string): Consulta {
  const estado = leerEstadoRemoto(salida) ?? {};
  if (estado.codigo !== undefined) return { que: "termino", estado, codigo: estado.codigo };
  const lineas = salida.split("\n").map((l) => l.trim());
  const vivo = lineas.includes("vivo");
  const arranqueAhora = lineas.find((l) => l.startsWith("arranque="))?.slice("arranque=".length) ?? "";
  const mismoArranque = !estado.arranque || !arranqueAhora || estado.arranque === arranqueAhora;
  return vivo && mismoArranque ? { que: "corriendo", estado } : { que: "se-corto", estado };
}

export type FinDelSeguimiento = Exclude<Consulta, { readonly que: "corriendo" }> |{ readonly que: "tope"; readonly sinRespuesta: boolean } | { readonly que: "cancelado" };

export interface DepsDelSeguimiento {
  /** Una consulta corta por ssh: devuelve lo que contestó, o rechaza si no hubo conexión. */
  readonly consultar: () => Promise<string>;
  readonly esperar?: (ms: number, senal?: AbortSignal) => Promise<void>;
  readonly ahora?: () => number;
  /** Cada cuánto se pregunta con la red bien. */
  readonly cada?: number;
  /** Lo más que se espera, contando desde que arrancó. */
  readonly tope: number;
  readonly desde: number;
  readonly senal?: AbortSignal;
  /** Cada consulta que no llegó: para contarlo, no para cortar. */
  readonly alFallar?: (error: unknown, proximaEn: number) => void;
}

/** Con la red caída se espera cada vez el doble, hasta dos minutos: no se martilla un VPS que no contesta. */
export const ESPERA_MAXIMA = 2 * 60_000;

const dormir = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((listo) => {
    if (senal?.aborted) return listo();
    const reloj = setTimeout(listo, ms);
    senal?.addEventListener("abort", () => (clearTimeout(reloj), listo()), { once: true });
  });

/** Sigue al turno de allá hasta que termine, se corte, pase el tope o lo cancelen. */
export async function seguirTurno(deps: DepsDelSeguimiento): Promise<FinDelSeguimiento> {
  const cada = deps.cada ?? 15_000;
  const ahora = deps.ahora ?? Date.now;
  const esperar = deps.esperar ?? dormir;
  let espera = cada;
  for (;;) {
    if (deps.senal?.aborted) return { que: "cancelado" };
    let contesto = false;
    try {
      const consulta = leerConsulta(await deps.consultar());
      contesto = true;
      espera = cada;
      // Terminado o cortado se cree aunque haya pasado el tope: una PC que durmió 8 h vuelve y ve el final.
      if (consulta.que !== "corriendo") return consulta;
    } catch (error) {
      if (deps.senal?.aborted) return { que: "cancelado" };
      espera = Math.min(espera * 2, ESPERA_MAXIMA);
      deps.alFallar?.(error, espera);
    }
    if (ahora() - deps.desde > deps.tope) return { que: "tope", sinRespuesta: !contesto };
    await esperar(espera, deps.senal);
  }
}
