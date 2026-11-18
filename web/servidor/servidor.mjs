#!/usr/bin/env node
// El servicio de odolphin.tech/api: reportes de crash, contadores de la web y el panel de admin.
//
// En el VPS corre como `odolphin-api.service` (ver odolphin-api.service) detrás de Caddy, que le pasa
// /api/* a 127.0.0.1:18800. Todo lo de la máquina entra por variables de entorno:
//
//   DOLPHIN_API_PUERTO      18800
//   DOLPHIN_API_DATOS       /var/lib/odolphin-api (la base y los adjuntos)
//   DOLPHIN_ADMIN_CLAVE     hash de la contraseña del panel (node servidor/clave.mjs)
//   DOLPHIN_ADMIN_SECRETO   para firmar la sesión (cualquier texto largo al azar)
//   DOLPHIN_TELEGRAM_TOKEN  opcional: bot que avisa de cada crash nuevo
//   DOLPHIN_TELEGRAM_CHAT   opcional: a qué chat
//   GITHUB_TOKEN            opcional: sube el tope de la API de GitHub de 60 a 5000 pedidos por hora
//
// Para probar en local con la web: `DOLPHIN_API_ESTATICO=out DOLPHIN_API_INSEGURO=1 node servidor/servidor.mjs`
// (sirve también `out/` y la cookie sale sin Secure, porque es http).

import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { abrirBase } from "./base.mjs";
import { crearApp } from "./app.mjs";
import { crearFuenteDeDescargas } from "./descargas.mjs";
import { crearAvisador } from "./alertas.mjs";

const env = process.env;
const puerto = Number(env.DOLPHIN_API_PUERTO || 18800);
const datos = env.DOLPHIN_API_DATOS || join(process.cwd(), ".datos-api");
mkdirSync(datos, { recursive: true });

if (!env.DOLPHIN_ADMIN_CLAVE || !env.DOLPHIN_ADMIN_SECRETO) {
  console.warn("[api] sin DOLPHIN_ADMIN_CLAVE o DOLPHIN_ADMIN_SECRETO: el panel no deja entrar a nadie");
}

const base = abrirBase(join(datos, "panel.db"));
const avisador = crearAvisador();
const manejar = crearApp({
  base,
  datos,
  claveAdmin: env.DOLPHIN_ADMIN_CLAVE,
  secreto: env.DOLPHIN_ADMIN_SECRETO,
  descargas: crearFuenteDeDescargas(),
  avisador,
  cookieSegura: env.DOLPHIN_API_INSEGURO !== "1",
  estatico: env.DOLPHIN_API_ESTATICO || null,
});

const servidor = createServer(manejar);
servidor.requestTimeout = 120_000;
servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`[api] escuchando en 127.0.0.1:${puerto} · datos en ${datos} · Telegram ${avisador.prendido ? "prendido" : "apagado"}`);
});

const cerrar = () => servidor.close(() => (base.cerrar(), process.exit(0)));
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
