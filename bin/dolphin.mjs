#!/usr/bin/env node
// El comando `dolphin`, por los dos caminos:
//
// - Desde el código (un clon, `npm link`): el núcleo es TypeScript y lo corre
//   tsx, sin paso de build.
// - Instalado (`npx dolphin`, `npm i -g dolphin`): corre `dist/`, que es JS
//   plano. Así el paquete publicado no instala una sola dependencia.
//
// El código primero: en un clon que además construyó `dist/`, lo que vale es
// lo que se está editando, no una compilación de ayer.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fuente = join(raiz, "src", "dolphin.ts");

if (existsSync(fuente)) {
  const { register } = await import("tsx/esm/api");
  register();
  await import(pathToFileURL(fuente).href);
} else {
  await import(pathToFileURL(join(raiz, "dist", "dolphin.js")).href);
}
