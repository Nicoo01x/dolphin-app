import { rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { armarVeredicto, mirarPantallas, superficiesAProbar, type InformeDePantalla } from "./pantalla.js";
import { personasPorNombre } from "./personas.js";
import { levantarApp, type AppLevantada } from "./levantar.js";
import { puertoLibre } from "../nucleo/puertos.js";
import type { Universo, Verificador } from "../nucleo/tipos.js";

/**
 * La fase de pantalla en una siembra de verdad.
 *
 * Cada rama levanta su app —el comando del repo, en su worktree y en su
 * puerto—, las personas la miran en las superficies que la rama declaró,
 * y la app se apaga. Solo cortan los problemas NUEVOS: lo que el repo ya
 * tenía antes de sembrar no es culpa de la rama (se mide una vez, sobre el
 * repo base, y se compara). Lo que falla queda grabado en video.
 *
 * Se configura en `dolphin.config.json` → `pantalla`.
 */

export interface ConfigDePantalla {
  /** Cómo se levanta la app, con `{PUERTO}`: «npm run dev -- --port {PUERTO}». */
  readonly levantar: string;
  /** Dónde contesta: «http://127.0.0.1:{PUERTO}/». */
  readonly url: string;
  /** Cuánto esperar a que levante, en ms (por defecto 30 s). */
  readonly espera?: number;
  /** Qué personas miran (por defecto, las cinco). */
  readonly personas?: readonly string[];
  /** Qué mirar si la rama no declaró superficies (por defecto, la URL de la app). */
  readonly superficies?: readonly string[];
  /**
   * Guardar también UN video por rama de la app andando con el cambio (por defecto, sí): es lo que
   * muestra el parte de la mañana. Con false, solo quedan los videos de lo que falló.
   */
  readonly videoDeLoQueAnda?: boolean;
}

export interface OpcionesDelEscalon {
  /** El repo sin tocar: contra él se compara. */
  readonly repoBase: string;
  /** Dónde guardar los videos de lo que falla (`.dolphin/videos`). */
  readonly carpetaVideo?: string;
}

type Mirada = { informes: InformeDePantalla[] | null } | { noLevanto: string };

/**
 * Lo que declara un agente es texto libre: «index.html (página de producto)»,
 * «alta», «http://localhost:3000/alta». Se lleva a una ruta que se pueda
 * pedir; lo que no se parece a una ruta, se descarta (y se mira la app).
 */
export function normalizarSuperficie(declarada: string): string | undefined {
  const limpia = declarada.replace(/\([^)]*\)/g, " ").trim().split(/\s+/)[0] ?? "";
  if (limpia === "" || /^(ninguna|ninguno|n\/a|-)$/i.test(limpia)) return undefined;
  let ruta = limpia;
  if (/^https?:\/\//i.test(ruta)) {
    try {
      const url = new URL(ruta);
      ruta = `${url.pathname}${url.hash}`;
    } catch {
      return undefined;
    }
  }
  if (ruta.startsWith("#")) return ruta;
  // «//otro-sitio/x» es otro host, no una ruta de esta app.
  if (ruta.startsWith("//")) return undefined;
  ruta = ruta.replace(/(^|\/)index\.html?$/i, "$1");
  return ruta.startsWith("/") ? ruta : `/${ruta}`;
}

/**
 * Un problema es «el mismo» si es del mismo tipo, en el mismo lugar, para la
 * misma persona. En la consola el lugar es siempre «la consola»: ahí lo que
 * distingue es el mensaje (sin números de línea ni puertos), o un TypeError
 * nuevo pasaba por el 404 de siempre. En el resto, el lugar sin el texto
 * del elemento: renombrar «Enviar» a «Mandar» no vuelve nuevo un contraste viejo.
 */
export const clave = (persona: string, h: { tipo: string; donde: string; detalle?: string }) =>
  h.tipo === "consola"
    ? `${persona}|consola|${(h.detalle ?? "").replace(/\d+/g, "#").slice(0, 120)}`
    : `${persona}|${h.tipo}|${h.donde.replace(/\s*«[^»]*»/g, "")}`;

/** Lo que una rama rompió: sus hallazgos menos los que el repo ya tenía. */
export function soloNuevos(
  informes: readonly InformeDePantalla[],
  base: readonly InformeDePantalla[],
): { informes: InformeDePantalla[]; yaEstaban: number } {
  const viejos = new Set(base.flatMap((i) => i.hallazgos.map((h) => clave(i.persona, h))));
  let yaEstaban = 0;
  const nuevos = informes.map((i) => {
    const hallazgos = i.hallazgos.filter((h) => {
      const viejo = viejos.has(clave(i.persona, h));
      if (viejo) yaEstaban += 1;
      return !viejo;
    });
    return { ...i, hallazgos };
  });
  return { informes: nuevos, yaEstaban };
}

/** Levanta la app de una carpeta —el repo o el worktree de una rama, en su puerto—, o dice por qué no levantó. */
export async function levantarLaApp(config: ConfigDePantalla, ruta: string, universo?: Universo): Promise<AppLevantada | string> {
  const puerto = Number(universo?.entorno?.["PORT"]) || (await puertoLibre());
  try {
    return await levantarApp({
      comando: config.levantar,
      url: config.url,
      cwd: ruta,
      puerto,
      ...(universo?.entorno ? { entorno: universo.entorno } : {}),
      ...(config.espera ? { esperaMs: config.espera } : {}),
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Lo declarado, llevado a rutas que la app de verdad contesta. Si no queda ninguna, la URL de la app. */
export async function superficiesQueExisten(
  app: AppLevantada,
  declaradas: readonly string[],
): Promise<{ superficies: (string | undefined)[]; descartadas: string[] }> {
  const superficies: string[] = [];
  const descartadas: string[] = [];
  for (const declarada of declaradas) {
    const ruta = normalizarSuperficie(declarada);
    if (ruta === undefined) {
      descartadas.push(declarada);
      continue;
    }
    // Un 404 de las dos apps no sirve para comparar nada: se mira lo que existe.
    const existe = await fetch(new URL(ruta, app.url), { redirect: "manual", signal: AbortSignal.timeout(3000) })
      .then((r) => r.status < 400)
      .catch(() => false);
    if (existe && !superficies.includes(ruta)) superficies.push(ruta);
    else if (!existe) descartadas.push(declarada);
  }
  return { superficies: superficies.length > 0 ? superficiesAProbar({ superficies }) : [undefined], descartadas };
}

export function verificadorDePantallaDeLaApp(config: ConfigDePantalla, opciones: OpcionesDelEscalon): Verificador {
  const personas = personasPorNombre(config.personas ?? []);
  const lineaBase = new Map<string, Promise<InformeDePantalla[] | null>>();
  const base = resolve(opciones.repoBase);
  const levantar = (ruta: string, universo?: Universo) => levantarLaApp(config, ruta, universo);

  function mirar(app: AppLevantada, superficies: readonly (string | undefined)[], carpetaVideo?: string) {
    return mirarPantallas({
      url: (superficie) => (superficie ? new URL(superficie, app.url).href : app.url),
      superficies,
      personas,
      ...(carpetaVideo ? { carpetaVideo } : {}),
    });
  }

  async function mirarEn(ruta: string, superficies: readonly (string | undefined)[]): Promise<Mirada> {
    const app = await levantar(ruta);
    if (typeof app === "string") return { noLevanto: app };
    try {
      return { informes: await mirar(app, superficies) };
    } finally {
      await app.detener();
    }
  }

  /**
   * Lo que el repo base ya tenía, por superficie. Se mide una sola vez por
   * superficie y por siembra, y las ramas que llegan juntas comparten la
   * misma medición (la entrada se guarda antes del primer await).
   */
  function lineaBaseDe(superficies: readonly (string | undefined)[]): Promise<(InformeDePantalla[] | null)[]> {
    const faltan = superficies.filter((s) => !lineaBase.has(s ?? ""));
    if (faltan.length > 0) {
      const medicion = mirarEn(base, faltan).then((m) => ("informes" in m ? m.informes : null));
      for (const s of faltan) {
        lineaBase.set(s ?? "", medicion.then((informes) => informes?.filter((i) => (i.superficie ?? "") === (s ?? "")) ?? null));
      }
    }
    return Promise.all(superficies.map((s) => lineaBase.get(s ?? "")!));
  }

  return {
    nombre: "pantalla",
    costo: "gratis",
    async correr(universo, contexto) {
      const declaradas = contexto?.contrato?.superficies?.length ? contexto.contrato.superficies : (config.superficies ?? []);

      // El repo base no se juzga contra sí mismo: se mide para comparar, y
      // de paso se sabe si la app levanta antes de sembrar.
      if (resolve(universo.ruta) === base) {
        const app = await levantar(base);
        if (typeof app === "string") {
          return { paso: false, detalle: "pantalla: la app no levanta ni en el repo sin tocar", evidencia: app, gastado: 0 };
        }
        try {
          const { superficies } = await superficiesQueExisten(app, declaradas);
          const informes = await mirar(app, superficies);
          for (const s of superficies) {
            if (!lineaBase.has(s ?? "")) lineaBase.set(s ?? "", Promise.resolve(informes?.filter((i) => (i.superficie ?? "") === (s ?? "")) ?? null));
          }
        } finally {
          await app.detener();
        }
        return { paso: true, detalle: "pantalla: la app levanta; lo que ya tiene es la línea base", gastado: 0 };
      }

      const app = await levantar(universo.ruta, universo);
      if (typeof app === "string") {
        return { paso: false, detalle: "pantalla: la app de esta rama no levanta", evidencia: app, gastado: 0 };
      }
      let mirada: InformeDePantalla[] | null;
      let previas: (InformeDePantalla[] | null)[];
      let descartadas: string[];
      try {
        const elegidas = await superficiesQueExisten(app, declaradas);
        descartadas = elegidas.descartadas;
        [mirada, previas] = await Promise.all([mirar(app, elegidas.superficies, opciones.carpetaVideo), lineaBaseDe(elegidas.superficies)]);
      } finally {
        await app.detener();
      }
      if (!mirada) {
        return {
          paso: true,
          salteada: true,
          detalle: "pantalla: no hay navegador, se salteó",
          evidencia: "instalá playwright-core y Chrome para correr este escalón",
          gastado: 0,
        };
      }
      // Lo que falló en la herramienta (la página recargada a mitad de la mirada) no es de
      // la rama: no corta. Si no se pudo mirar ninguna, la fase no corrió.
      const deLaHerramienta = mirada.flatMap((i) => i.hallazgos.filter((h) => h.tipo === "herramienta").map((h) => `${i.persona}: ${h.detalle}`));
      if (mirada.length > 0 && mirada.every((i) => i.hallazgos.some((h) => h.tipo === "herramienta"))) {
        return { paso: true, salteada: true, detalle: "pantalla: no se pudo mirar ninguna pantalla, se salteó", evidencia: deLaHerramienta.join("\n"), gastado: 0 };
      }
      mirada = mirada.map((i) => ({ ...i, hallazgos: i.hallazgos.filter((h) => h.tipo !== "herramienta") }));

      const sinBase = previas.some((p) => p === null);
      const { informes, yaEstaban } = soloNuevos(mirada, previas.flatMap((p) => p ?? []));
      const videos = await quedarseConLosVideos(informes, universo.id, config.videoDeLoQueAnda !== false);
      const veredicto = armarVeredicto(informes, 0);
      const aviso = sinBase ? " (sin línea base: el repo sin tocar no levantó, cuenta todo)" : yaEstaban > 0 ? ` (el repo ya tenía ${yaEstaban} que no son de esta rama)` : "";
      const nota = descartadas.length > 0 ? `\n\nNo son rutas de la app, se miró lo que existe: ${descartadas.join(", ")}` : "";

      return {
        ...veredicto,
        detalle: veredicto.paso ? `pantalla: ${informes.length} miradas, nada roto nuevo${aviso}` : `${veredicto.detalle}${aviso}`,
        ...(veredicto.evidencia || nota ? { evidencia: `${veredicto.evidencia ?? ""}${nota}`.trim() } : {}),
        ...(videos.length > 0 ? { videos } : {}),
      };
    },
  };
}

/**
 * Se guardan los videos de lo que falló, con un nombre que se entiende
 * (`u2-pulgar-alta-<hora>.webm`), y —si `unoQueAnda`— el primero de lo que
 * anduvo (`u2-anda-…`), uno solo por rama: es la prueba de que el cambio
 * funciona, la que se mira a la mañana. Los demás se borran.
 */
export async function quedarseConLosVideos(informes: readonly InformeDePantalla[], universo: string, unoQueAnda = false): Promise<string[]> {
  const guardados: string[] = [];
  let yaHayUnoQueAnda = false;
  for (const informe of informes) {
    if (!informe.video) continue;
    // La portada (la captura con el problema resaltado) va con su video.
    const portada = informe.video.replace(/\.webm$/, ".png");
    const anda = informe.hallazgos.length === 0;
    if (anda && (!unoQueAnda || yaHayUnoQueAnda)) {
      await rm(informe.video, { force: true }).catch(() => {});
      await rm(portada, { force: true }).catch(() => {});
      continue;
    }
    if (anda) yaHayUnoQueAnda = true;
    // «u1-pulgar-alta-<hora>»: la persona y la pantalla, sin el «en /» del rótulo.
    const persona = informe.persona.split(" en ")[0] ?? informe.persona;
    const pantalla = (informe.superficie ?? "").replace(/^[/#]+/, "").replace(/[^\w@.-]+/g, "-").replace(/^-+|-+$/g, "");
    const nombre = `${universo}${anda ? "-anda" : ""}-${persona}${pantalla ? `-${pantalla}` : ""}-${Date.now()}.webm`.replace(/[^\w@.-]+/g, "-");
    const destino = join(dirname(informe.video), nombre);
    await rename(informe.video, destino).catch(() => {});
    await rename(portada, destino.replace(/\.webm$/, ".png")).catch(() => {});
    guardados.push(basename(destino));
  }
  return guardados;
}
