import { cambiosDe } from "./cambios.js";
import { leerConfig } from "./config.js";
import type { Verificador } from "./tipos.js";

/**
 * La política de lo que corre solo.
 *
 * Un turno del calendario, el Autopilot o un «Implementar» de la bandeja
 * corren sin nadie mirando, y el agente trabaja sin pedir permiso. Eso es
 * seguro por dos cosas: escribe en un worktree descartable, y esta
 * política. Puede escribir en su rama y dejarla lista para un PR; NO puede
 * deployar, tocar migraciones ni empujar nada a ningún lado.
 *
 * Se aplica dos veces, porque cada una tapa el agujero de la otra: al
 * agente se le prohíben los comandos (no puede ni intentarlo), y el portón
 * mira el diff (si igual lo escribió, la rama se corta con el motivo).
 *
 * Se ajusta por repo en `dolphin.config.json`, versionado con el código.
 */

export interface Politica {
  /** Globs de archivos que una rama automática no puede tocar. */
  readonly archivosProhibidos: readonly string[];
  /** Prefijos de comandos que el agente no puede correr (formato de Claude Code). */
  readonly comandosProhibidos: readonly string[];
}

export const POLITICA_POR_DEFECTO: Politica = {
  archivosProhibidos: [
    "**/migrations/**",
    "**/migration/**",
    ".github/workflows/**",
    "**/deploy*.{sh,ps1,bat,yml,yaml,js,mjs,cjs,ts}",
    "**/.env",
    "**/.env.*",
  ],
  comandosProhibidos: [
    "Bash(git push:*)",
    "Bash(git commit:*)",
    "Bash(git reset:*)",
    "Bash(git rebase:*)",
    "Bash(git merge:*)",
    "Bash(git checkout:*)",
    "Bash(npm publish:*)",
    "Bash(pnpm publish:*)",
    "Bash(npx prisma migrate:*)",
    "Bash(prisma migrate:*)",
    "Bash(ssh:*)",
    "Bash(scp:*)",
    "Bash(rsync:*)",
    "Bash(vercel:*)",
    "Bash(fly deploy:*)",
    "Bash(kubectl:*)",
    "Bash(docker push:*)",
  ],
};

/**
 * La política del repo: lo de `dolphin.config.json` reemplaza al default
 * campo por campo. Salvo en un repo de afuera (entró clonando una URL): esa
 * config la escribió otro, y con `comandosProhibidos: []` le sacaba todas
 * las prohibiciones a lo que corre solo. Ahí lo del repo solo suma.
 */
export async function leerPolitica(repo: string, { deAfuera = false }: { deAfuera?: boolean } = {}): Promise<Politica> {
  const delRepo = (await leerConfig(repo)).politica;
  if (deAfuera) {
    const sumar = (defecto: readonly string[], extra: readonly string[] | undefined) => [...new Set([...defecto, ...(extra ?? [])])];
    return {
      archivosProhibidos: sumar(POLITICA_POR_DEFECTO.archivosProhibidos, delRepo?.archivosProhibidos),
      comandosProhibidos: sumar(POLITICA_POR_DEFECTO.comandosProhibidos, delRepo?.comandosProhibidos),
    };
  }
  return {
    archivosProhibidos: delRepo?.archivosProhibidos ?? POLITICA_POR_DEFECTO.archivosProhibidos,
    comandosProhibidos: delRepo?.comandosProhibidos ?? POLITICA_POR_DEFECTO.comandosProhibidos,
  };
}

/** Un glob a regex: `**` cruza carpetas, `*` y `?` no, `{a,b}` es una alternativa. */
export function globARegex(glob: string): RegExp {
  let regex = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` puede ser ninguna carpeta: «**/migrations/**» tiene que
        // agarrar también «migrations/001.sql» en la raíz.
        if (glob[i + 2] === "/") {
          regex += "(?:.*/)?";
          i += 2;
        } else {
          regex += ".*";
          i += 1;
        }
      } else {
        regex += "[^/]*";
      }
    } else if (c === "?") {
      regex += "[^/]";
    } else if (c === "{") {
      const cierre = glob.indexOf("}", i);
      if (cierre < 0) {
        regex += "\\{";
        continue;
      }
      const opciones = glob.slice(i + 1, cierre).split(",").map((o) => o.replace(/[.+^$()|[\]\\]/g, "\\$&"));
      regex += `(?:${opciones.join("|")})`;
      i = cierre;
    } else {
      regex += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${regex}$`, "i");
}

/** Qué archivos de la lista rompen la política, con el glob que los atrapó. */
export function violaciones(archivos: readonly string[], politica: Politica): { archivo: string; regla: string }[] {
  const reglas = politica.archivosProhibidos.map((g) => ({ glob: g, regex: globARegex(g) }));
  const encontradas: { archivo: string; regla: string }[] = [];
  for (const archivo of archivos) {
    const normalizado = archivo.replace(/\\/g, "/");
    const regla = reglas.find((r) => r.regex.test(normalizado));
    if (regla) encontradas.push({ archivo: normalizado, regla: regla.glob });
  }
  return encontradas;
}

/** En voz humana: por qué una regla existe, para que el corte se entienda. */
function porQueDe(regla: string): string {
  if (/migration/i.test(regla)) return "lo que corre solo no toca migraciones";
  if (/workflows|deploy/i.test(regla)) return "lo que corre solo no deploya";
  if (/\.env/i.test(regla)) return "lo que corre solo no toca secretos";
  return "la política del repo no lo permite";
}

/**
 * Lo que la rama cambió contra su commit, nuevos incluidos: una migración
 * NUEVA es justo la que hay que ver. Con las rutas tal cual (una tilde no
 * la esconde detrás de escapes) y sin lo que Dolphin copió (ver cambios.ts).
 */
export async function archivosTocados(ruta: string, contra = "HEAD"): Promise<string[]> {
  return (await cambiosDe(ruta, contra)).map((c) => c.ruta);
}

/** La política como una fase del portón: gratis, y antes que todas las demás. */
export function verificadorDePolitica(politica: Politica): Verificador {
  return {
    nombre: "política",
    costo: "gratis",
    async correr(universo) {
      const encontradas = violaciones(await archivosTocados(universo.ruta), politica);
      if (encontradas.length === 0) {
        return { paso: true, detalle: "política: no tocó nada prohibido", gastado: 0 };
      }
      const primera = encontradas[0]!;
      const cola = encontradas.length > 1 ? ` (y ${encontradas.length - 1} más)` : "";
      return {
        paso: false,
        detalle: `política: tocó ${primera.archivo}${cola} — ${porQueDe(primera.regla)}`,
        evidencia: encontradas.map((e) => `${e.archivo}  ← ${e.regla}`).join("\n"),
        gastado: 0,
      };
    },
  };
}
