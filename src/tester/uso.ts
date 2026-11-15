import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerDiff } from "../nucleo/diff.js";
import { mismoModelo, otroEscalon } from "../nucleo/router.js";
import type { Verificador } from "../nucleo/tipos.js";
import { problemasDeConfigDeUso, type ConfigDeUso } from "./uso-config.js";
import { lanzarDeVerdad, type AppDeUso, type Lanzar } from "./uso-lanzar.js";
import { CARPETA_DE_CAPTURAS, faltaElNavegadorDelModelo, leerInforme, pedidoAlModelo, usoConClaude, type CorrerUso, type InformeDeUso } from "./uso-modelo.js";

/**
 * La fase `uso`: un modelo barato USA lo que la rama cambió y cuenta qué vio.
 *
 * Los tests y los tipos dicen que el código compila; `pantalla` dice que la app
 * no se rompe; `vision` mira capturas de un recorrido fijo. Ninguna usa la
 * función nueva. Acá la app corre con un perfil descartable, un modelo la maneja
 * por depuración remota —toca, teclea, lee la consola y la red— y devuelve lo que
 * hizo y lo que vio. Es lo que hubiera atrapado la función cuyas imágenes daban
 * 404 en la app corriendo: pasaba tipos y tests, y nadie las pidió.
 *
 * La decisión es del código, no del modelo (ver decidirUso): solo corta un «no»
 * con un problema que trae su evidencia. Un modelo que no encontró el botón no
 * es prueba de que esté roto, así que esa fase se saltea.
 *
 * Y pase lo que pase —pase, falle o explote— se mata el árbol de procesos que se
 * lanzó y se borra el perfil: un proceso o un puerto huérfano es un bug.
 */

export interface OpcionesDeUso {
  readonly tarea: string;
  /** El modelo que usa la app: otro que el que escribió (ver router.ts). */
  readonly modelo: string;
  /** Dónde queda cada informe con sus capturas (`.dolphin/uso`). */
  readonly carpeta: string;
  /** Quién lanza la app: el real por defecto; los tests lo inyectan. */
  readonly lanzar?: Lanzar;
  /** Quién corre al modelo: el CLI de Claude con el navegador MCP por defecto. */
  readonly correr?: CorrerUso;
  /** Por qué no se puede correr (o `undefined`). Por defecto mira que esté el MCP; con `correr` inyectado, no pide nada. */
  readonly disponible?: () => string | undefined | Promise<string | undefined>;
}

export type ResultadoDeUso = { paso: boolean; detalle: string; evidencia?: string; gastado: number; salteada?: boolean };

const VUELTAS_POR_DEFECTO = 40;
/** Cuántos archivos se le nombran al modelo: el resto es ruido para orientarse. */
const TOPE_DE_ARCHIVOS = 40;

export function verificadorDeUso(config: ConfigDeUso, opciones: OpcionesDeUso): Verificador {
  const lanzar = opciones.lanzar ?? lanzarDeVerdad;
  const correr = opciones.correr ?? usoConClaude();
  const disponible = opciones.disponible ?? (opciones.correr ? () => undefined : () => faltaElNavegadorDelModelo());

  return {
    nombre: "uso",
    costo: "barato",
    async correr(universo, contexto) {
      // Antes de lanzar nada: una config a medias o un navegador que falta no deben abrir procesos.
      const mala = problemasDeConfigDeUso(config);
      if (mala.length > 0) return saltear("la configuración de «uso» no sirve", mala.join("\n"));
      const falta = await disponible();
      if (falta) return saltear("falta con qué usar la app", falta);

      const diff = await leerDiff(universo.ruta, { entero: true, ...(universo.base ? { base: universo.base } : {}) });
      if (diff.noSePudo) return saltear(`no pude leer qué cambió la rama (${diff.porQue ?? "git no contestó"})`);
      if (!diff.hay) return saltear("la rama no dejó ningún cambio que usar");
      const archivos = archivosDelDiff(diff.texto);

      // Independiente o no es: si esta rama la escribió el modelo que usa la app, la usa otro.
      const modelo = contexto?.modelo && mismoModelo(contexto.modelo, opciones.modelo) ? otroEscalon(opciones.modelo) : opciones.modelo;

      let trabajo = "";
      let perfil = "";
      let app: AppDeUso | undefined;
      try {
        trabajo = await mkdtemp(join(tmpdir(), "dolphin-uso-"));
        perfil = await mkdtemp(join(tmpdir(), "dolphin-perfil-"));
        await mkdir(join(trabajo, CARPETA_DE_CAPTURAS), { recursive: true });

        const lanzada = await lanzar({ config, universo, perfil }).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
        if (typeof lanzada === "string") return saltear("la app de esta rama no levantó para usarla", lanzada);
        app = lanzada;

        let respuesta: { texto: string; gastado: number };
        try {
          respuesta = await correr({
            prompt: pedidoAlModelo(opciones.tarea, archivos),
            modelo,
            cdp: app.cdp,
            trabajo,
            vueltas: config.vueltas ?? VUELTAS_POR_DEFECTO,
          });
        } catch (error) {
          // Un modelo que explota no dice nada de la rama: la fase no corrió.
          return saltear(`el modelo (${modelo}) no pudo usar la app`, error instanceof Error ? error.message : String(error), app.salida());
        }

        const informe = leerInforme(respuesta.texto);
        if (!informe) {
          return { ...saltear(`el modelo (${modelo}) no contestó algo legible`, respuesta.texto.replace(/\s+/g, " ").slice(0, 300)), gastado: respuesta.gastado };
        }
        const decision = decidirUso(informe, modelo);
        const registro = await registrar(opciones.carpeta, universo.id, join(trabajo, CARPETA_DE_CAPTURAS), { tarea: opciones.tarea, modelo, archivos, informe, gastado: respuesta.gastado, decision }).catch(
          () => undefined,
        );
        return { ...decision, evidencia: [decision.evidencia, registro ? `La evidencia: ${registro}` : ""].filter(Boolean).join("\n\n"), gastado: respuesta.gastado };
      } finally {
        // La correa: pase lo que pase, nada queda vivo ni en el disco.
        await app?.detener().catch(() => {});
        if (perfil) await rm(perfil, { recursive: true, force: true }).catch(() => {});
        if (trabajo) await rm(trabajo, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

function saltear(detalle: string, evidencia?: string, salida?: string): ResultadoDeUso {
  const completa = [evidencia, salida ? `Lo último que escribió la app:\n${salida.trim()}` : ""].filter(Boolean).join("\n\n");
  return { paso: true, salteada: true, detalle: `uso: ${detalle}, se salteó`, ...(completa ? { evidencia: completa } : {}), gastado: 0 };
}

/**
 * La decisión, que es del código:
 * - «no» con al menos un problema que trae evidencia: la rama no pasa, y el detalle es el primero de ellos.
 * - «no» sin evidencia: una opinión no corta una rama; se saltea.
 * - «no_pude_comprobarlo»: se saltea, no corta (que no haya encontrado el botón no prueba que esté roto).
 * - «si»: pasa, si contó qué vio; un «anda» sin una sola cosa vista no prueba nada y se saltea.
 */
export function decidirUso(informe: InformeDeUso, modelo: string): ResultadoDeUso {
  const quien = `el modelo (${modelo})`;
  const resumen = resumirInforme(informe);
  const conEvidencia = informe.problemas.filter((p) => p.evidencia.length >= 3);

  if (informe.funciona === "no") {
    const primero = conEvidencia[0];
    if (primero) {
      const donde = primero.donde ? ` (${primero.donde})` : "";
      return { paso: false, detalle: `uso: ${quien} usó la app y no anda — ${primero.que}${donde}: ${primero.evidencia}`, evidencia: resumen, gastado: 0 };
    }
    return { paso: true, salteada: true, detalle: `uso: ${quien} dice que no anda pero no trae evidencia, se salteó`, evidencia: resumen, gastado: 0 };
  }
  if (informe.funciona === "no_pude_comprobarlo") {
    return { paso: true, salteada: true, detalle: `uso: ${quien} no pudo comprobarlo en la app, se salteó`, evidencia: resumen, gastado: 0 };
  }
  if (informe.lo_que_vi.length === 0) {
    return { paso: true, salteada: true, detalle: `uso: ${quien} dice que anda pero no cuenta qué vio, se salteó`, evidencia: resumen, gastado: 0 };
  }
  return { paso: true, detalle: `uso: ${quien} usó la app y anda: ${informe.lo_que_vi.length} cosas vistas, ${informe.problemas.length} problemas`, evidencia: resumen, gastado: 0 };
}

function resumirInforme(informe: InformeDeUso): string {
  const lista = (titulo: string, items: readonly string[]) => (items.length > 0 ? [titulo, ...items.map((i) => `- ${i}`), ""] : []);
  return [
    ...lista("Lo que hizo:", informe.lo_que_hice),
    ...lista("Lo que vio:", informe.lo_que_vi),
    ...lista(
      "Problemas:",
      informe.problemas.map((p) => `${p.que}${p.donde ? ` (${p.donde})` : ""}${p.evidencia ? ` — ${p.evidencia}` : " — sin evidencia"}`),
    ),
  ]
    .join("\n")
    .trim();
}

/** Los archivos que tocó la rama, de las cabeceras del diff: nombres, no código. */
export function archivosDelDiff(diff: string): string[] {
  const vistos = new Set<string>();
  for (const linea of diff.split("\n")) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(linea);
    if (m) vistos.add(m[2]!);
  }
  const todos = [...vistos];
  return todos.length > TOPE_DE_ARCHIVOS ? [...todos.slice(0, TOPE_DE_ARCHIVOS), `… y ${todos.length - TOPE_DE_ARCHIVOS} más`] : todos;
}

/** Deja el informe y las capturas en `.dolphin/uso/<fecha>-<universo>/`. Devuelve la carpeta. */
async function registrar(base: string, universo: string, capturas: string, datos: Record<string, unknown>): Promise<string> {
  const carpeta = join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-${universo}`);
  await mkdir(carpeta, { recursive: true });
  for (const archivo of await readdir(capturas).catch(() => [])) await copyFile(join(capturas, archivo), join(carpeta, archivo)).catch(() => {});
  await writeFile(join(carpeta, "informe.json"), `${JSON.stringify(datos, null, 2)}\n`);
  return carpeta;
}
