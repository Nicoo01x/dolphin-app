import { mkdtemp, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { git, TOPE_DEL_CHECKOUT } from "./git.js";
import { procesoVivo } from "../agentes/ejecutar.js";
import { enFila as enFilaDeArchivos } from "./escritura.js";
import { baseDelRepo, entornoDelUniverso, puertoParaUniverso, soltarPuerto } from "./puertos.js";
import { guardarPunto, volverAlPunto } from "./puntos.js";
import { guardarTurno, olvidarTurnos } from "./turnos.js";
import { medirForma } from "./forma.js";
import { prepararWorktree, quitarWorktree, soltarEnlaces, type ConfigDeEntorno } from "./entorno.js";
import type { Forma, Taller, Universo } from "./tipos.js";


/**
 * Lo que toca la carpeta `.git` de un repo —crear y borrar worktrees y
 * ramas— va de a uno por repo. En paralelo se pisan: el `worktree prune`
 * de un universo le borra a otro el `worktree add` a medio hacer, y dos
 * `worktree add` se pelean por `.git/worktrees` («failed to read
 * .git/worktrees/u7/commondir»). Medido: 16 universos a la vez rompían 3
 * corridas de cada 5. Lo que tarda —el agente escribiendo— sigue en
 * paralelo: esto es solo abrir y cerrar, que son segundos.
 */
// La fila de escritura.ts: normaliza la carpeta, no traba con un error y se vacía sola.
const enFila = enFilaDeArchivos;

/**
 * El taller abre un universo por intento: un git worktree de verdad,
 * en su propia rama y su propia carpeta.
 *
 * Por qué worktree y no clone: comparte el object store, así abrir ocho
 * universos de un repo grande cuesta segundos y no gigas.
 *
 * Cada universo tiene su puerto y su base (ver puertos.ts): dos corriendo
 * `npm run dev` contra el mismo Postgres se pisaban, y el portón culpaba
 * al código equivocado.
 */
export class TallerDeGit implements Taller {
  /** La carpeta de ESTA siembra. Se crea una sola vez, aunque varios
   *  universos la pidan a la vez: sin la promesa cacheada, cada `abrir()`
   *  en paralelo armaba su propia temporal y los universos de una misma
   *  siembra terminaban desparramados por todo el disco. */
  private base?: Promise<string>;

  constructor(
    private readonly repo: string,
    private readonly raiz?: string,
    /** Sobre qué commit se abre cada universo. Por defecto HEAD; la cola
     *  usa otro para volver a sembrar una tarea encima de la rama con la
     *  que chocó. */
    private readonly desde = "HEAD",
    /** Cómo se deja listo cada worktree (ver entorno.ts); null: tal cual lo deja git. */
    private readonly preparacion: { readonly config?: ConfigDeEntorno; readonly deAfuera?: boolean } | null = {},
  ) {}

  /** Dónde viven los universos de esta siembra. */
  async carpeta(): Promise<string> {
    if (this.raiz) return this.raiz;
    this.base ??= mkdtemp(join(tmpdir(), "dolphin-"));
    return await this.base;
  }

  async abrir(id: string, rama: string): Promise<Universo> {
    const ruta = join(await this.carpeta(), id);
    const ramaDelUniverso = `${rama}/${id}`;

    // La carpeta sale de un mkdtemp nuevo y la rama lleva un sufijo al azar:
    // no hay nada colgado con qué chocar. Antes acá había un `worktree prune`
    // «por las dudas», que se llevaba los worktrees de la persona.
    // El commit base se fija ahora: es contra qué se mide la rama (ver cambios.ts).
    // Adentro de la fila y sin esperar nada antes: los universos entran en el orden en que se pidieron.
    const base = await enFila(this.repo, async () => {
      const commit = (await this.git(["rev-parse", this.desde])).trim();
      // El checkout de un repo enorme tarda: el tope de lo demás no le alcanza.
      await this.git(["worktree", "add", "-b", ramaDelUniverso, ruta, commit], TOPE_DEL_CHECKOUT);
      // Trabado con el pid de quien lo usa: un `git worktree remove --force` de
      // la persona no se lo lleva a mitad de camino (con el enlace a node_modules
      // puesto, le vaciaba el suyo), y si este proceso muere, el próximo sabe
      // que quedó huérfano (ver barrerHuerfanos).
      await this.git(["worktree", "lock", "--reason", `${TRABA} ${process.pid}`, ruta]).catch(() => "");
      return commit;
    });

    let puerto: number | undefined;
    try {
      // El puerto y el entorno primero: «preparar» corre con ellos (su PORT, su DATABASE_URL).
      const conPuerto = this.preparacion?.config?.puerto;
      puerto = await puertoParaUniverso(conPuerto?.desde);
      // Con la base del `.env` del repo también: casi siempre vive ahí (ver puertos.ts).
      // La base lleva también el puerto, que no se repite entre los universos vivos: el id solo no alcanza.
      const entorno = entornoDelUniverso(id, puerto, await baseDelRepo(this.repo), conPuerto?.variable, `${id}_${puerto}`);
      // Fuera de la fila: instalar puede tardar, y la fila es solo para lo que toca .git.
      const preparado = this.preparacion ? await prepararWorktree(this.repo, ruta, this.preparacion.config, { ...this.preparacion, entorno }) : undefined;
      return {
        id,
        rama: ramaDelUniverso,
        ruta,
        base,
        nacido: Date.now(),
        repo: this.repo,
        entorno,
        ...(preparado && preparado.pasos.length + (preparado.porQue ? 1 : 0) > 0 ? { preparado } : {}),
      };
    } catch (error) {
      // A medio abrir (un enlace que no se pudo crear, una copia que falló): no queda colgado.
      soltarPuerto(puerto);
      await this.cerrar({ id, rama: ramaDelUniverso, ruta, nacido: Date.now() }).catch(() => {});
      throw error;
    }
  }

  async cerrar(universo: Universo): Promise<void> {
    const puerto = Number(universo.entorno?.["PORT"]);
    if (Number.isInteger(puerto)) soltarPuerto(puerto);
    await enFila(this.repo, async () => {
      await this.git(["worktree", "unlock", universo.ruta]).catch(() => "");
      // Suelta el enlace antes del remove: si no, lo sigue y le borra al repo su node_modules.
      // El remove va con --force porque el universo casi siempre tiene cambios sin commitear:
      // es justo lo que el agente acaba de escribir.
      await quitarWorktree(this.repo, universo.ruta);
      await this.git(["branch", "-D", universo.rama]).catch(() => {});
      await olvidarTurnos(this.repo, universo.rama);
    });
    await rm(universo.ruta, { recursive: true, force: true }).catch(() => {});
    // La carpeta de la siembra se va con el último: sin esto quedaba una vacía por siembra en el temporal.
    if (!this.raiz) await rmdir(dirname(universo.ruta)).catch(() => {});
  }

  /**
   * Lo que queda al terminar la siembra (la elegida, y todas con «guardar el
   * código»): sin el enlace a node_modules y destrabado. Ya no lo usa nadie,
   * y la persona tiene que poder borrarlo con git como cualquier otro.
   */
  async soltar(universo: Universo): Promise<void> {
    await soltarEnlaces(universo.ruta);
    await this.git(["worktree", "unlock", universo.ruta]).catch(() => "");
  }

  /** Cada turno del agente queda guardado, para volver a él (ver turnos.ts). Si no se puede, sigue igual. */
  async turno(universo: Universo, n: number, que: string): Promise<void> {
    await guardarTurno(universo.ruta, universo.rama, n, que).catch(() => "");
  }

  /** La foto del universo antes de una corrección (ver puntos.ts). */
  async guardar(universo: Universo): Promise<string> {
    return guardarPunto(universo.ruta);
  }

  /** Vuelve a la foto y mide de nuevo: la forma de la corrección deshecha ya no existe. */
  async volver(universo: Universo, punto: string): Promise<Forma> {
    await volverAlPunto(universo.ruta, punto);
    return medirForma(universo.ruta);
  }

  private git(args: readonly string[], tope?: number): Promise<string> {
    return git(args, this.repo, tope ? { tope } : {});
  }
}

/** La razón con la que Dolphin traba los worktrees que está usando; detrás va el pid. */
export const TRABA = "dolphin";

/**
 * Los worktrees que dejó trabados un proceso de Dolphin que ya no está (lo
 * cortaron, se apagó la máquina): se sueltan, se borran y se lleva su rama.
 * Solo los de Dolphin con el dueño muerto: uno de otra siembra que sigue
 * corriendo, o uno de la persona, no se toca. Devuelve cuántos barrió.
 */
export async function barrerHuerfanos(repo: string): Promise<number> {
  const lista = await git(["worktree", "list", "--porcelain"], repo).catch(() => "");
  let barridos = 0;
  for (const bloque of lista.split(/\r?\n\r?\n/)) {
    const ruta = /^worktree (.+)$/m.exec(bloque)?.[1]?.trim();
    const traba = /^locked (.+)$/m.exec(bloque)?.[1]?.trim() ?? "";
    const dueno = new RegExp(`^${TRABA}(?:-guardian)? (\\d+)$`).exec(traba);
    if (!ruta || !dueno || procesoVivo(Number(dueno[1]))) continue;
    await soltarEnlaces(ruta);
    await git(["worktree", "unlock", ruta], repo).catch(() => {});
    await quitarWorktree(repo, ruta);
    const rama = /^branch refs\/heads\/(.+)$/m.exec(bloque)?.[1]?.trim();
    // Las de Dolphin: «dolphin/…», o «dolphin-ramas/…» si la persona tiene una rama «dolphin»; y las
    // del equipo y de /bug, que tienen su propio prefijo. Una rama con commits que no están en la
    // base conserva el trabajo aunque el proceso que la dejó haya muerto: solo se barre su worktree.
    if (rama && new RegExp(`^${TRABA}(-ramas|-equipo|-bug)?/`).test(rama)) {
      const sinTrabajoPropio = await git(["merge-base", "--is-ancestor", rama, "HEAD"], repo).then(() => true, () => false);
      if (sinTrabajoPropio) await git(["branch", "-D", rama], repo).catch(() => {});
    }
    barridos += 1;
  }
  return barridos;
}

/** Un taller de mentira, para los tests: no toca el disco. */
export class TallerDeJuguete implements Taller {
  readonly abiertos = new Set<string>();
  readonly cerrados: string[] = [];

  async abrir(id: string, rama: string): Promise<Universo> {
    this.abiertos.add(id);
    return { id, rama: `${rama}/${id}`, ruta: `/juguete/${id}`, nacido: 0 };
  }

  async cerrar(universo: Universo): Promise<void> {
    this.abiertos.delete(universo.id);
    this.cerrados.push(universo.id);
  }
}
