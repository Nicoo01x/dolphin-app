import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { link, mkdir, open, readdir, readFile, rename, stat, unlink, utimes } from "node:fs/promises";
import { cpus, tmpdir, totalmem, userInfo } from "node:os";
import { join } from "node:path";

/**
 * La cola única de verificación: como mucho K comandos pesados (tsc, la suite de tests, el build)
 * corriendo a la vez en TODA la máquina.
 *
 * Por qué existe: el portón corre cada fase sobre todos los candidatos a la vez. Con tres universos
 * son tres `tsc` juntos —cada uno puede comerse varios GB— y tres suites de test, y la máquina se
 * quedaba sin memoria. Un semáforo dentro de un proceso no alcanza: las siembras que lanza la consola
 * son procesos aparte (igual que la cola y el equipo), y cada uno tendría el suyo, así que sumarían
 * K por proceso. El turno tiene que vivir afuera de cualquier proceso: en archivos.
 *
 * Cómo anda, sin dependencias y sin nada que sea de POSIX (ni `flock` ni señales para coordinar):
 *  - Un directorio compartido bajo `os.tmpdir()` (uno por usuario: el tmp de POSIX es de todos).
 *  - Para esperar, cada trabajo deja un *ticket* `fila-<hora>-<seq>-<pid>.fila`. El orden alfabético
 *    de los tickets es el orden de llegada, y solo se anima a tomar un lugar quien tiene delante
 *    menos tickets que lugares libres. Sin esto, con un sondeo a ciegas ganaría el que justo
 *    despertó, no el que llegó primero.
 *  - Tomar un lugar es crear con exclusividad (`wx`) uno de `lugar-0.lock … lugar-(K-1).lock` con el
 *    pid y la hora adentro. Soltarlo es borrarlo. `wx` es atómico en NTFS y en POSIX.
 *
 * Los huérfanos se recuperan —eso ya pasó acá con puertos y procesos colgados—: un lugar o un ticket
 * cuyo pid ya no existe (`process.kill(pid, 0)` tira `ESRCH`) se roba. Y como el pid se puede
 * reciclar, además cada dueño vivo "late" (actualiza la hora del archivo cada pocos segundos); uno
 * que no late hace más de `topeViejoMs` está muerto aunque el pid lo tenga otro.
 */

/** Cada cuánto late un dueño vivo. Mucho menor que el tope de edad, para no perder un lugar por un tropiezo. */
const LATIDO_MS = 15_000;
/** Un archivo sin latido por este tiempo es de alguien que ya no está, aunque su pid exista. */
export const TOPE_VIEJO_POR_DEFECTO = 5 * 60_000;
/** Espera entre intentos: corta, con jitter para que dos procesos no despierten siempre a la vez. */
const SONDEO_POR_DEFECTO = 250;
const GB = 1024 ** 3;

export interface OpcionesDeTurno {
  /** Cuántos a la vez. Sin esto: `lugaresDeVerificacion()`. */
  readonly lugares?: number;
  /** Dónde viven los turnos. Los tests usan una carpeta propia para no chocar con nada real. */
  readonly dir?: string;
  /** Milisegundos entre intentos mientras espera (más hasta un 60 % de jitter). */
  readonly sondeoMs?: number;
  /** Cuánto sin latir hace huérfano a un archivo. */
  readonly topeViejoMs?: number;
  /** Cancela la espera (no el trabajo, que una vez con turno es de quien lo pidió). */
  readonly senal?: AbortSignal;
  /** Se llama una vez, apenas hay que esperar, para poder decir «en cola» mientras tanto. */
  readonly alEsperar?: () => void;
}

/** Lo que `hacer` recibe: cuánto esperó para tener su turno. */
export interface Turno {
  readonly esperoMs: number;
}

/**
 * Cuántos comandos pesados a la vez, para esta máquina. Conservador a propósito: un `tsc` de un
 * monorepo grande pasa los 4 GB, así que se cuenta uno cada 8 GB de memoria, y nunca más de la mitad
 * de los núcleos (verificar no tiene que dejar la máquina sin aire para lo demás). Siempre al menos 1.
 *
 * `entorno` gana sobre `config`; ambos se ignoran si no son un entero positivo.
 */
export function lugaresDeVerificacion(
  {
    entorno = process.env,
    config,
    memoriaBytes = totalmem(),
    nucleos = cpus().length,
  }: { readonly entorno?: NodeJS.ProcessEnv; readonly config?: unknown; readonly memoriaBytes?: number; readonly nucleos?: number } = {},
): number {
  const aEntero = (v: unknown): number | undefined => {
    const n = typeof v === "string" ? Number(v.trim()) : v;
    return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : undefined;
  };
  const pedido = aEntero(entorno["DOLPHIN_VERIFICACIONES_A_LA_VEZ"]) ?? aEntero(config);
  if (pedido) return pedido;
  const porMemoria = Math.floor(memoriaBytes / GB / 8);
  const porNucleos = Math.max(1, Math.floor(nucleos / 2));
  return Math.max(1, Math.min(porMemoria, porNucleos));
}

/** El directorio compartido. Por usuario: en POSIX el tmp es de todos y un ajeno no puede escribir en el tuyo. */
export function directorioDeLaCola(): string {
  let usuario = "";
  try {
    usuario = userInfo().username.replace(/[^\w.-]/g, "_");
  } catch {
    /* sin usuario resoluble (contenedores raros): el directorio común */
  }
  return join(tmpdir(), usuario ? `dolphin-verificacion-${usuario}` : "dolphin-verificacion");
}

// ---- lo que este proceso tiene tomado (para soltarlo si el proceso se va) ----

interface Tomado {
  readonly ruta: string;
  readonly token: string;
}
const tomados = new Set<Tomado>();
let latido: NodeJS.Timeout | undefined;
let enganchado = false;
let ultimaHora = 0;
let secuencia = 0;

const contenido = (token: string, nombre: string, desde: number) => JSON.stringify({ pid: process.pid, desde, token, nombre });

function soltarTodoSincrono(): void {
  for (const t of [...tomados]) {
    try {
      if ((JSON.parse(readFileSync(t.ruta, "utf8")) as { token?: string }).token === t.token) unlinkSync(t.ruta);
    } catch {
      /* ya no está, o es de otro: nada que soltar */
    }
    tomados.delete(t);
  }
}

/** Al salir —`exit`, Ctrl+C, SIGTERM— el proceso suelta lo suyo. Se engancha una sola vez, la primera que hace falta. */
function engancharSalida(): void {
  if (enganchado) return;
  enganchado = true;
  process.on("exit", soltarTodoSincrono);
  for (const [senal, codigo] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    process.on(senal, () => {
      soltarTodoSincrono();
      // Escuchar la señal le saca al proceso su comportamiento de siempre (irse). Si somos los únicos
      // escuchando, lo devolvemos; si alguien más la maneja, que decida él.
      if (process.listenerCount(senal) === 1) process.exit(codigo);
    });
  }
}

function prenderLatido(): void {
  if (latido) return;
  latido = setInterval(() => {
    const ahora = new Date();
    for (const t of tomados) void utimes(t.ruta, ahora, ahora).catch(() => undefined);
  }, LATIDO_MS);
  latido.unref();
}

function apagarLatidoSiNadaTomado(): void {
  if (tomados.size === 0 && latido) {
    clearInterval(latido);
    latido = undefined;
  }
}

// ---- huérfanos ----

function pidVivo(pid: unknown): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return true; // no se entiende: no se roba por eso
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe pero es de otro usuario. Solo ESRCH dice que no hay nadie.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** ¿Es de alguien que ya no está? Un archivo a medio escribir (vacío o ilegible) se da por vivo hasta que envejece. */
async function esHuerfano(ruta: string, topeViejoMs: number): Promise<{ huerfano: boolean; visto: string; mtimeMs: number }> {
  let visto = "";
  try {
    const [info, texto] = await Promise.all([stat(ruta), readFile(ruta, "utf8").catch(() => "")]);
    visto = texto;
    if (Date.now() - info.mtimeMs > topeViejoMs) return { huerfano: true, visto, mtimeMs: info.mtimeMs };
    try {
      return { huerfano: !pidVivo((JSON.parse(texto) as { pid?: unknown }).pid), visto, mtimeMs: info.mtimeMs };
    } catch {
      return { huerfano: false, visto, mtimeMs: info.mtimeMs };
    }
  } catch {
    return { huerfano: false, visto, mtimeMs: 0 }; // ya no existe: no hay nada que robar
  }
}

/**
 * Saca del medio un archivo huérfano. Lo renombra antes de borrarlo: si dos procesos lo descubren a
 * la vez, solo uno gana el rename, y el otro no puede borrarle el lugar nuevo a quien lo tomó justo
 * después. Si lo que se llevó ya no es lo que se había visto, lo devuelve (`link` falla si ya hay otro).
 *
 * «Lo que se había visto» es el contenido Y la hora de modificación. Un dueño vivo que se atrasó
 * (un proceso suspendido, un disco lento) puede latir justo entre que lo leímos como viejo y el rename:
 * el latido es solo un `utimes`, el contenido no cambia, así que comparar nada más el texto lo daba por
 * el mismo huérfano y le robaba el lugar a alguien que acababa de demostrar que estaba vivo.
 * `rename` conserva la hora, así que se puede mirar ya del otro lado.
 */
async function robar(ruta: string, visto: string, mtimeVisto: number): Promise<void> {
  const aparte = `${ruta}.huerfano-${process.pid}-${randomBytes(3).toString("hex")}`;
  try {
    await rename(ruta, aparte);
  } catch {
    return; // otro ya se lo llevó
  }
  const [llevado, info] = await Promise.all([readFile(aparte, "utf8").catch(() => ""), stat(aparte).catch(() => null)]);
  if (llevado !== visto || info?.mtimeMs !== mtimeVisto) await link(aparte, ruta).catch(() => undefined);
  await unlink(aparte).catch(() => undefined);
}

/**
 * Mira un archivo ajeno y, si es de alguien que ya no está, lo saca. `true` si lo sacó.
 * `entreLecturaYRename` existe SOLO para que los tests puedan meter un latido o un cambio justo en la
 * ventana entre mirar y robar, que sin un gancho no se puede reproducir de forma determinista.
 * No es parte de la API de la cola: nadie más que los tests lo pasa.
 */
export async function sacarSiEsHuerfano(ruta: string, topeViejoMs: number, entreLecturaYRename?: () => Promise<void>): Promise<boolean> {
  const { huerfano, visto, mtimeMs } = await esHuerfano(ruta, topeViejoMs);
  if (!huerfano) return false;
  await entreLecturaYRename?.();
  await robar(ruta, visto, mtimeMs);
  // ¿Se llevó el archivo? Si lo devolvió (porque cambió en el medio), sigue estando y es de un vivo.
  return !(await stat(ruta).then(() => true, () => false));
}

// ---- mirar la cola sin tocarla ----

/** Un lugar con dueño: quién lo tiene, para qué, y desde cuándo. */
export interface LugarOcupado {
  /** El archivo, `lugar-N.lock`. */
  readonly lugar: string;
  /** Quién lo tiene. Ausente en un archivo que todavía se está escribiendo o que no se entiende. */
  readonly pid?: number;
  /** El trabajo (`conTurnoDeVerificacion(nombre, …)`). Ausente en los archivos escritos antes de que se guardara. */
  readonly nombre?: string;
  /** Hace cuánto lo tiene, en milisegundos. Ausente si el archivo no dice desde cuándo. */
  readonly haceMs?: number;
}

export interface EstadoDeLaCola {
  /** Cuántos comandos caben a la vez. */
  readonly lugares: number;
  readonly ocupados: readonly LugarOcupado[];
  /** Cuántos esperan turno (tickets de gente viva que todavía no tiene lugar). */
  readonly esperando: number;
}

/**
 * Cómo está la cola ahora: cuántos lugares hay, quién tiene cada uno y cuántos esperan. Es una
 * LECTURA: no toma nada ni borra nada —ni siquiera los huérfanos, que solo no se cuentan—, y un
 * directorio que no existe es una cola vacía (lo normal si nadie verificó todavía), no un error.
 * Mira los mismos archivos y con el mismo criterio de «vivo» que `conTurnoDeVerificacion`.
 */
export async function estadoDeLaCola(
  opciones: Pick<OpcionesDeTurno, "dir" | "lugares" | "topeViejoMs"> & { readonly ahora?: number } = {},
): Promise<EstadoDeLaCola> {
  const dir = opciones.dir ?? directorioDeLaCola();
  const lugares = Math.max(1, Math.floor(opciones.lugares ?? lugaresDeVerificacion()));
  const topeViejo = opciones.topeViejoMs ?? TOPE_VIEJO_POR_DEFECTO;
  const ahora = opciones.ahora ?? Date.now();

  const archivos = await readdir(dir).catch(() => [] as string[]);
  const leer = async (archivo: string) => {
    const { huerfano, visto } = await esHuerfano(join(dir, archivo), topeViejo);
    if (huerfano) return null;
    try {
      return (JSON.parse(visto) as Record<string, unknown>) ?? {};
    } catch {
      return {}; // a medio escribir o ilegible: vivo hasta que envejezca, pero sin datos
    }
  };

  const ocupados: LugarOcupado[] = [];
  const fichas = new Set<string>(); // los tokens que ya tienen lugar
  for (const archivo of archivos.filter(esLugar).sort()) {
    const dato = await leer(archivo);
    if (!dato) continue;
    if (typeof dato["token"] === "string") fichas.add(dato["token"]);
    ocupados.push({
      lugar: archivo,
      ...(typeof dato["pid"] === "number" ? { pid: dato["pid"] } : {}),
      ...(typeof dato["nombre"] === "string" && dato["nombre"] !== "" ? { nombre: dato["nombre"] } : {}),
      ...(typeof dato["desde"] === "number" ? { haceMs: Math.max(0, ahora - dato["desde"]) } : {}),
    });
  }

  let esperando = 0;
  for (const archivo of archivos.filter(esTicket)) {
    const dato = await leer(archivo);
    if (!dato) continue;
    // Quien acaba de tomar su lugar tiene un instante los dos archivos: no es alguien esperando.
    if (typeof dato["token"] === "string" && fichas.has(dato["token"])) continue;
    esperando += 1;
  }
  return { lugares, ocupados, esperando };
}

/** Una línea para decirlo, o `null` si no hay nada que decir (nadie verificando ni esperando). */
export function lineaDeLaCola(estado: EstadoDeLaCola): string | null {
  if (estado.ocupados.length === 0 && estado.esperando === 0) return null;
  const tomados = `${estado.ocupados.length} de ${estado.lugares} ${estado.lugares === 1 ? "lugar tomado" : "lugares tomados"}`;
  return `Verificación: ${tomados}, ${estado.esperando} esperando`;
}

// ---- el turno ----

const dormir = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((resolver, rechazar) => {
    if (senal?.aborted) return rechazar(senal.reason ?? new Error("cancelado"));
    const reloj = setTimeout(() => {
      senal?.removeEventListener("abort", alAbortar);
      resolver();
    }, ms);
    const alAbortar = () => {
      clearTimeout(reloj);
      rechazar(senal?.reason ?? new Error("cancelado"));
    };
    senal?.addEventListener("abort", alAbortar, { once: true });
  });

const esLugar = (n: string) => /^lugar-\d+\.lock$/.test(n);
const esTicket = (n: string) => n.startsWith("fila-") && n.endsWith(".fila");

/** Crea un archivo con exclusividad. `false` si ya existía. */
async function crearExclusivo(ruta: string, texto: string): Promise<boolean> {
  try {
    const f = await open(ruta, "wx", 0o600);
    try {
      await f.writeFile(texto);
    } finally {
      await f.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function soltar(t: Tomado): Promise<void> {
  tomados.delete(t);
  apagarLatidoSiNadaTomado();
  try {
    if ((JSON.parse(await readFile(t.ruta, "utf8")) as { token?: string }).token === t.token) await unlink(t.ruta);
  } catch {
    /* ya no está (lo robaron por viejo, o lo soltó la salida): nada que hacer */
  }
}

/**
 * Corre `hacer` cuando le toque el turno y suelta el lugar SIEMPRE al terminar, también si explota.
 * Los turnos se dan en orden de llegada. `nombre` queda escrito en el archivo del lugar: es lo que
 * deja ver quién tiene la máquina cuando alguien pregunta por qué se está esperando.
 */
export async function conTurnoDeVerificacion<T>(
  nombre: string,
  hacer: (turno: Turno) => Promise<T>,
  opciones: OpcionesDeTurno = {},
): Promise<T> {
  const dir = opciones.dir ?? directorioDeLaCola();
  const lugares = Math.max(1, Math.floor(opciones.lugares ?? lugaresDeVerificacion()));
  const sondeo = opciones.sondeoMs ?? SONDEO_POR_DEFECTO;
  const topeViejo = opciones.topeViejoMs ?? TOPE_VIEJO_POR_DEFECTO;

  engancharSalida();

  // Hora monótona dentro del proceso: un reloj que retrocede no puede ponerme detrás de quien llegó después.
  ultimaHora = Math.max(Date.now(), ultimaHora);
  const llegada = ultimaHora;
  const seq = ++secuencia;
  const token = `${process.pid}-${seq}-${randomBytes(3).toString("hex")}`;
  const nombreTicket = `fila-${String(llegada).padStart(15, "0")}-${String(seq).padStart(6, "0")}-${process.pid}.fila`;
  const ticket: Tomado = { ruta: join(dir, nombreTicket), token };

  // La llegada se fijó arriba, antes de cualquier `await`: el orden de los tickets es el de las llamadas.
  tomados.add(ticket);
  prenderLatido();

  let lugar: Tomado | undefined;
  let avisado = false;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await crearExclusivo(ticket.ruta, contenido(token, nombre, llegada));
    for (;;) {
      if (opciones.senal?.aborted) throw opciones.senal.reason ?? new Error("cancelado");

      const archivos = await readdir(dir);
      // Primero se sacan los huérfanos, de los dos tipos: un ticket muerto delante de mí me haría esperar
      // a alguien que no va a venir nunca.
      const vivos: string[] = [];
      for (const archivo of archivos.filter((a) => esLugar(a) || esTicket(a))) {
        if (archivo === nombreTicket) {
          vivos.push(archivo);
          continue;
        }
        if (!(await sacarSiEsHuerfano(join(dir, archivo), topeViejo))) vivos.push(archivo);
      }

      const tomadosAhora = vivos.filter(esLugar);
      const fila = vivos.filter(esTicket).sort();
      const libres = lugares - tomadosAhora.length;
      const posicion = fila.indexOf(nombreTicket);

      if (posicion !== -1 && posicion < libres) {
        for (let i = 0; i < lugares; i++) {
          const rutaLugar = join(dir, `lugar-${i}.lock`);
          if (tomadosAhora.includes(`lugar-${i}.lock`)) continue;
          const mio: Tomado = { ruta: rutaLugar, token };
          if (await crearExclusivo(rutaLugar, contenido(token, nombre, Date.now()))) {
            // Registrado en el acto: una salida abrupta justo acá tiene que poder soltarlo.
            tomados.add(mio);
            lugar = mio;
            break;
          }
        }
        if (lugar) break;
      }

      if (!avisado) {
        avisado = true;
        opciones.alEsperar?.();
      }
      await dormir(sondeo + Math.random() * sondeo * 0.6, opciones.senal);
    }
  } catch (error) {
    await soltar(ticket);
    throw error;
  }

  // El lugar reemplaza al ticket.
  await soltar(ticket);
  try {
    return await hacer({ esperoMs: Date.now() - llegada });
  } finally {
    await soltar(lugar);
  }
}
