import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarArchivo, resumirDescargas, crearFuenteDeDescargas } from "./descargas.mjs";
import { camposDelCrash } from "./reportes.mjs";
import { crearLimitador, agrupar } from "./limites.mjs";
import { textoDeAlerta, crearAvisador } from "./alertas.mjs";
import { normalizarVisita, origenDe } from "./visitas.mjs";

test("cada archivo de la Release cuenta por lo que es", () => {
  assert.deepEqual(clasificarArchivo("DolphinCode-Setup-1.7.0.exe"), { clase: "instalador", sistema: "windows" });
  assert.deepEqual(clasificarArchivo("DolphinCode-1.7.0-arm64.dmg"), { clase: "instalador", sistema: "macos" });
  assert.deepEqual(clasificarArchivo("DolphinCode-1.7.0-arm64-mac.zip"), { clase: "instalador", sistema: "macos" });
  assert.deepEqual(clasificarArchivo("DolphinCode-1.7.0.AppImage"), { clase: "instalador", sistema: "linux" });
  assert.deepEqual(clasificarArchivo("dolphin_1.7.0_amd64.deb"), { clase: "instalador", sistema: "linux" });
  assert.deepEqual(clasificarArchivo("latest.yml"), { clase: "chequeo", sistema: "windows" });
  assert.deepEqual(clasificarArchivo("latest-mac.yml"), { clase: "chequeo", sistema: "macos" });
  assert.deepEqual(clasificarArchivo("latest-linux.yml"), { clase: "chequeo", sistema: "linux" });
  assert.equal(clasificarArchivo("DolphinCode-Setup-1.7.0.exe.blockmap").clase, "actualizacion");
  assert.equal(clasificarArchivo("dolphind-template.tgz").clase, "otro");
});

test("el resumen suma por versión y en total, y deja afuera los borradores", () => {
  const r = resumirDescargas([
    { tag_name: "v1.6.2", published_at: "2026-11-16T00:00:00Z", assets: [
      { name: "DolphinCode-Setup-1.6.2.exe", download_count: 10 },
      { name: "latest.yml", download_count: 300 },
      { name: "DolphinCode-1.6.2.AppImage", download_count: 2 },
    ] },
    { tag_name: "v1.7.0", published_at: "2026-11-18T00:00:00Z", assets: [
      { name: "DolphinCode-Setup-1.7.0.exe", download_count: 4 },
      { name: "DolphinCode-Setup-1.7.0.exe.blockmap", download_count: 7 },
    ] },
    { tag_name: "v1.8.0", draft: true, assets: [{ name: "DolphinCode-Setup-1.8.0.exe", download_count: 99 }] },
  ]);
  assert.equal(r.versiones.length, 2);
  assert.equal(r.versiones[0].tag, "v1.7.0");
  assert.deepEqual(r.total.instaladores, { windows: 14, macos: 0, linux: 2 });
  assert.equal(r.total.chequeos.windows, 300);
  assert.equal(r.total.actualizaciones, 7);
});

test("la fuente de GitHub guarda en caché y, si GitHub falla después, muestra lo último que supo", async () => {
  let pedidos = 0;
  let t = 0;
  let falla = false;
  const fuente = crearFuenteDeDescargas({
    ahora: () => t,
    token: null,
    fetchImpl: async () => (pedidos++, falla ? { ok: false, status: 403 } : { ok: true, json: async () => [{ tag_name: "v1", published_at: "x", assets: [] }] }),
  });
  await fuente();
  await fuente();
  assert.equal(pedidos, 1);
  t = 11 * 60 * 1000;
  falla = true;
  const viejo = await fuente();
  assert.equal(viejo.viejo, true);
});

test("la firma de un crash no depende del offset ni de la hora, sí del motivo", () => {
  const base = "Process: gpu\nReason: crashed\nExit code: 5\nFaulting module: libGLESv2.dll+0x10\nCreated: a";
  const a = camposDelCrash(base);
  const b = camposDelCrash(base.replace("+0x10", "+0x99").replace("Created: a", "Created: b"));
  const c = camposDelCrash(base.replace("crashed", "oom"));
  assert.equal(a.firma, b.firma);
  assert.notEqual(a.firma, c.firma);
  assert.equal(a.titulo, "gpu · crashed · libGLESv2.dll");
});

test("el limitador corta pasado el máximo y vuelve a abrir con la ventana siguiente", () => {
  let t = 0;
  const permitir = crearLimitador({ maximo: 2, ventanaMs: 1000, ahora: () => t });
  assert.equal(permitir("ip"), true);
  assert.equal(permitir("ip"), true);
  assert.equal(permitir("ip"), false);
  assert.equal(permitir("otra"), true);
  t = 1000;
  assert.equal(permitir("ip"), true);
});

test("Telegram avisa sólo crashes nuevos o que volvieron, y sin token no sale nada", async () => {
  const llamadas = [];
  const avisador = crearAvisador({ token: "t", chat: "c", fetchImpl: async (u, o) => (llamadas.push(JSON.parse(o.body)), { ok: true }) });
  const reg = { tipo: "crash", firma: "abcdef0123456789", titulo: "renderer · crashed", version: "1.7.0", plataforma: "win32", sistema: "10" };
  assert.equal(await avisador.avisar(reg, { nueva: true, volvio: false }), true);
  assert.equal(await avisador.avisar(reg, { nueva: false, volvio: false }), false);
  assert.equal(await avisador.avisar({ ...reg, tipo: "feedback" }, { nueva: true }), false);
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].text, /^Dolphin · Crash nuevo\nv1\.7\.0 · Windows\nhttps:\/\/odolphin\.tech\/admin#crash-abcdef0123456789$/);
  assert.match(textoDeAlerta(reg, { volvio: true }), /Volvió un crash/);
  assert.equal(crearAvisador({ token: "", chat: "" }).prendido, false);
});

test("la alerta no lleva texto que mande cualquiera, y no pasa de 10 por hora", async () => {
  const malo = { tipo: "crash", firma: "0".repeat(16), titulo: "entrá a https://malo.com", version: "1.0.0\nhttps://malo.com", plataforma: "x" };
  assert.doesNotMatch(textoDeAlerta(malo, { nueva: true }), /malo\.com/);
  let enviados = 0;
  const avisador = crearAvisador({ token: "t", chat: "c", ahora: () => 0, fetchImpl: async () => (enviados++, { ok: true }) });
  for (let i = 0; i < 15; i++) await avisador.avisar({ ...malo, firma: String(i).padStart(16, "0") }, { nueva: true });
  assert.equal(enviados, 10);
});

test("una IPv6 cuenta por su /64 y una IPv4 tal cual", () => {
  assert.equal(agrupar("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(agrupar("2001:db8:1:2::9"), "2001:db8:1:2::/64");
  assert.equal(agrupar("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(agrupar("1.2.3.4"), "1.2.3.4");
});

test("un % suelto en utm_source no rompe la visita y un ref raro no inventa orígenes", () => {
  assert.deepEqual(normalizarVisita({ ruta: "/?utm_source=%", referente: "", agente: "Mozilla/5.0 Chrome" }), { ruta: "/", origen: "directo" });
  assert.equal(origenDe("https://<script>/"), "directo");
  assert.equal(origenDe("http://localhost:3000/"), "otro");
});
