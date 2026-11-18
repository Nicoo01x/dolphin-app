#!/usr/bin/env node
// Arma public/og.png (1200×630): la tarjeta que se ve al compartir un link de odolphin.tech en X,
// WhatsApp, Slack o LinkedIn. Es la captura real del inicio de la app con el nombre al costado.
//
//   node scripts/imagen-para-compartir.mjs
//
// Se corre a mano cuando cambia la captura; el PNG queda commiteado (el build no lo regenera).

import sharp from "sharp";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const ANCHO = 1200;
const ALTO = 630;

const captura = await sharp(`${raiz}public/capturas/app-12-11/inicio.webp`)
  .resize(780)
  // A 780 de ancho la captura mide 504 de alto: se recorta la franja vacía de arriba.
  .extract({ left: 0, top: 30, width: 780, height: 470 })
  .composite([{ input: Buffer.from(`<svg width="780" height="470"><rect width="780" height="470" rx="18" ry="18"/></svg>`), blend: "dest-in" }])
  .png()
  .toBuffer();

const texto = Buffer.from(`
<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .t { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; fill: #f7f8f8; }
  </style>
  <text x="64" y="150" class="t" font-size="64" font-weight="700" letter-spacing="-1.5">Dolphin</text>
  <text x="64" y="232" class="t" font-size="34" font-weight="500" letter-spacing="-0.5">Tus agentes</text>
  <text x="64" y="276" class="t" font-size="34" font-weight="500" letter-spacing="-0.5">de código,</text>
  <text x="64" y="320" class="t" font-size="34" font-weight="500" letter-spacing="-0.5">en manada.</text>
  <text x="64" y="540" class="t" font-size="20" fill-opacity="0.6">Open source · Claude Code, Codex y más</text>
  <text x="64" y="572" class="t" font-size="20" fill-opacity="0.6">odolphin.tech</text>
</svg>`);

await sharp({ create: { width: ANCHO, height: ALTO, channels: 4, background: "#07090c" } })
  .composite([
    { input: captura, left: 380, top: 110 },
    { input: texto, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(`${raiz}public/og.png`);

console.log("public/og.png listo (1200×630)");
