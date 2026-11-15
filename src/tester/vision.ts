import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { juezConClaude, juzgar, type Captura, type CorrerJuez, type Evidencia, type Veredicto } from "../agentes/juez.js";
import { levantarLaApp, superficiesQueExisten, type ConfigDePantalla } from "./escalon-pantalla.js";
import { explorar, NO_TOCAR_POR_DEFECTO } from "./explorador.js";
import { abrirNavegadorExplorable } from "./explorador-playwright.js";
import { mismoModelo, otroEscalon } from "../nucleo/router.js";
import type { AsuntoNuevo } from "../nucleo/bandeja.js";
import type { Verificador } from "../nucleo/tipos.js";

/**
 * Dolphin Vision: la app de la rama, usada como la usaría alguien que
 * recién llega, y juzgada por alguien que no la escribió.
 *
 * Las personas (ver pantalla.ts) miran lo que se puede medir; Vision
 * explora: en dos anchos —la compu y el teléfono— abre lo que la rama
 * declaró, toca lo que hay, manda los formularios vacíos y mira si algo se
 * sale. Después un juez de OTRO modelo decide si la tarea está cumplida
 * mirando solo esa evidencia (ver agentes/juez.ts): las capturas y los
 * hallazgos, nunca el código ni lo que cuenta el agente. Sin nota, no pasa.
 *
 * Cada veredicto queda en `.dolphin/vision/`, con sus capturas: quien pasa
 * una rama tiene que poder mostrar por qué.
 */

export interface OpcionesDeVision {
  readonly tarea: string;
  /** El modelo del juez: otro que el que escribió (ver router.ts). */
  readonly modelo: string;
  /** Dónde queda cada veredicto con sus capturas (`.dolphin/vision`). */
  readonly carpeta: string;
  /** Los anchos en que se recorre: la compu y el teléfono. */
  readonly anchos?: readonly number[];
  /** Textos que el explorador nunca toca, además de los de siempre. */
  readonly noTocar?: readonly RegExp[];
  /** Quién corre al juez: el CLI de Claude por defecto. */
  readonly juez?: CorrerJuez;
}

/** Cuántas capturas ve el juez, como mucho: más es plata, no más certeza. */
const TOPE_DE_CAPTURAS = 10;

export function verificadorDeVision(config: ConfigDePantalla, opciones: OpcionesDeVision): Verificador {
  const correrJuez = opciones.juez ?? juezConClaude();
  const anchos = opciones.anchos ?? [1440, 390];
  const noTocar = [...NO_TOCAR_POR_DEFECTO, ...(opciones.noTocar ?? [])];

  return {
    nombre: "vision",
    costo: "barato",
    async correr(universo, contexto) {
      const declaradas = contexto?.contrato?.superficies?.length ? contexto.contrato.superficies : (config.superficies ?? []);
      const app = await levantarLaApp(config, universo.ruta, universo);
      if (typeof app === "string") return { paso: false, detalle: "vision: la app de esta rama no levanta", evidencia: app, gastado: 0 };

      // La evidencia vive fuera del repo mientras se juzga: el juez corre ahí y no lee nada más.
      // Adentro del try: si no se puede crear, la app de la rama se apaga igual.
      let carpeta = "";
      try {
        carpeta = await mkdtemp(join(tmpdir(), "dolphin-vision-"));
        const { superficies } = await superficiesQueExisten(app, declaradas);
        const capturas: Captura[] = [];
        const hallazgos: AsuntoNuevo[] = [];
        // Lo que probó y anduvo también es evidencia: sin esto, un formulario que avisa bien no deja rastro.
        const comprobado: string[] = [];
        for (const ancho of anchos) {
          const navegador = await abrirNavegadorExplorable({ ancho, alto: ancho < 600 ? 844 : 900, carpetaCapturas: carpeta });
          if (!navegador) return { paso: true, salteada: true, detalle: "vision: no hay Chrome ni Edge en esta máquina, se salteó", gastado: 0 };
          try {
            for (const superficie of superficies) {
              const url = superficie ? new URL(superficie, app.url).href : app.url;
              await navegador.pagina.ir(url);
              // La página entera: lo que la rama sumó abajo del pliegue también tiene que poder verse.
              const archivo = await navegador.pagina.capturar(`${ancho}-${superficie ?? "inicio"}`, { entera: true });
              if (archivo) capturas.push({ archivo, que: `${superficie ?? "/"} en ${ancho} px, la página entera recién abierta` });
              // Como alguien que recién llega: toca lo que hay, manda los formularios vacíos, mira si algo se sale.
              const informe = await explorar(navegador.pagina, { estados: {} }, {
                inicio: url,
                noTocar,
                topeDeAcciones: ancho < 600 ? 6 : 12,
                profundidad: 1,
              });
              hallazgos.push(...informe.asuntos.map((a) => ({ ...a, donde: `${a.donde} en ${ancho} px` })));
              comprobado.push(...informe.comprobado.map((c) => `${c} en ${ancho} px`));
            }
          } finally {
            await navegador.cerrar();
          }
        }

        // Las capturas de lo que encontró, después de las de cada pantalla: el juez ve el problema, no solo el relato.
        for (const h of hallazgos) if (h.captura) capturas.push({ archivo: h.captura, que: `${h.titulo} (${h.donde})` });
        const lineas = hallazgos.map((h) => `${h.titulo} — ${h.donde}${h.pasos?.length ? `. Cómo: ${h.pasos.at(-1)}` : ""}`);
        // Independiente o no es: si esta rama la escribió el modelo del juez (la que salió a medir), juzga otro.
        const modelo = contexto?.modelo && mismoModelo(contexto.modelo, opciones.modelo) ? otroEscalon(opciones.modelo) : opciones.modelo;
        const evidencia = { capturas: capturas.slice(0, TOPE_DE_CAPTURAS), hallazgos: lineas, comprobado };
        // La rúbrica de la tarea se fija la primera vez y después se juzga siempre la misma.
        const veredicto = await juzgarConRubrica(opciones.carpeta, opciones.tarea, (rubrica) =>
          juzgar(correrJuez, opciones.tarea, evidencia, carpeta, modelo, rubrica),
        );
        const registro = await registrar(opciones.carpeta, universo.id, carpeta, evidencia, veredicto).catch(() => undefined);
        return aFase(veredicto, lineas, registro);
      } finally {
        await app.detener();
        if (carpeta) await rm(carpeta, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

/** El veredicto como fase del portón: lo que corta, en una línea; todos los criterios, en la evidencia. */
export function aFase(
  veredicto: Veredicto,
  hallazgos: readonly string[],
  registro?: string,
): { paso: boolean; detalle: string; evidencia: string; gastado: number; salteada?: boolean } {
  const quien = `el juez (${veredicto.modelo})`;
  // Lo que no se pudo leer es una falla del juez, no de la rama: no corta, y queda dicho que no se juzgó.
  if (veredicto.ilegible) {
    return { paso: true, salteada: true, detalle: `vision: ${quien} no contestó algo legible, se salteó`, evidencia: veredicto.porQue, gastado: veredicto.gastado };
  }
  const marca = (cumple: boolean | null) => (cumple === true ? "✓" : cumple === false ? "✗" : "?");
  const evidencia = [
    ...veredicto.criterios.map((c) => `${marca(c.cumple)} ${c.criterio}${c.evidencia ? ` — ${c.evidencia}` : ""}`),
    ...(veredicto.porQue ? ["", veredicto.porQue] : []),
    ...(hallazgos.length > 0 ? ["", "Lo que encontró explorando:", ...hallazgos.map((h) => `- ${h}`)] : []),
    ...(registro ? ["", `La evidencia: ${registro}`] : []),
  ].join("\n");
  if (veredicto.decision === "aceptar") {
    const n = veredicto.criterios.length;
    return { paso: true, detalle: `vision: ${quien} aceptó: ${n} de ${n} criterios con evidencia`, evidencia, gastado: veredicto.gastado };
  }
  if (veredicto.decision === "cortar") {
    const falla = veredicto.criterios.find((c) => c.cumple === false)!;
    return { paso: false, detalle: `vision: ${quien} cortó — ${falla.criterio}${falla.evidencia ? ` (${falla.evidencia})` : ""}`, evidencia, gastado: veredicto.gastado };
  }
  // El que quedó en duda: sin cumplir ni no cumplir, o «cumple» sin mostrar dónde.
  const dudoso = veredicto.criterios.find((c) => c.cumple === null || (c.cumple === true && c.evidencia === ""));
  return {
    paso: false,
    detalle: `vision: ${quien} no pudo decidir — ${dudoso ? `${dudoso.criterio}: no hay evidencia que lo muestre` : veredicto.porQue}`,
    evidencia,
    gastado: veredicto.gastado,
  };
}

/** Las rúbricas que se están fijando en este proceso: las demás ramas de la siembra esperan a que quede. */
const fijando = new Map<string, Promise<unknown>>();

/**
 * Juzga con la rúbrica de la tarea; si todavía no hay, la fija ESTA rama y
 * las demás esperan a usar la misma. Las ramas se juzgan a la vez: sin esto,
 * cada una inventaba la suya y la última en guardar se la imponía a la
 * siguiente siembra, con criterios que las demás nunca vieron.
 */
async function juzgarConRubrica(base: string, tarea: string, juzgarCon: (rubrica?: readonly string[]) => Promise<Veredicto>): Promise<Veredicto> {
  const clave = rutaDeRubrica(base, tarea);
  let rubrica = await leerRubrica(base, tarea);
  const otra = fijando.get(clave);
  if (!rubrica && otra) {
    await otra.catch(() => {});
    rubrica = await leerRubrica(base, tarea);
  }
  if (rubrica) return juzgarCon(rubrica);

  const veredicto = juzgarCon(undefined).then(async (v) => {
    // Una rúbrica que dejó al juez en duda puede tener un criterio imposible de probar: esa no se fija.
    if (v.decision !== "duda" && v.criterios.length > 0) await guardarRubrica(base, tarea, v.criterios.map((c) => c.criterio)).catch(() => {});
    return v;
  });
  fijando.set(clave, veredicto);
  try {
    return await veredicto;
  } finally {
    if (fijando.get(clave) === veredicto) fijando.delete(clave);
  }
}

/** Las rúbricas, por tarea: `.dolphin/vision/rubricas/<hash>.json`. */
const rutaDeRubrica = (base: string, tarea: string) =>
  join(base, "rubricas", `${createHash("sha1").update(tarea.trim()).digest("hex").slice(0, 12)}.json`);

export async function leerRubrica(base: string, tarea: string): Promise<string[] | undefined> {
  try {
    const datos = JSON.parse(await readFile(rutaDeRubrica(base, tarea), "utf8")) as { criterios?: unknown };
    return Array.isArray(datos.criterios) && datos.criterios.every((c) => typeof c === "string") ? (datos.criterios as string[]) : undefined;
  } catch {
    return undefined;
  }
}

async function guardarRubrica(base: string, tarea: string, criterios: readonly string[]): Promise<void> {
  const ruta = rutaDeRubrica(base, tarea);
  await mkdir(join(base, "rubricas"), { recursive: true });
  await writeFile(ruta, `${JSON.stringify({ tarea, criterios }, null, 2)}\n`);
}

/** Deja el veredicto y sus capturas en `.dolphin/vision/<fecha>-<rama>/`. Devuelve la carpeta. */
async function registrar(base: string, universo: string, desde: string, evidencia: Evidencia, veredicto: Veredicto): Promise<string> {
  const carpeta = join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-${universo}`);
  await mkdir(carpeta, { recursive: true });
  for (const c of evidencia.capturas) await copyFile(join(desde, c.archivo), join(carpeta, c.archivo)).catch(() => {});
  await writeFile(join(carpeta, "veredicto.json"), `${JSON.stringify({ ...veredicto, ...evidencia }, null, 2)}\n`);
  return carpeta;
}
