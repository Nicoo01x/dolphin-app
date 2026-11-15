#!/usr/bin/env node
// Publica la web en el VPS: construye, sube `out/` en un tar y la cambia de una.
//
// Por qué un script y no los comandos a mano: la primera vez se hacen bien, la segunda alguien se
// olvida de `DOLPHIN_SITIO` y el sitio sale sin canonical, o copia archivo por archivo y deja una
// versión a medias servida mientras tanto. Acá el cambio es un `mv`: nadie ve el sitio partido.
//
//   node scripts/publicar.mjs [--host openclaw] [--sitio https://odolphin.tech] [--sin-build] [--prueba]
//
// `--prueba` es el ensayo: construye con el dominio de verdad, pasa el portón, arma el tar y dice
// cuánto pesa, sin subir nada.
//
// El host es un alias de ~/.ssh/config, no una IP: la clave y el usuario ya están ahí.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

const args = process.argv.slice(2);
const valor = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const host = valor("host", "openclaw");
const sitio = valor("sitio", "https://odolphin.tech");
const sinBuild = args.includes("--sin-build");
/** Todo menos subir: construye con el dominio de verdad, pasa el portón y arma el tar. */
const prueba = args.includes("--prueba");

/** Donde vive la web en el VPS. Tiene que coincidir con el `root *` del Caddyfile. */
const DESTINO = "/var/www/odolphin";

/**
 * En Windows, el `tar` de Windows (bsdtar, en System32). El de Git Bash es GNU tar, que lee
 * `C:\…` como `host:ruta` de una máquina remota y se corta con «Cannot write: Broken pipe».
 */
const TAR = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";

const correr = (cmd, lista, opciones = {}) =>
  execFileSync(cmd, lista, { stdio: "inherit", windowsHide: true, ...opciones });

if (!sinBuild) {
  console.log(`\n  Construyendo con DOLPHIN_SITIO=${sitio}\n`);
  // El build incluye `revisar-export.mjs`, que es el portón: sin él un localhost se publica.
  // En Windows, Node 20+ no lanza un `.cmd` sin shell (EINVAL, el arreglo del CVE-2024-27980):
  // así este script nunca había podido correr desde Windows. Con `shell` los argumentos son fijos.
  correr(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["run", "build"], {
    cwd: raiz,
    env: { ...process.env, DOLPHIN_SITIO: sitio },
    shell: process.platform === "win32",
  });
}

const carpeta = mkdtempSync(join(tmpdir(), "dolphin-web-"));
const tar = join(carpeta, "web.tgz");
try {
  console.log("\n  Empaquetando out/\n");
  correr(TAR, ["czf", tar, "-C", join(raiz, "out"), "."]);

  if (prueba) {
    const mb = (statSync(tar).size / 1024 / 1024).toFixed(1);
    const lista = execFileSync(TAR, ["tzf", tar], { encoding: "utf8" })
      .split("\n")
      .filter((l) => l && !l.endsWith("/"));
    console.log(`  Ensayo: ${lista.length} archivos, ${mb} MB. No se subió nada (--prueba).\n`);
    process.exit(0);
  }

  console.log(`  Subiendo a ${host}\n`);
  correr("scp", ["-o", "ConnectTimeout=20", tar, `${host}:/tmp/dolphin-web.tgz`]);

  // Se extrae al lado y se cambia con un `mv`: el sitio nunca queda a medias, y la versión
  // anterior queda en `.viejo` por si hay que volver en un segundo.
  const remoto = [
    "set -e",
    `rm -rf ${DESTINO}.nuevo && mkdir -p ${DESTINO}.nuevo`,
    `tar xzf /tmp/dolphin-web.tgz -C ${DESTINO}.nuevo`,
    `rm -rf ${DESTINO}.viejo`,
    `[ -d ${DESTINO} ] && mv ${DESTINO} ${DESTINO}.viejo || true`,
    `mv ${DESTINO}.nuevo ${DESTINO}`,
    `chmod -R a+rX ${DESTINO}`,
    "rm -f /tmp/dolphin-web.tgz",
    `find ${DESTINO} -type f | wc -l`,
  ].join("\n");
  console.log(`  Cambiando ${DESTINO}\n`);
  correr("ssh", ["-o", "ConnectTimeout=20", host, remoto]);

  console.log(`\n  Listo. ${sitio}\n`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
