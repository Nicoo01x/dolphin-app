// La consola (ui/) se instala y se construye sola: sin esto, `npm install && npm run demo` en un
// clon nuevo abría una consola que decía «no está construida», y `npm run ui:build` fallaba porque
// nadie había instalado sus dependencias. Con --sin-cortar (el postinstall), si algo falla lo dice
// y sigue: el CLI anda igual sin la consola.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = join(dirname(fileURLToPath(import.meta.url)), "..", "ui");
const sinCortar = process.argv.includes("--sin-cortar");

// El paquete publicado trae la consola ya construida, y ahí no hay con qué
// construirla: las dependencias de la consola son de desarrollo. Sin esta
// salida, `npx dolphin` arrancaba intentando un `npm install` que no tenía
// por qué funcionar. Solo al instalar (`--sin-cortar`): `npm run ui:build`
// construye siempre, que para eso se lo pide.
if (sinCortar && existsSync(join(ui, "dist", "index.html"))) {
  process.exit(0);
}

function npm(...args) {
  // Con el mismo npm que corrió el script: en Windows, `npm` a secas es un .cmd que spawn no encuentra.
  const r = process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: ui, stdio: "inherit" })
    : spawnSync("npm", args, { cwd: ui, stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

const lista = (existsSync(join(ui, "node_modules")) || npm("install", "--no-audit", "--no-fund")) && npm("run", "build");
if (!lista) {
  console.error("\n  dolphin · la consola no se pudo construir. El CLI anda igual; para la consola, corré npm run ui:build.\n");
  process.exit(sinCortar ? 0 : 1);
}
