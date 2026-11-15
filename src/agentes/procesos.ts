import { execFile, execFileSync } from "node:child_process";

/**
 * Los procesos que lanzan los agentes y el portón, y cómo se cortan: el árbol entero y, si el agente
 * corría en una caja, también su contenedor.
 */

/** El contenedor donde corre un agente: matar al cliente `docker` no lo para, hay que borrarlo. */
export interface Contenedor {
  readonly caja: "docker" | "podman";
  readonly nombre: string;
}

export type QuitarContenedor = (contenedor: Contenedor) => Promise<void>;

const quitarDeVerdad: QuitarContenedor = ({ caja: tipo, nombre }) =>
  new Promise((listo) => execFile(tipo, ["rm", "-f", nombre], { windowsHide: true, timeout: 30_000 }, () => listo()));

/**
 * Corta una corrida: el árbol de procesos y, si corría en una caja, el contenedor. Matar al cliente
 * `docker` (o al lanzador de la red filtrada) deja el contenedor vivo, `--rm` o no, y la retoma
 * lanzaría otro agente sobre el mismo worktree mientras el primero sigue escribiendo.
 */
export async function cortarCorrida(pid: number | undefined, contenedor?: Contenedor, quitar: QuitarContenedor = quitarDeVerdad): Promise<void> {
  await matarArbol(pid);
  if (contenedor) await quitar(contenedor);
}

/**
 * Los procesos que este lanzó y siguen vivos (agentes, fases del portón).
 * En POSIX van en su propio grupo para que un tope mate el árbol entero, y
 * eso los saca del alcance de un Ctrl+C: si a Dolphin lo cortan, se los
 * lleva con él (ver soltarEnlacesAlCortar en entorno.ts).
 */
const hijos = new Set<number>();

export function anotarHijo(pid: number | undefined): void {
  if (pid !== undefined) hijos.add(pid);
}

export function olvidarHijo(pid: number | undefined): void {
  if (pid !== undefined) hijos.delete(pid);
}

/** Si un proceso sigue vivo. Sin permiso para mirarlo también cuenta como vivo: existe. */
export function procesoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Mata a todos los hijos vivos, ya: es lo último que hace un proceso al que cortaron. */
export function matarHijosYa(): void {
  for (const pid of hijos) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ya no estaba
      }
    }
  }
  hijos.clear();
}

/**
 * Matar el árbol, no solo al hijo.
 *
 * En Windows un `.cmd` corre dentro de `cmd.exe`: `kill()` cierra el
 * `cmd.exe` y deja vivo el `node` que importaba, con el puerto del universo
 * tomado para siempre. Lo mismo con el CLI de un agente y sus herramientas.
 * En POSIX, `kill(-pid)` mata al grupo: los hijos se lanzan como cabeza del suyo.
 */
export function matarArbol(pid: number | undefined): Promise<void> {
  if (pid === undefined) return Promise.resolve();

  if (process.platform === "win32") {
    // Hay que ESPERAR a taskkill antes de matar la raíz: si la raíz muere
    // primero, /T ya no encuentra el árbol y los hijos quedan huérfanos y
    // vivos. Pasaba: matarArbol + kill() seguidos dejaban el node escuchando.
    return new Promise((listo) => {
      execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => listo());
    });
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ya no está */
    }
  }
  return Promise.resolve();
}
