import { leerConfig } from "./config.js";
import { gitValor } from "./git.js";
import { puertoLibre } from "./puertos.js";
import { paraLaConsola, previewDeRama, registrarPreview, type AppDelPreview, type PreviewParaLaConsola } from "./preview.js";
import { TallerDeGit } from "./taller.js";
import { levantarApp } from "../tester/levantar.js";
import type { Taller, Universo } from "./tipos.js";

/**
 * Abrir el preview de una rama: el worktree, el puerto y la app levantada.
 *
 * Está separado de `preview.ts` a propósito: ahí vive el registro y el proxy, que no saben de git
 * ni de procesos y se prueban con un servidor de mentira. Acá se junta lo que sí: un worktree
 * descartable en la punta de la rama (el mismo taller que usa el portón, así el worktree queda con
 * las dependencias enlazadas y la app arranca) y el comando del repo en un puerto libre.
 *
 * **No toca el árbol de trabajo de nadie**, igual que `probarRama`: se mira la rama commiteada.
 *
 * El comando para levantar sale de `dolphin.config.json` → `pantalla`, que es el mismo que usa la
 * fase de pantalla. Si el repo no lo tiene, no se adivina: `npm run dev` no existe en todos los
 * repos y uno equivocado deja un proceso colgado y una pantalla en blanco. Se pide configurarlo.
 */

export interface DepsDelPreview {
  /** Se inyecta en los tests; por defecto, worktrees de git de verdad. */
  readonly taller?: Taller;
  readonly puerto?: () => Promise<number>;
  readonly levantar?: typeof levantarApp;
  /** Para los tests: en vez de preguntarle a git por el commit de la rama. */
  readonly commitDe?: (repo: string, rama: string) => Promise<string>;
}

export const SIN_PANTALLA =
  'para ver la app de una rama hace falta decir cómo se levanta: poné «pantalla» en dolphin.config.json, por ejemplo {"pantalla":{"levantar":"npm run dev -- --port {PUERTO}","url":"http://127.0.0.1:{PUERTO}/"}}';

export async function abrirPreviewDeRama(repo: string, rama: string, deps: DepsDelPreview = {}): Promise<PreviewParaLaConsola> {
  // Uno por rama: pedirlo dos veces es alguien que recargó la consola, no dos apps.
  const yaEsta = previewDeRama(rama);
  if (yaEsta) return paraLaConsola(yaEsta);

  const config = await leerConfig(repo);
  const pantalla = config.pantalla;
  if (!pantalla) throw new Error(SIN_PANTALLA);

  const commit = await (deps.commitDe ?? ((r, b) => gitValor(["rev-parse", "--verify", `${b}^{commit}`], r).catch(() => "")))(repo, rama);
  if (!commit) throw new Error(`no existe la rama «${rama}» en ${repo}`);

  const taller = deps.taller ?? new TallerDeGit(repo, undefined, commit, { ...(config.entorno ? { config: config.entorno } : {}) });
  const universo: Universo = await taller.abrir("preview", `dolphin/preview/${rama.replace(/[^\w.-]+/g, "-")}`);

  let app: AppDelPreview;
  try {
    app = await (deps.levantar ?? levantarApp)({
      comando: pantalla.levantar,
      url: pantalla.url,
      cwd: universo.ruta,
      puerto: await (deps.puerto ?? puertoLibre)(),
      ...(pantalla.espera !== undefined ? { esperaMs: pantalla.espera } : {}),
      ...(universo.entorno ? { entorno: universo.entorno } : {}),
    });
  } catch (error) {
    // Si no levantó, el worktree se cierra acá: quedaría colgado en disco por una app que no arrancó.
    await taller.cerrar(universo).catch(() => {});
    throw error;
  }

  // Cerrar el preview apaga la app Y devuelve el worktree: son la misma operación para quien mira.
  const conWorktree: AppDelPreview = {
    url: app.url,
    salida: app.salida,
    detener: async () => {
      await app.detener().catch(() => {});
      await taller.cerrar(universo).catch(() => {});
    },
  };
  return paraLaConsola(registrarPreview({ rama, ruta: universo.ruta, app: conWorktree }));
}
