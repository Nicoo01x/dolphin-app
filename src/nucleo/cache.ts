import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { medirForma } from "./forma.js";
import type { Agente, Trabajo } from "./tipos.js";
import { carpetaDeDolphin } from "./escritura.js";
import { diffDe } from "./cambios.js";
import { git, gitValor } from "./git.js";
import { decirVoz } from "./voces.js";

/**
 * La memoria de respuestas: lo que el modelo ya contestó una vez no se
 * vuelve a pagar.
 *
 * La clave es (modelo + tarea + enfoque + HEAD del repo): la MISMA tarea
 * sobre el MISMO estado del código tiene la misma respuesta, así que el
 * parche que el agente produjo la primera vez se guarda y, a la próxima,
 * se aplica directo — cero tokens, cero espera. Si el parche ya no aplica
 * (el repo cambió de maneras que la clave no vio), se cae al agente de
 * verdad sin ruido.
 */

export interface RespuestaGuardada {
  readonly clave: string;
  readonly modelo?: string;
  readonly resumen?: string;
  /** Lo que el agente declaró que tocó: sin esto, el portón mira otra pantalla que la que cambió. */
  readonly superficies?: readonly string[];
  /** El diff completo que produjo el agente: es lo que se re-aplica. */
  readonly parche: string;
  /** Lo que costó la primera vez: es lo que cada reuso ahorra. */
  readonly gastadoOriginal: number;
  /** El motor no informó cuánto costó: el ahorro de cada reuso no se sabe (no es cero). */
  readonly costoDesconocido?: boolean;
  readonly creado: string;
  /**
   * Todavía no cruzó el portón: hasta que su rama pase, no se reusa. Antes se
   * guardaba apenas escribía, y una siembra que moría entera volvía a costo
   * cero con los mismos parches que ya habían fallado.
   */
  readonly pendiente?: boolean;
}

/** Lo que se guardó en esta corrida y espera el portón: por worktree, su clave. */
const pendientes = new Map<string, { repo: string; clave: string }>();

/**
 * Las ramas que pasaron: su respuesta queda para reusar. Las demás, no
 * (quedan pendientes y la poda se las lleva).
 */
export async function aprobarRespuestas(rutas: readonly string[]): Promise<void> {
  for (const ruta of rutas) {
    const anotada = pendientes.get(ruta);
    if (!anotada) continue;
    pendientes.delete(ruta);
    const guardada = await buscarRespuesta(anotada.repo, anotada.clave, { aunPendiente: true });
    if (!guardada) continue;
    const { pendiente: _ya, ...aprobada } = guardada;
    await guardarRespuesta(anotada.repo, aprobada).catch(() => {});
  }
}

const TOPE_DE_ENTRADAS = 50;

const carpetaCache = (repo: string) => join(repo, ".dolphin", "cache");

/**
 * La clave: modelo, pedido y código. `extra` es el motor y lo que el agente
 * recibe además de la tarea (la memoria, el perfil): sin eso, lo aprendido
 * después de una siembra que falló no llegaba nunca al agente —volvía el
 * mismo parche—, y Codex y Antigravity sin modelo compartían clave.
 */
export function claveDeTrabajo(modelo: string | undefined, prompt: string, headSha: string, extra = ""): string {
  return createHash("sha256").update(`${modelo ?? ""}\n${prompt}\n${headSha}\n${extra}`).digest("hex").slice(0, 24);
}

export async function buscarRespuesta(repo: string, clave: string, { aunPendiente = false } = {}): Promise<RespuestaGuardada | null> {
  try {
    const crudo = await readFile(join(carpetaCache(repo), `${clave}.json`), "utf8");
    const guardada = JSON.parse(crudo) as RespuestaGuardada;
    return guardada.pendiente && !aunPendiente ? null : guardada;
  } catch {
    return null;
  }
}

export async function guardarRespuesta(repo: string, respuesta: RespuestaGuardada): Promise<void> {
  const carpeta = await carpetaDeDolphin(repo, "cache");
  await writeFile(join(carpeta, `${respuesta.clave}.json`), `${JSON.stringify(respuesta, null, 2)}\n`);

  // La poda: las más viejas se van cuando la memoria pasa el tope.
  const nombres = (await readdir(carpeta)).filter((n) => n.endsWith(".json"));
  if (nombres.length <= TOPE_DE_ENTRADAS) return;
  const conFecha = await Promise.all(
    nombres.map(async (n) => ({ n, mtime: (await stat(join(carpeta, n))).mtimeMs })),
  );
  conFecha.sort((a, b) => a.mtime - b.mtime);
  for (const { n } of conFecha.slice(0, conFecha.length - TOPE_DE_ENTRADAS)) {
    await rm(join(carpeta, n), { force: true });
  }
}

/**
 * Un agente envuelto en la memoria de respuestas. El de adentro puede ser
 * cualquiera: la memoria vive afuera del modelo, como corresponde.
 * `modelo` es con el que escribe cuando el enfoque no pide otro: va en la
 * clave, para que lo que contestó Sonnet no vuelva como si fuera de Haiku.
 */
export function agenteConMemoria(agente: Agente, repo: string, modelo?: string, contexto = ""): Agente {
  const envuelto: Agente = {
    nombre: agente.nombre,

    async trabajar(universo, tarea, enfoque, senal) {
      const head = await headDe(universo.ruta);
      const prompt = `${tarea}\n${enfoque?.instruccion ?? ""}`;
      const clave = claveDeTrabajo(enfoque?.modelo ?? modelo, prompt, head ?? "", `${agente.nombre}\n${contexto}`);

      if (head) {
        const guardada = await buscarRespuesta(repo, clave);
        if (guardada && (await aplicarParche(universo.ruta, guardada.parche))) {
          // En su terminal se ve por qué no habló: no corrió, se reusó lo que ya se había hecho igual.
          decirVoz(universo.ruta, "texto", "Esto ya se había hecho igual sobre este mismo código: reuso esa respuesta de la caché (no corrió el agente, no gastó nada).");
          const forma = await medirForma(universo.ruta);
          return {
            forma,
            gastado: 0,
            deCache: true,
            ...(guardada.costoDesconocido ? {} : { ahorro: guardada.gastadoOriginal }),
            ...(guardada.modelo ? { modelo: guardada.modelo } : {}),
            // La nota no vuelve: una respuesta repetida no es otra observación del repo (ver notas.ts).
            ...(guardada.resumen || guardada.superficies?.length
              ? {
                  contrato: {
                    superficies: guardada.superficies ?? [],
                    ...(guardada.resumen ? { resumen: guardada.resumen } : {}),
                  },
                }
              : {}),
          } satisfies Trabajo;
        }
      }

      const trabajo = await agente.trabajar(universo, tarea, enfoque, senal);

      // Lo recién pagado queda guardado para la próxima vez.
      if (head) {
        const parche = await parcheDe(universo.ruta);
        if (parche.trim() !== "") {
          // Pendiente hasta que la rama cruce el portón (ver aprobarRespuestas).
          await guardarRespuesta(repo, {
            clave,
            parche,
            gastadoOriginal: trabajo.gastado,
            ...(trabajo.costoDesconocido ? { costoDesconocido: true } : {}),
            creado: new Date().toISOString(),
            ...(trabajo.modelo ? { modelo: trabajo.modelo } : {}),
            ...(trabajo.contrato?.resumen ? { resumen: trabajo.contrato.resumen } : {}),
            ...(trabajo.contrato?.superficies.length ? { superficies: trabajo.contrato.superficies } : {}),
            pendiente: true,
          }).then(
            () => void pendientes.set(universo.ruta, { repo, clave }),
            () => {},
          );
        }
      }

      return trabajo;
    },
  };

  // La corrección no se cachea: depende del estado intermedio del worktree,
  // que por definición es distinto cada vez.
  const corregir = agente.corregir?.bind(agente);
  if (corregir) envuelto.corregir = corregir;
  const retomar = agente.retomar?.bind(agente);
  if (retomar) envuelto.retomar = retomar;

  return envuelto;
}

async function headDe(ruta: string): Promise<string | null> {
  try {
    return await gitValor(["rev-parse", "HEAD"], ruta);
  } catch {
    return null;
  }
}

/** El parche de lo que hizo: el mismo diff de todos (ver cambios.ts), sin lo que Dolphin le copió al worktree. */
async function parcheDe(ruta: string): Promise<string> {
  return diffDe(ruta).catch(() => "");
}

async function aplicarParche(ruta: string, parche: string): Promise<boolean> {
  // Con algo al azar: dos universos aplicando en el mismo milisegundo pisaban el mismo archivo.
  const archivo = join(tmpdir(), `dolphin-parche-${createHash("sha1").update(`${ruta}${Date.now()}${Math.random()}`).digest("hex").slice(0, 12)}.diff`);
  try {
    await writeFile(archivo, parche);
    await git(["apply", "--whitespace=nowarn", archivo], ruta);
    return true;
  } catch {
    return false;
  } finally {
    await rm(archivo, { force: true }).catch(() => {});
  }
}
