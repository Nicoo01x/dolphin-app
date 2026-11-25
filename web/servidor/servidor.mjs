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
import { LARGO_MINIMO_DEL_SECRETO } from "./sesion.mjs";

const env = process.env;
const puerto = Number(env.DOLPHIN_API_PUERTO || 18800);
const datos = env.DOLPHIN_API_DATOS || join(process.cwd(), ".datos-api");
mkdirSync(datos, { recursive: true });

// Un secreto corto se saca por fuerza bruta con una sola cookie en la mano: así, el panel no abre.
const secretoValido = (env.DOLPHIN_ADMIN_SECRETO ?? "").length >= LARGO_MINIMO_DEL_SECRETO;
if (!env.DOLPHIN_ADMIN_CLAVE || !secretoValido) {
  console.warn(`[api] sin DOLPHIN_ADMIN_CLAVE o con DOLPHIN_ADMIN_SECRETO de menos de ${LARGO_MINIMO_DEL_SECRETO} caracteres: el panel no deja entrar a nadie`);
}

const base = abrirBase(join(datos, "panel.db"));
const avisador = crearAvisador();
const manejar = crearApp({
  base,
  datos,
  claveAdmin: env.DOLPHIN_ADMIN_CLAVE,
  secreto: secretoValido ? env.DOLPHIN_ADMIN_SECRETO : undefined,
  descargas: crearFuenteDeDescargas(),
  avisador,
  cookieSegura: env.DOLPHIN_API_INSEGURO !== "1",
  estatico: env.DOLPHIN_API_ESTATICO || null,
});

// Los adjuntos de más de 90 días se borran al arrancar y una vez por día.
const limpiar = () => {
  try {
    const n = manejar.limpiarAdjuntosViejos();
    if (n > 0) console.log(`[api] borrados los adjuntos de ${n} reportes viejos`);
  } catch (error) {
    console.error(`[api] no se pudieron limpiar los adjuntos viejos: ${error.message}`);
  }
};
limpiar();
setInterval(limpiar, 24 * 60 * 60 * 1000).unref();

const servidor = createServer(manejar);
// Una subida lenta no puede tener un hueco abierto para siempre.
servidor.headersTimeout = 20_000;
servidor.requestTimeout = 120_000;
servidor.listen(puerto, "127.0.0.1", () => {
  console.log(`[api] escuchando en 127.0.0.1:${puerto} · datos en ${datos} · Telegram ${avisador.prendido ? "prendido" : "apagado"}`);
});

const cerrar = () => servidor.close(() => (base.cerrar(), process.exit(0)));
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
