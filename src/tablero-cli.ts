import { existsSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { rutaEnVivo } from "./nucleo/en-vivo.js";
import { aplicarEvento, estadoInicial, type EventoConHora } from "./tablero/estado.js";
import { dibujarTablero } from "./tablero/dibujo.js";
import { abrirTablero } from "./tablero/en-vivo.js";
import { SIMULACION_DESDE, siembraSimulada } from "./tablero/simulacion.js";

/**
 * dolphin tablero [--repo <ruta>] [--demo]
 *
 * La siembra en vivo, en la terminal: las ramas, el portón fase por fase, la línea de tiempo y
 * la cola del log. Lee `.dolphin/en-vivo.jsonl`, así que sirve para mirar desde otra terminal una
 * siembra que lanzó `sembrar`, la cola, el autopiloto o la app. Con `--demo`, una siembra de
 * mentira en tiempo real (no gasta nada). Sin terminal interactiva imprime el estado una vez.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    demo: { type: "boolean", default: false },
  },
});

const interactiva = process.stdout.isTTY === true;
const POLL_MS = 200;
const ESPERA_AL_TERMINAR_MS = 1500;
const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

function leerLinea(linea: string): EventoConHora | null {
  try {
    const evento = JSON.parse(linea) as EventoConHora;
    return typeof evento?.tipo === "string" && typeof evento.t === "number" ? evento : null;
  } catch {
    return null;
  }
}

async function demo(): Promise<void> {
  const eventos = siembraSimulada();
  if (!interactiva) {
    const estado = estadoInicial(SIMULACION_DESDE);
    for (const e of eventos) aplicarEvento(estado, e);
    console.log(dibujarTablero(estado, { ancho: 100, ahora: estado.ultimo, color: false }).join("\n"));
    return;
  }
  const tablero = abrirTablero(process.stdout);
  const arranque = Date.now();
  for (const e of eventos) {
    await esperar(Math.max(0, arranque + (e.t - SIMULACION_DESDE) - Date.now()));
    tablero.recibir({ ...e, t: arranque + (e.t - SIMULACION_DESDE) });
  }
  await esperar(ESPERA_AL_TERMINAR_MS);
  tablero.cerrar();
}

async function seguir(repo: string): Promise<void> {
  const ruta = rutaEnVivo(repo);
  if (!existsSync(ruta)) {
    console.error(`\n  No hay ninguna siembra en vivo en ${repo} (falta .dolphin/en-vivo.jsonl).`);
    console.error("  Sembrá con `npm run sembrar`, o probá el tablero con `npm run tablero -- --demo`.\n");
    process.exit(1);
  }
  const estado = estadoInicial(Date.now());
  const tablero = interactiva ? abrirTablero(process.stdout) : null;
  const recibir = (e: EventoConHora) => (tablero ? tablero.recibir(e) : aplicarEvento(estado, e));
  let leido = 0;
  let resto = "";
  let terminada = false;
  const archivo = await open(ruta, "r");
  process.once("SIGINT", () => {
    tablero?.cerrar();
    process.exit(0);
  });
  try {
    for (;;) {
      const { size } = await stat(ruta);
      // La siembra trunca el archivo al arrancar: si se achicó, empezó otra y se lee de cero.
      if (size < leido) {
        leido = 0;
        resto = "";
      }
      if (size > leido) {
        const buffer = Buffer.alloc(size - leido);
        await archivo.read(buffer, 0, buffer.length, leido);
        leido = size;
        const lineas = (resto + buffer.toString("utf8")).split("\n");
        resto = lineas.pop() ?? "";
        for (const linea of lineas) {
          const evento = leerLinea(linea);
          if (!evento) continue;
          recibir(evento);
          if (evento.tipo === "cosecha") terminada = true;
        }
      }
      if (terminada || !tablero) break;
      await esperar(POLL_MS);
    }
  } finally {
    await archivo.close();
  }
  if (tablero) {
    await esperar(ESPERA_AL_TERMINAR_MS);
    tablero.cerrar();
  } else {
    console.log(dibujarTablero(estado, { ancho: 100, ahora: estado.ultimo, color: false }).join("\n"));
  }
}

if (values.demo) await demo();
else await seguir(resolve(values.repo ?? process.cwd()));
