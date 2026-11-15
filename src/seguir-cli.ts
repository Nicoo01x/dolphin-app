// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { matarHijosYa } from "./agentes/ejecutar.js";
import { crearAvisador, emisoresDelEntorno } from "./nucleo/avisos.js";
import { leerConfig } from "./nucleo/config.js";
import { leerPolitica } from "./nucleo/politica.js";
import { gitValor } from "./nucleo/git.js";
import { puertoLibre } from "./nucleo/puertos.js";
import { seguir, sesionesDelRepo } from "./seguir.js";
import { levantarApp, type AppLevantada } from "./tester/levantar.js";
import { C, haceCuanto, pintar, tabla, titulo } from "./salida.js";

/**
 * dolphin seguir [--repo X] [--sesion ID | --lista] [--vueltas 8] [--sin-app]
 *
 * Toma tu última sesión de Claude Code en ese repo (o la que digas) y la sigue sola hasta que
 * termine: vuelta a vuelta, sin que tengas que escribirle «seguí». Al terminar te avisa por el
 * sistema y por Telegram (si están DOLPHIN_TELEGRAM_TOKEN y DOLPHIN_TELEGRAM_CHAT), con el link de
 * la app levantada si el repo dice cómo levantarla (la sección `pantalla` de dolphin.config.json).
 *
 * Gasta tu cupo: cada vuelta es un turno entero de Claude. Corre con la política de lo que corre
 * solo (sin push, sin deploy, sin ssh); los commits locales sí, que se deshacen.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    sesion: { type: "string" },
    lista: { type: "boolean", default: false },
    vueltas: { type: "string", default: "8" },
    "sin-app": { type: "boolean", default: false },
    respaldo: { type: "string", default: "codex" },
    esperar: { type: "boolean", default: false },
    "aviso-usd": { type: "string" },
    "aviso-corridas": { type: "string" },
    "tope-usd": { type: "string" },
    "tope-corridas": { type: "string" },
  },
  allowPositionals: true,
});

const repo = resolve(values.repo ?? process.cwd());
const sesiones = await sesionesDelRepo(repo);

if (values.lista) {
  console.log(titulo("Sesiones de Claude Code", repo));
  if (sesiones.length === 0) console.log(`  ${pintar("No encontré charlas tuyas de Claude Code en este repo.", C.suave)}\n`);
  else
    console.log(
      tabla(sesiones.slice(0, 15), [
        { titulo: "sesión", valor: (s) => pintar(s.id.slice(0, 8), C.violeta) },
        { titulo: "lo último que pediste", valor: (s) => s.ultimoPedido.replace(/\s+/g, " ") || pintar("(sin pedidos)", C.tenue), elastica: true },
        { titulo: "hace", valor: (s) => pintar(haceCuanto(s.modificada.toISOString()), C.tenue), derecha: true },
      ]) + `\n\n  ${pintar("dolphin seguir --sesion <sesión> para seguir una; sin --sesion, la primera.", C.tenue)}\n`,
    );
  process.exit(0);
}

const elegida = values.sesion ? sesiones.find((s) => s.id === values.sesion || s.id.startsWith(values.sesion!)) : sesiones[0];
if (!elegida) {
  console.error(values.sesion ? `\n  No hay una sesión «${values.sesion}» en ${repo}. Mirá las que hay con --lista.\n` : `\n  No encontré sesiones de Claude Code en ${repo}.\n`);
  process.exit(1);
}
const vueltas = Math.max(1, Math.min(30, Number.parseInt(values.vueltas ?? "8", 10) || 8));
const respaldo = values.respaldo === "ninguno" ? "ninguno" : "codex";
const base = await gitValor(["rev-parse", "HEAD"], repo).catch(() => "");

// Lo que corre solo no empuja ni deploya; commitear sí, que es local y se deshace.
const prohibidos = (await leerPolitica(repo)).comandosProhibidos.filter((p) => p !== "Bash(git commit:*)");
const pantalla = values["sin-app"] ? undefined : (await leerConfig(repo)).pantalla;
let app: AppLevantada | undefined;
const corte = new AbortController();
const salir = async () => {
  corte.abort();
  matarHijosYa();
  await app?.detener().catch(() => {});
  process.exit(130);
};
process.once("SIGINT", () => void salir());

console.log(`\n  dolphin sigue la sesión ${elegida.id.slice(0, 8)} de ${repo}`);
console.log(`  la última vez le pediste: ${elegida.ultimoPedido || "(sin pedidos)"}`);
console.log(`  hasta ${vueltas} vueltas · gasta tu cupo · Ctrl+C para cortar\n`);

const emisores = emisoresDelEntorno(process.env, repo);
await Promise.all(emisores.map((emisor) => emisor.retomar?.()));
const resultado = await seguir({
  repo,
  sesion: elegida.id,
  vueltas,
  prohibidos,
  respaldo,
  esperar: values.esperar ?? false,
  ...(values["aviso-usd"] ? { avisoUsd: Number(values["aviso-usd"]) } : {}),
  ...(values["aviso-corridas"] ? { avisoCorridas: Number(values["aviso-corridas"]) } : {}),
  ...(values["tope-usd"] ? { topeUsd: Number(values["tope-usd"]) } : {}),
  ...(values["tope-corridas"] ? { topeCorridas: Number(values["tope-corridas"]) } : {}),
  ...(base ? { base } : {}),
  avisar: crearAvisador(emisores),
  contar: (t) => console.log(`  · ${t}`),
  senal: corte.signal,
  ...(pantalla
    ? {
        levantar: async () => {
          app = await levantarApp({ comando: pantalla.levantar, url: pantalla.url, cwd: repo, puerto: await puertoLibre(), esperaMs: pantalla.espera ?? 30_000 });
          return app.url;
        },
      }
    : {}),
});

const como = { termino: "terminó", necesita: "te necesita", tope: "llegó al tope de vueltas", fallo: "se cortó", cortado: "lo cortaste" }[resultado.como];
console.log(`\n  ${como} después de ${resultado.vueltas} vuelta(s).`);
if (resultado.link) {
  console.log(`  la app queda levantada en ${resultado.link} · Ctrl+C para apagarla\n`);
} else {
  if (resultado.como === "termino" && !pantalla) console.log("  (sin link: sumá la sección «pantalla» a dolphin.config.json para que la levante)");
  process.exit(resultado.como === "termino" ? 0 : 1);
}
