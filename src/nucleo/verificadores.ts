import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { anotarHijo, matarArbol, olvidarHijo, prepararComando } from "../agentes/ejecutar.js";
import { anotarComando } from "./bitacora.js";
import { conTurnoDeVerificacion, lugaresDeVerificacion, type OpcionesDeTurno } from "./cola-de-verificacion.js";
import { leerConfig } from "./config.js";
import type { Costo, Universo, Veredicto, Verificador } from "./tipos.js";

/**
 * Los verificadores que no cuestan nada: un comando y su código de salida.
 *
 * Acá entra todo lo que ya tenés escrito en un repo — tipos, lint, tests,
 * build, el barrido de pantallas, el medidor de peso. Esa es la razón por
 * la que Dolphin no necesita inventar un juez: el repo ya lo tiene, solo
 * que hoy lo corre una persona cuando se acuerda.
 */

/**
 * Las fases de `porton.comandos` de dolphin.config.json, validadas: lo que no tiene nombre y comando
 * de texto no entra (un config a mano con un error no puede romper el portón entero).
 */
export function verificadoresDelPorton(comandos: readonly unknown[] | undefined, { tope }: { readonly tope?: number } = {}): Verificador[] {
  return (comandos ?? [])
    .filter((c): c is { nombre: string; cmd: string; args?: unknown } => !!c && typeof (c as { nombre?: unknown }).nombre === "string" && typeof (c as { cmd?: unknown }).cmd === "string")
    .map((c) =>
      verificadorDeComando({
        nombre: c.nombre,
        cmd: c.cmd,
        args: Array.isArray(c.args) ? c.args.filter((a): a is string => typeof a === "string") : [],
        ...(tope ? { tope } : {}),
      }),
    );
}

export interface Comando {
  readonly nombre: string;
  readonly cmd: string;
  readonly args?: readonly string[];
  /** Milisegundos antes de darlo por colgado. Un verificador que no termina es un verificador que falló. */
  readonly tope?: number;
  readonly costo?: Costo;
  /**
   * La cola de verificación (ver cola-de-verificacion.ts): por defecto, la de la máquina. Sirve para
   * fijar cuántos a la vez o usar otro directorio de turnos (los tests).
   */
  readonly cola?: OpcionesDeTurno;
}

export function verificadorDeComando(comando: Comando): Verificador {
  return {
    nombre: comando.nombre,
    costo: comando.costo ?? "gratis",
    async correr(universo: Universo) {
      const listo = prepararComando(comando.cmd, comando.args ?? []);

      if (!listo) {
        // No encontrar el comando no es culpa del candidato. Si matara acá,
        // Dolphin descartaría código bueno porque a la máquina le falta algo.
        return {
          paso: true,
          salteada: true,
          detalle: `${comando.nombre}: no encontré «${comando.cmd}», se salteó`,
          gastado: 0,
        };
      }

      // Lo que se corrió de verdad queda anotado en la bitácora de la rama, con su código de salida
      // (ver nucleo/bitacora.ts): es lo que permite revisar una rama sin creerle al agente.
      // Los dos se fijan cuando el comando arranca de verdad, ya con turno: ni el tope ni los `ms` de la
      // bitácora cuentan el tiempo en la cola (ver cola-de-verificacion.ts), que puede ser largo.
      let arranque = Date.now();
      let esperaMs = 0;
      const anotar = (codigo: number | null, salida: string) =>
        universo.repo
          ? anotarComando(universo.repo, universo.rama, {
              fase: comando.nombre,
              cmd: comando.cmd,
              args: comando.args ?? [],
              ...(listo.cmd !== comando.cmd ? { corrioComo: [listo.cmd, ...listo.args].join(" ") } : {}),
              cwd: universo.ruta,
              codigo,
              ms: Date.now() - arranque,
              ...(esperaMs > 0 ? { esperaMs } : {}),
              salida,
            })
          : Promise.resolve();

      const correrYa = () => new Promise<Veredicto & { gastado: number }>((resolver) => {
        arranque = Date.now();
        const proceso = spawn(listo.cmd, [...listo.args], {
          cwd: universo.ruta,
          windowsHide: true,
          windowsVerbatimArguments: listo.verbatim,
          // En POSIX, cabeza de su propio grupo: así el tope mata al árbol
          // entero (`kill(-pid)`), y no solo a npm dejando al test colgado.
          detached: process.platform !== "win32",
          // El puerto y la base propios del universo: si el verificador
          // levanta la app, la levanta en su puerto y no en el del vecino.
          env: { ...process.env, ...(universo.entorno ?? {}) },
        });
        anotarHijo(proceso.pid);
        // Texto de una vez por flujo: sumar pedazos partía una «ñ» y la evidencia salía con «�».
        proceso.stdout.setEncoding("utf8");
        proceso.stderr.setEncoding("utf8");

        let salida = "";
        let colgado = false;

        const reloj = setTimeout(() => {
          colgado = true;
          // El árbol entero: si no, un `npm run dev` colgado deja el node
          // vivo con el puerto del universo tomado.
          void matarArbol(proceso.pid).then(() => proceso.kill("SIGKILL"));
        }, comando.tope ?? 180_000);

        proceso.stdout.on("data", (t: string) => (salida += t));
        proceso.stderr.on("data", (t: string) => (salida += t));

        proceso.on("error", (error) => {
          clearTimeout(reloj);
          olvidarHijo(proceso.pid);
          void anotar(null, `no se pudo correr: ${error.message}`).then(() =>
            resolver({
              paso: false,
              detalle: `${comando.nombre}: no se pudo correr (${error.message})`,
              evidencia: salida,
              gastado: 0,
            }),
          );
        });

        proceso.on("close", (codigo) => {
          clearTimeout(reloj);
          olvidarHijo(proceso.pid);
          const texto = salida.trim();
          // Colgado: no terminó solo, así que no tiene código de salida que valga.
          void anotar(colgado ? null : codigo, texto).then(() => {
            if (!colgado && codigo === 0) {
              resolver({ paso: true, detalle: `${comando.nombre}: pasó`, evidencia: texto, gastado: 0 });
              return;
            }

            resolver({
              paso: false,
              detalle: colgado
                ? `${comando.nombre}: no terminó a tiempo`
                : `${comando.nombre}: ${primeraLineaUtil(texto) || "falló"}`,
              evidencia: texto,
              gastado: 0,
            });
          });
        });
      });

      // Cuántos a la vez: la variable de entorno, después `porton.verificacionesALaVez`, después lo que
      // aguanta la máquina. La config se lee del repo (no del worktree, que puede no tenerla).
      const lugares =
        comando.cola?.lugares ??
        lugaresDeVerificacion({ config: (await leerConfig(universo.repo ?? universo.ruta)).porton?.verificacionesALaVez });

      return await conTurnoDeVerificacion(
        comando.nombre,
        async (turno) => {
          esperaMs = turno.esperoMs;
          const veredicto = await correrYa();
          if (esperaMs <= 0) return veredicto;
          // Esperar hasta un segundo es ruido de sondeo; más que eso se dice, para que se entienda por qué tardó.
          const dicho = esperaMs >= ESPERA_QUE_SE_DICE_MS ? ` (esperó ${Math.round(esperaMs / 1000)} s su turno en la cola)` : "";
          return { ...veredicto, detalle: `${veredicto.detalle}${dicho}`, esperaMs };
        },
        { ...comando.cola, lugares },
      );
    },
  };
}

/** Desde cuándo vale la pena decir en el detalle que se esperó turno. */
const ESPERA_QUE_SE_DICE_MS = 1_000;

/**
 * La primera línea que le sirve a una persona.
 *
 * Importa más de lo que parece: este texto es lo que se ve en la fila del
 * universo muerto. "u4 · desborde en 390 px" se entiende de un vistazo;
 * "Command failed with exit code 1" no dice absolutamente nada.
 */
export function primeraLineaUtil(salida: string): string {
  const lineas = salida
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  // Los contadores del resumen —«ℹ fail 2», «# fail 2», «Tests: 1 failed»—
  // matchean /fail/ y en `node --test` salen ANTES del test que falló, así
  // que se quedaban con el lugar: la fila del universo muerto decía
  // «test: ℹ fail 2», que no dice qué se rompió. Son un número, no un motivo.
  const contador = /^(?:[ℹ#•]\s*)?(?:tests?|suites?|pass(?:ed)?|fail(?:ed|ures)?|todo|skipped|cancelled|duration_ms|duration|snapshots?|assertions?)\b[\s:]*\d|^\d+\s+(?:passing|failing|pending)/i;

  // «✖ failing tests:» es el rótulo de la sección, no el motivo. Un rótulo
  // es corto y termina en dos puntos; «AssertionError …: Expected values to
  // be strictly equal:» también termina así, pero trae el motivo adentro.
  const rotulo = (l: string) => l.endsWith(":") && l.length < 30;

  // `npm run peso` abre con «> demo@1.0.0 peso» y «> node scripts/peso.js»:
  // es el eco del comando, nunca el motivo. Sin esto, un verificador que
  // falla sin decir «error» ni «fail» —un medidor de peso, por ejemplo—
  // reportaba el encabezado de npm en vez de lo que midió.
  const ecoDeNpm = (l: string) => l.startsWith(">");

  const utiles = lineas.filter((l) => !contador.test(l) && !rotulo(l) && !ecoDeNpm(l));

  const jugosa = utiles.find((l) =>
    /error|failed|fail|✕|✖|×|✗|assert|expected|desborda|excede/i.test(l),
  );

  // «✖ conIva con 0 (0.6798ms)» se lee mejor sin el cronómetro: lo que
  // importa en una fila de 40 px es el nombre del test que se rompió.
  const elegida = (jugosa ?? utiles[0] ?? lineas[0] ?? "").replace(/\s*\(\d+(?:\.\d+)?m?s\)\s*$/, "");
  return elegida.length > 160 ? `${elegida.slice(0, 157)}…` : elegida;
}

/**
 * Los scripts de npm que sirven de fase, del más barato al más caro: el
 * primero que falla corta, así que lo barato va adelante. `peso` y `build`
 * construyen, y Guardian —que corre en cada commit— los deja afuera si nadie
 * se los pide. Antes la consola y Guardian tenían cada uno su lista.
 */
export const FASES_DE_NPM: readonly string[] = ["sintaxis", "typecheck", "lint", "test", "peso", "build"];
const CONSTRUYEN = new Set(["peso", "build"]);

/** Las de `FASES_DE_NPM` que tiene el `package.json` del repo, en ese orden. Sin uno legible, ninguna. */
export async function fasesDelPaquete(repo: string, { sinConstruir = false }: { readonly sinConstruir?: boolean } = {}): Promise<string[]> {
  try {
    const scripts = (JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
    return FASES_DE_NPM.filter((s) => s in scripts && !(sinConstruir && CONSTRUYEN.has(s)));
  } catch {
    return [];
  }
}

/** Atajo: los scripts de npm de un repo, en el orden en que conviene correrlos. `tope`: por fase, en ms. */
export function verificadoresDeNpm(scripts: readonly string[], { tope }: { readonly tope?: number } = {}): Verificador[] {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return scripts.map((script) =>
    verificadorDeComando({ nombre: script, cmd: npm, args: ["run", script], ...(tope ? { tope } : {}) }),
  );
}
