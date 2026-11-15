import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolverEjecutable } from "../src/agentes/ejecutar.js";

/**
 * npm run gif -- [--salida docs/demo.gif]
 *
 * El GIF del README, siempre al día: corre `npm run demo` sin abrir nada,
 * mira la siembra en vivo con un Chrome sin ventana que graba, y pasa el
 * video a GIF con ffmpeg (paleta propia, 12 cuadros por segundo). Graba
 * solo esa pestaña: nunca la pantalla de la máquina.
 */

const correr = promisify(execFile);
const salida = process.argv.includes("--salida") ? process.argv[process.argv.indexOf("--salida") + 1]! : join("docs", "demo.gif");
const ffmpeg = resolverEjecutable("ffmpeg");
if (!ffmpeg) throw new Error("hace falta ffmpeg en el PATH para armar el GIF");

const { chromium } = await import("playwright-core");
const carpeta = await mkdtemp(join(tmpdir(), "dolphin-gif-"));

// El demo, sin abrir el navegador de la persona: la URL sale por la consola.
const demo = spawn(process.execPath, ["--import", "tsx", join("scripts", "demo.ts")], {
  env: { ...process.env, DOLPHIN_SIN_ABRIR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let texto = "";
const url = await new Promise<string>((listo, falla) => {
  const reloj = setTimeout(() => falla(new Error("el demo no dijo su URL en 60 s")), 60_000);
  demo.stdout.on("data", (trozo: Buffer) => {
    texto += trozo.toString();
    const encontrada = /http:\/\/127\.0\.0\.1:\d+/.exec(texto)?.[0];
    if (encontrada) {
      clearTimeout(reloj);
      listo(encontrada);
    }
  });
});
const termino = new Promise<void>((listo) => {
  const mirar = () => (/pasaron todas las fases/.test(texto) ? listo() : setTimeout(mirar, 200));
  mirar();
});

const navegador = await chromium.launch({ channel: "chrome", headless: true });
try {
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 760 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: carpeta, size: { width: 1280, height: 760 } },
  });
  const pagina = await contexto.newPage();
  await pagina.goto(url, { waitUntil: "domcontentloaded" });
  // La siembra en vivo: la grilla de ramas por fases, celda por celda.
  await pagina.getByText("Mirarla en vivo").click({ timeout: 15_000 }).catch(() => {});
  await termino;
  await pagina.waitForTimeout(1500);
  // Y la cosecha: la rama que quedó, con su código. Es el final de la historia.
  await pagina.getByRole("button", { name: "Cosechas" }).click({ timeout: 5000 }).catch(() => {});
  await pagina.waitForTimeout(4000);
  await contexto.close();
} finally {
  await navegador.close();
  demo.kill();
}

const [video] = (await readdir(carpeta)).filter((a) => a.endsWith(".webm"));
if (!video) throw new Error("no quedó video");
await mkdir(join(salida, ".."), { recursive: true });
const paleta = join(carpeta, "paleta.png");
const filtro = "fps=12,scale=960:-1:flags=lanczos";
await correr(ffmpeg, ["-y", "-i", join(carpeta, video), "-vf", `${filtro},palettegen=stats_mode=diff`, paleta]);
await correr(ffmpeg, ["-y", "-i", join(carpeta, video), "-i", paleta, "-lavfi", `${filtro} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4`, salida]);
const peso = (await stat(salida)).size;
console.log(`\n  ${salida} · ${(peso / 1024 / 1024).toFixed(1).replace(".", ",")} MB\n`);
await rm(carpeta, { recursive: true, force: true });
