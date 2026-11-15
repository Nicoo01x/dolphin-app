// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { citarShell, destinoValido } from "./nucleo/ssh.js";
import { comandoDeAdjuntar, idValido } from "./nucleo/turno-remoto.js";
import { maquinaParaVer } from "./nucleo/turnos-desprendidos.js";

/**
 * dolphin turno adjuntar <id> [--host <nombre>] [--repo <ruta>]
 *
 * Muestra el log de un turno que corre (o corrió) desprendido en un VPS, en vivo hasta que termine.
 * Cortarlo con Ctrl+C no corta el turno: allá sigue, que para eso corre desprendido. Sin --host va a
 * la máquina anotada al lanzarlo, o a la que firmó el calendario.
 */

const { values, positionals } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    host: { type: "string" },
  },
  allowPositionals: true,
});
const [accion, id] = positionals;
const repo = resolve(values.repo ?? process.cwd());

if (accion !== "adjuntar" || !id) {
  console.error("\n  Uso: dolphin turno adjuntar <id> [--host <nombre>] [--repo <ruta>]\n");
  process.exit(1);
}
if (!idValido(id)) {
  console.error(`\n  «${id}» no es el id de un turno.\n`);
  process.exit(1);
}
const adonde = await maquinaParaVer(repo, id, values.host);
if (!adonde.ok) {
  console.error(`\n  ${adonde.porQue}\n`);
  process.exit(1);
}
if (!destinoValido(adonde.maquina.destino)) {
  console.error(`\n  «${adonde.maquina.destino}» no es un destino de ssh.\n`);
  process.exit(1);
}

console.error(`  el turno ${id} en ${adonde.maquina.destino} (Ctrl+C deja de mirar; el turno sigue allá)\n`);
// Con terminal, -t: el Ctrl+C le llega al tail de allá en vez de dejarlo colgado.
const ssh = spawn(
  "ssh",
  ["-o", "BatchMode=yes", ...(process.stdin.isTTY ? ["-t"] : []), "--", adonde.maquina.destino, `sh -c ${citarShell(comandoDeAdjuntar(adonde.maquina, id))}`],
  { stdio: "inherit", windowsHide: true },
);
ssh.on("error", (error) => {
  console.error(`\n  no pude correr ssh: ${error.message}\n`);
  process.exit(1);
});
ssh.on("close", (codigo) => process.exit(codigo ?? 1));
