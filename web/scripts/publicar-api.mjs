#!/usr/bin/env node
// Publica el servicio de odolphin.tech/api (web/servidor) en el VPS y lo reinicia.
//
//   node scripts/publicar-api.mjs [--host openclaw]
//
// Sube los .mjs del servidor (sin los tests) y la unidad de systemd, los cambia de una con un `mv`
// (lo anterior queda en /opt/odolphin-api.viejo) y reinicia el servicio. La base vive aparte, en
// /var/lib/odolphin-api, y no se toca. Los secretos (/etc/odolphin-api.env) tampoco: si no existen,
// el script para y dice cómo crearlos.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const host = args.includes("--host") ? args[args.indexOf("--host") + 1] : "openclaw";
const TAR = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
const correr = (cmd, lista) => execFileSync(cmd, lista, { stdio: "inherit", windowsHide: true });

const carpeta = mkdtempSync(join(tmpdir(), "odolphin-api-"));
try {
  const paquete = join(carpeta, "api");
  for (const nombre of readdirSync(join(raiz, "servidor"))) {
    if (nombre.endsWith(".test.mjs")) continue;
    cpSync(join(raiz, "servidor", nombre), join(paquete, nombre));
  }
  const tar = join(carpeta, "api.tgz");
  correr(TAR, ["czf", tar, "-C", paquete, "."]);
  correr("scp", ["-o", "ConnectTimeout=20", tar, `${host}:/tmp/odolphin-api.tgz`]);

  const remoto = [
    "set -e",
    'test -f /etc/odolphin-api.env || { echo "Falta /etc/odolphin-api.env: armalo con node servidor/clave.mjs --nueva (ver web/DEPLOY.md)"; exit 3; }',
    "rm -rf /opt/odolphin-api.nuevo && mkdir -p /opt/odolphin-api.nuevo",
    "tar xzf /tmp/odolphin-api.tgz -C /opt/odolphin-api.nuevo && rm /tmp/odolphin-api.tgz",
    "chmod -R a+rX /opt/odolphin-api.nuevo",
    "cp /opt/odolphin-api.nuevo/odolphin-api.service /etc/systemd/system/odolphin-api.service",
    "rm -rf /opt/odolphin-api.viejo",
    "if [ -d /opt/odolphin-api ]; then mv /opt/odolphin-api /opt/odolphin-api.viejo; fi",
    "mv /opt/odolphin-api.nuevo /opt/odolphin-api",
    "systemctl daemon-reload",
    "systemctl enable odolphin-api >/dev/null 2>&1",
    "systemctl restart odolphin-api",
    "for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:18800/api/salud && echo && exit 0; sleep 1; done",
    "journalctl -u odolphin-api -n 30 --no-pager; exit 1",
  ].join("\n");
  correr("ssh", ["-o", "ConnectTimeout=20", host, remoto]);
  console.log(`\n  Servicio publicado en ${host}. Probalo: curl https://odolphin.tech/api/salud\n`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
