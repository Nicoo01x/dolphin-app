import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { leerConfig } from "./nucleo/config.js";
import {
  comandoDeAlcance,
  comandoDeDolphinRemoto,
  comandoDeTunel,
  comandoParaCorrer,
  leerAlcance,
  maquinaLlamada,
  maquinasDe,
  type Alcance,
  type Invocacion,
  type Maquina,
} from "./nucleo/maquinas.js";

/**
 * `dolphin maquinas`: tus otras computadoras, desde acá.
 *
 * Correr en un VPS ya existía, pero la única puerta era agendar un turno. Acá se ve la lista, se
 * pregunta cuál contesta, se abre el túnel y se larga trabajo allá mirándolo acá.
 *
 * Lo que arma cada comando vive en `nucleo/maquinas.ts` y está probado sin tocar ningún VPS. Este
 * archivo sólo lanza procesos y los imprime.
 */

const AYUDA = `
  dolphin maquinas · tus otras computadoras

  dolphin maquinas                          la lista, y cuál contesta
  dolphin maquinas --tunel vps              lo que corre allá, en tu localhost
  dolphin maquinas --tunel vps --puerto 7777 --puerto-remoto 3000
  dolphin maquinas --en vps -- npm test     corre eso allá y lo ves acá, en vivo
  dolphin maquinas --sembrar vps -- --tarea "arreglá el login"

  Se configuran por repo en dolphin.config.json:
    "hosts": { "vps": { "destino": "nico@1.2.3.4", "repo": "/var/www/app", "dolphin": "/opt/dolphin-app" } }

  Siempre con clave (BatchMode): si la clave no está, falla en vez de esperar una contraseña.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      repo: { type: "string", default: process.cwd() },
      tunel: { type: "string" },
      puerto: { type: "string", default: "7777" },
      "puerto-remoto": { type: "string" },
      en: { type: "string" },
      sembrar: { type: "string" },
      ayuda: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.ayuda) {
    console.log(AYUDA);
    return;
  }

  const repo = resolve(values.repo ?? process.cwd());
  const hosts = (await leerConfig(repo)).hosts;

  if (values.tunel) {
    const maquina = maquinaLlamada(values.tunel, hosts);
    const local = Number(values.puerto);
    const puertoRemoto = values["puerto-remoto"];
    const invocacion = comandoDeTunel(maquina, {
      local,
      ...(puertoRemoto ? { remoto: Number(puertoRemoto) } : {}),
    });
    const remoto = puertoRemoto ? Number(puertoRemoto) : local;
    console.log(
      `\n  Túnel a ${maquina.nombre} (${maquina.host.destino}): http://127.0.0.1:${local} es el ${remoto} de allá.`,
    );
    console.log("  Queda abierto hasta que lo cortes con Ctrl+C.\n");
    process.exit(await lanzar(invocacion));
  }

  if (values.en || values.sembrar) {
    const nombre = values.en ?? values.sembrar ?? "";
    const maquina = maquinaLlamada(nombre, hosts);
    // Why los positionals y no una sola cadena: `-- npm test --watch` llega partido, y volver a
    // pegarlo con espacios rompe cualquier argumento que tenga uno adentro.
    const invocacion = values.sembrar
      ? comandoDeDolphinRemoto(maquina, ["sembrar", ...positionals])
      : comandoParaCorrer(maquina, positionals.join(" "));
    console.log(`\n  En ${maquina.nombre} (${maquina.host.destino}), sobre ${maquina.host.repo}:\n`);
    process.exit(await lanzar(invocacion));
  }

  await listar(hosts);
}

async function listar(hosts: Parameters<typeof maquinasDe>[0]): Promise<void> {
  const todas = maquinasDe(hosts);
  if (todas.length === 0) {
    console.log(`
  No hay ninguna máquina configurada en este repo.

  Se agregan en dolphin.config.json:
    "hosts": { "vps": { "destino": "nico@1.2.3.4", "repo": "/var/www/app", "dolphin": "/opt/dolphin-app" } }

  «destino» es lo que le pasarías a ssh, «repo» dónde está el proyecto allá y «dolphin» dónde
  está instalado Dolphin allá.
`);
    return;
  }

  console.log("\n  preguntando…\n");
  // En paralelo: una máquina apagada tarda lo que diga ConnectTimeout, y en serie se suman.
  const alcances = await Promise.all(todas.map(preguntarSiContesta));
  const ancho = Math.max(...todas.map((m) => m.nombre.length));
  for (const maquina of todas) {
    const alcance = alcances.find((a) => a.nombre === maquina.nombre);
    const marca = alcance?.llega ? "✓" : "·";
    const cuanto = alcance?.llega ? `${alcance.ms} ms` : (alcance?.porque ?? "no contesta");
    console.log(
      `  ${marca} ${maquina.nombre.padEnd(ancho)}  ${maquina.host.destino}  ${maquina.host.repo}  · ${cuanto}`,
    );
  }
  console.log(`
  ✓ contesta · · no llegué

  dolphin maquinas --tunel <nombre>          lo que corre allá, en tu localhost
  dolphin maquinas --en <nombre> -- <cmd>    corre eso allá y lo ves acá
`);
}

async function preguntarSiContesta(maquina: Maquina): Promise<Alcance> {
  const desde = Date.now();
  const { codigo, error } = await correrCallado(comandoDeAlcance(maquina));
  return leerAlcance(maquina.nombre, { codigo, error }, Date.now() - desde);
}

/** Pegado a esta terminal: lo que pasa allá se ve acá mientras pasa. */
function lanzar(invocacion: Invocacion): Promise<number> {
  return new Promise((listo) => {
    const hijo = spawn(invocacion.programa, [...invocacion.argumentos], { stdio: "inherit" });
    // Un ssh que no está instalado llega como `error` y nunca como `close`: sin esto, el comando
    // se queda esperando para siempre un proceso que nunca existió.
    hijo.on("error", (error) => {
      console.error(`\n  No pude lanzar ssh: ${error.message}\n`);
      listo(1);
    });
    hijo.on("close", (codigo) => listo(codigo ?? 1));
  });
}

function correrCallado(
  invocacion: Invocacion,
): Promise<{ codigo: number | null; error: string }> {
  return new Promise((listo) => {
    const hijo = spawn(invocacion.programa, [...invocacion.argumentos], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let error = "";
    hijo.stderr?.on("data", (trozo: Buffer) => {
      error += trozo.toString();
    });
    hijo.on("error", (fallo) => listo({ codigo: null, error: fallo.message }));
    hijo.on("close", (codigo) => listo({ codigo, error }));
  });
}

await main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
