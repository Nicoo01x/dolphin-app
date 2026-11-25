// Los reportes llegan como los arma la app (feedback-request.ts): JSON sin adjuntos, multipart con el
// bundle de diagnóstico y las imágenes. Se prueba de punta a punta por HTTP, con la base en memoria.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { abrirBase } from "./base.mjs";
import { crearApp } from "./app.mjs";
import { hashDeClave } from "./sesion.mjs";

const CLAVE = "una-clave-de-prueba";
let servidor, url, datos, base;
const avisos = [];

const CRASH = (motivo = "crashed", modulo = "node.dll+0x1a2b") =>
  [
    "[Crash Report]",
    "",
    "Report ID: 123",
    "Created: 2026-11-18T05:00:00.000Z",
    "Status: pending",
    "Source: render-process-gone",
    "Process: renderer",
    `Reason: ${motivo}`,
    "Exit code: -1073741819",
    "App version: 1.7.0",
    "Platform: win32 10.0.26200 x64",
    `Faulting module: ${modulo}`,
  ].join("\n");

const cuerpoJson = (extra = {}) => ({
  feedback: CRASH(),
  submissionType: "crash",
  githubLogin: null,
  githubEmail: null,
  appVersion: "1.7.0",
  platform: "win32",
  osRelease: "10.0.26200",
  arch: "x64",
  ...extra,
});

before(async () => {
  datos = mkdtempSync(join(tmpdir(), "odolphin-api-"));
  base = abrirBase(":memory:");
  const app = crearApp({
    base,
    datos,
    claveAdmin: hashDeClave(CLAVE),
    secreto: "secreto-de-prueba",
    cookieSegura: false,
    descargas: async () => ({ total: { instaladores: { windows: 3, macos: 1, linux: 2 } }, versiones: [] }),
    avisador: { avisar: async (registro, estado) => (avisos.push({ registro, estado }), true) },
    log: { info() {}, error() {} },
  });
  servidor = createServer(app);
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
  base.cerrar();
  rmSync(datos, { recursive: true, force: true });
});

const post = (ruta, cuerpo, cabeceras = {}) =>
  fetch(url + ruta, { method: "POST", headers: { "content-type": "application/json", ...cabeceras }, body: JSON.stringify(cuerpo) });

async function entrar() {
  const r = await post("/api/admin/entrar", { clave: CLAVE });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}

test("un crash en JSON llega, se agrupa por firma y avisa sólo la primera vez", async () => {
  const r1 = await post("/api/reportes", cuerpoJson());
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.equal(j1.ok, true);
  assert.equal(j1.imagesDelivered, true);
  // El mismo crash en otro build: otro offset dentro del módulo, misma firma.
  const r2 = await post("/api/reportes", cuerpoJson({ feedback: CRASH("crashed", "node.dll+0xffff") }));
  assert.equal(r2.status, 200);
  const crashes = avisos.filter((a) => a.registro.tipo === "crash");
  assert.equal(crashes.length, 2);
  assert.equal(crashes[0].estado.nueva, true);
  assert.equal(crashes[1].estado.nueva, false);
  assert.equal(crashes[0].registro.firma, crashes[1].registro.firma);
  assert.match(crashes[0].registro.titulo, /renderer · crashed · node\.dll/);
});

test("un reporte con bundle de diagnóstico e imagen llega en multipart y se puede bajar desde el panel", async () => {
  const form = new FormData();
  form.append("feedback", "La app se colgó al abrir Delfines");
  form.append("submissionType", "feedback");
  form.append("appVersion", "1.7.0");
  form.append("platform", "darwin");
  form.append("osRelease", "24.1.0");
  form.append("arch", "arm64");
  form.append("diagnosticBundleSubmissionId", "abc");
  form.append("diagnosticBundleFile", new Blob(['{"span":"uno"}\n'], { type: "application/x-ndjson" }), "dolphin-diagnostics-abc.ndjson");
  form.append("feedbackImage", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "feedback-image-1.png");
  const r = await fetch(`${url}/api/reportes`, { method: "POST", body: form });
  assert.equal(r.status, 200);
  const { id } = await r.json();

  const cookie = await entrar();
  const comentarios = await (await fetch(`${url}/api/admin/comentarios`, { headers: { cookie } })).json();
  const c = comentarios.comentarios.find((x) => x.id === id);
  assert.equal(c.texto, "La app se colgó al abrir Delfines");
  assert.equal(c.plataforma, "darwin");
  assert.equal(c.imagenes, 1);

  const detalle = await (await fetch(`${url}/api/admin/reportes/${id}`, { headers: { cookie } })).json();
  assert.deepEqual(detalle.reporte.imagenes, ["imagen-0.png"]);
  const diag = await fetch(`${url}/api/admin/reportes/${id}/diagnostico`, { headers: { cookie } });
  assert.equal(diag.status, 200);
  assert.equal(gunzipSync(Buffer.from(await diag.arrayBuffer())).toString(), '{"span":"uno"}\n');
  const img = await fetch(`${url}/api/admin/reportes/${id}/imagen-0.png`, { headers: { cookie } });
  assert.equal(img.headers.get("content-type"), "image/png");
});

test("lo que no es un reporte se rechaza con un 400 y no se guarda", async () => {
  assert.equal((await post("/api/reportes", { submissionType: "crash" })).status, 400);
  const r = await fetch(`${url}/api/reportes`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hola" });
  assert.equal(r.status, 400);
});

test("el panel no deja entrar sin la contraseña ni leer sin sesión", async () => {
  assert.equal((await fetch(`${url}/api/admin/resumen`)).status, 401);
  assert.deepEqual(await (await fetch(`${url}/api/admin/sesion`)).json(), { ok: true, sesion: false });
  const cookie = await entrar();
  assert.deepEqual(await (await fetch(`${url}/api/admin/sesion`, { headers: { cookie } })).json(), { ok: true, sesion: true });
  assert.equal((await post("/api/admin/entrar", { clave: "otra" })).status, 401);
  assert.equal((await fetch(`${url}/api/admin/resumen`, { headers: { cookie: "dolphin_admin=9999999999999.falsa" } })).status, 401);
  assert.equal((await post("/api/admin/entrar", { clave: CLAVE }, { origin: "https://otro.com" })).status, 403);
});

test("resolver un crash lo saca de los abiertos y si vuelve, avisa de nuevo", async () => {
  const cookie = await entrar();
  const { firmas } = await (await fetch(`${url}/api/admin/crashes`, { headers: { cookie } })).json();
  const firma = firmas[0].firma;
  assert.equal(firmas[0].veces, 2);
  const antes = (await (await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).json()).firmasAbiertas;
  const r = await post(`/api/admin/crashes/${firma}/resolver`, { version: "1.7.1" }, { cookie });
  assert.equal(r.status, 200);
  const resumen = await (await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).json();
  assert.equal(resumen.firmasAbiertas, antes - 1);
  assert.equal(resumen.crashesSinVer, 0);

  avisos.length = 0;
  await post("/api/reportes", cuerpoJson());
  assert.equal(avisos[0].estado.volvio, true);
  const despues = await (await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).json();
  assert.equal(despues.firmasAbiertas, antes);
});

test("las visitas se cuentan sin bots, sin el panel y con el origen de utm_source", async () => {
  const visita = (ruta, ref, agente = "Mozilla/5.0 (Windows NT 10.0) Chrome/130") =>
    fetch(`${url}/api/visita`, { method: "POST", headers: { "user-agent": agente }, body: JSON.stringify({ ruta, ref }) });
  assert.equal((await visita("/preguntas", "https://www.google.com/search?q=dolphin")).status, 204);
  await visita("/preguntas/", "https://www.google.com/");
  await visita("/?utm_source=chatgpt.com", "");
  await visita("/admin", "");
  await visita("/", "", "Googlebot/2.1");
  await fetch(`${url}/api/descarga`, { method: "POST", body: JSON.stringify({ sistema: "windows" }) });
  await fetch(`${url}/api/descarga`, { method: "POST", body: JSON.stringify({ sistema: "solaris" }) });

  const cookie = await entrar();
  const v = await (await fetch(`${url}/api/admin/visitas?dias=7`, { headers: { cookie } })).json();
  assert.deepEqual(v.porRuta, [{ ruta: "/preguntas", n: 2 }, { ruta: "/", n: 1 }]);
  assert.deepEqual(
    v.porOrigen.map((o) => o.origen).sort(),
    ["chatgpt.com", "google.com"],
  );
  const d = await (await fetch(`${url}/api/admin/descargas`, { headers: { cookie } })).json();
  assert.equal(d.clics.length, 1);
  assert.equal(d.clics[0].sistema, "windows");
  assert.equal(d.github.total.instaladores.windows, 3);
});

test("un reporte de más de 8 MB se corta con 413 sin leerlo", async () => {
  const grande = Buffer.alloc(9 * 1024 * 1024, 97);
  const r = await fetch(`${url}/api/reportes`, { method: "POST", headers: { "content-type": "application/json" }, body: grande });
  assert.equal(r.status, 413);
});

test("más de 4 imágenes en un comentario se rechazan", async () => {
  const form = new FormData();
  form.append("feedback", "muchas imágenes");
  form.append("submissionType", "feedback");
  for (let i = 0; i < 5; i++) form.append("feedbackImage", new Blob([new Uint8Array([1])], { type: "image/png" }), `${i}.png`);
  assert.equal((await fetch(`${url}/api/reportes`, { method: "POST", body: form })).status, 400);
});

test("Salir invalida también las copias de la cookie", async () => {
  const cookie = await entrar();
  assert.equal((await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).status, 200);
  // Sin sesión, /salir no puede echar a nadie.
  await post("/api/admin/salir", {});
  assert.equal((await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).status, 200);
  await post("/api/admin/salir", {}, { cookie });
  assert.equal((await fetch(`${url}/api/admin/resumen`, { headers: { cookie } })).status, 401);
  const nueva = await entrar();
  assert.equal((await fetch(`${url}/api/admin/resumen`, { headers: { cookie: nueva } })).status, 200);
});
