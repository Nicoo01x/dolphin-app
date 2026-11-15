// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { masParecido, motivoDeBandera } from "./nucleo/banderas.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { motorDe } from "./nucleo/router.js";

/**
 * dolphin [--repo <ruta>] [--agente claude|mentira] [--verificar typecheck,test] [--dangerously-skip-permissions]
 * dolphin <comando> …   (sembrar, equipo, tablero, cola, ideas, recordar, mirar, ui…)
 *
 * Sin comando abre la app de terminal sobre el repo donde estás. Con un comando hace lo de siempre
 * (los mismos CLIs de `npm run`), así `dolphin sembrar --tarea …` anda desde cualquier carpeta.
 */

const COMANDOS: Record<string, string> = {
  sembrar: "./cli.js",
  equipo: "./equipo-cli.js",
  noche: "./noche-cli.js",
  comparar: "./comparar-cli.js",
  bug: "./bug-cli.js",
  paridad: "./paridad-cli.js",
  bitacora: "./bitacora-cli.js",
  doctor: "./doctor-cli.js",
  arranque: "./arranque-cli.js",
  motores: "./motores-cli.js",
  maquinas: "./maquinas-cli.js",
  "máquinas": "./maquinas-cli.js",
  fases: "./fases-cli.js",
  tablero: "./tablero-cli.js",
  cola: "./cola-cli.js",
  ideas: "./ideas-cli.js",
  recordar: "./recordar-cli.js",
  explorar: "./explorar-cli.js",
  vigilar: "./vigilar-cli.js",
  sonar: "./sonar-cli.js",
  guardian: "./guardian-cli.js",
  mirar: "./mirar.js",
  ui: "./ui-cli.js",
  bots: "./bots-cli.js",
  seguir: "./seguir-cli.js",
  preguntar: "./preguntar-cli.js",
  atajo: "./atajos-cli.js",
  pr: "./pr-cli.js",
  buzon: "./buzon-cli.js",
  mcp: "./mcp.js",
  git: "./git-cli.js",
  tarea: "./tarea-cli.js",
  tareas: "./tarea-cli.js",
  turno: "./turno-cli.js",
  volver: "./volver-cli.js",
  wrapped: "./wrapped-cli.js",
};

const OPCIONES = {
  repo: { type: "string", default: process.cwd() },
  agente: { type: "string", default: "claude" },
  verificar: { type: "string", default: "" },
  "dangerously-skip-permissions": { type: "boolean", default: false },
  demo: { type: "boolean", default: false },
  ayuda: { type: "boolean", short: "h", default: false },
  // Why además de «ayuda»: `--help` es lo primero que escribe cualquiera que acaba de instalar
  // algo, y sin declararlo parseArgs lo trataba como opción desconocida — la respuesta era un
  // stack de Node de doce líneas en lugar de la ayuda que ya estaba escrita acá abajo.
  help: { type: "boolean", default: false },
} as const;

const [primero] = process.argv.slice(2);
if (primero === "telegram") {
  process.argv.splice(2, 1);
  await porTelegram();
} else if (primero && COMANDOS[primero]) {
  // El CLI de cada comando lee process.argv: se le saca el nombre del comando y listo.
  process.argv.splice(2, 1);
  await import(COMANDOS[primero]!);
} else if (primero !== undefined && !primero.startsWith("-")) {
  // Hasta acá, un comando mal escrito abría la app ignorándolo: la persona pedía «dolphin sembra»
  // y le aparecía la pantalla de siempre, sin una palabra de que no se había entendido.
  await noConozco(primero);
} else {
  await abrir();
}

/**
 * dolphin telegram [--repo X] [--agente claude] [--dangerously-skip-permissions]
 * Dolphin escuchando por Telegram, sin la pantalla: lo que le escribís al bot es lo mismo que escribir
 * en la terminal. Necesita DOLPHIN_TELEGRAM_TOKEN (el bot) y DOLPHIN_TELEGRAM_CHAT (el único chat que
 * puede darle órdenes).
 */
async function porTelegram(): Promise<void> {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: process.cwd() },
      agente: { type: "string", default: "claude" },
      verificar: { type: "string", default: "" },
      "dangerously-skip-permissions": { type: "boolean", default: false },
      demo: { type: "boolean", default: false },
    },
  });
  const token = process.env.DOLPHIN_TELEGRAM_TOKEN;
  const chat = process.env.DOLPHIN_TELEGRAM_CHAT;
  if (!token || !chat) {
    console.error("\n  Falta DOLPHIN_TELEGRAM_TOKEN (el token del bot, de @BotFather) o DOLPHIN_TELEGRAM_CHAT (tu chat: el único que puede darle órdenes).\n");
    process.exit(1);
  }
  const repo = resolve(values.repo ?? process.cwd());
  if (!(await revisarRepo(repo)).sirve) {
    console.error(`\n  «${repo}» no es un repo de git: pasale --repo.\n`);
    process.exit(1);
  }
  const { Sesion } = await import("./tui/sesion.js");
  const { abrirCanalTelegram } = await import("./tui/canal-telegram.js");
  soltarEnlacesAlCortar();
  const sesion = new Sesion({
    repo,
    agente: values.demo ? "mentira" : motorDe(values.agente, "claude"),
    automatico: values["dangerously-skip-permissions"] ?? false,
    verificar: (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    guardarCharla: true,
  });
  await sesion.cargarHistoria();
  console.log(`\n  dolphin escucha por Telegram sobre ${repo}. Ctrl+C para cortar.\n`);
  await abrirCanalTelegram({ token, chat, sesion, contar: (t) => console.log(`  ${t}`) }).correr();
}

/** El comando que no existe, dicho en una línea, con la sugerencia si la hay. */
async function noConozco(comando: string): Promise<never> {
  const { existsSync } = await import("node:fs");
  const parecido = masParecido(comando, [...Object.keys(COMANDOS), "telegram"]);
  const linea = existsSync(comando)
    ? `«${comando}» es una carpeta, no un comando. Para abrir otro repo: dolphin --repo "${comando}"`
    : parecido
      ? `No conozco el comando «${comando}». ¿Quisiste decir «${parecido}»?`
      : `No conozco el comando «${comando}».`;
  console.error(`\n  ${linea}\n  Los que hay están todos en: dolphin --ayuda\n`);
  process.exit(1);
}

async function abrir(): Promise<void> {
  let values: Record<string, unknown>;
  try {
    ({ values } = parseArgs({ options: OPCIONES, allowPositionals: true }));
  } catch (error) {
    console.error(
      `\n  ${motivoDeBandera(error, Object.keys(OPCIONES))}\n  Las que hay están todas en: dolphin --ayuda\n`
    );
    process.exit(1);
  }

  if (values.ayuda || values.help) {
    console.log(`
  dolphin · le pedís algo y te entrega una rama ya probada

  dolphin                                abre la app sobre el repo donde estás
  dolphin --ayuda  (o --help, o -h)      esto
  dolphin --repo "D:/mi-proyecto"        sobre otro repo
  dolphin --dangerously-skip-permissions el agente no pide permisos (el portón y la política siguen)
  dolphin --demo                         con el agente de mentira: se ve todo y no gasta nada
  dolphin --agente claude|codex|antigravity|gemini|opencode|…   (dolphin motores los lista)
  dolphin --verificar typecheck,test     el portón (por defecto: typecheck, lint y test si existen)

  dolphin fases                          qué comprueba el portón de este repo, y de dónde sale cada fase
  dolphin tarea                          el tablero: lo que hay que hacer, en cinco columnas
  dolphin volver                         los momentos en que el proyecto andaba, para volver a uno
  dolphin wrapped                        cuántas veces le corregiste lo mismo a tu agente este mes
  dolphin maquinas                       tus otras computadoras: cuál contesta, el túnel, y largar trabajo allá

  dolphin sembrar | equipo | buzon | mcp | tablero | cola | ideas | recordar | mirar | ui …   los comandos de siempre
`);
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("\n  dolphin necesita una terminal interactiva. Para un log, usá dolphin sembrar … o dolphin equipo ….\n");
    process.exit(1);
  }

  const repo = resolve((values.repo as string | undefined) ?? process.cwd());
  // Fuera de un repo abre igual: muestra tus proyectos para elegir uno (o /abrir <ruta>).
  const sinRepo = !(await revisarRepo(repo)).sirve;

  // La app se carga recién acá: los comandos de arriba no pagan su arranque.
  const { abrirApp } = await import("./tui/app.js");
  // Un corte de verdad (la terminal se cierra, SIGTERM) no deja worktrees enlazados ni agentes vivos.
  soltarEnlacesAlCortar();
  const como = await abrirApp({
    repo,
    agente: values.demo ? "mentira" : motorDe(values.agente as string | undefined, "claude"),
    automatico: (values["dangerously-skip-permissions"] as boolean | undefined) ?? false,
    sinRepo,
    verificar: ((values.verificar as string | undefined) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (como === "cortar") {
    // Corta lo que corría con la misma limpieza que un Ctrl+C de cualquier comando.
    console.log("\n  Corté lo que estaba corriendo. Los worktrees quedan limpios.\n");
    process.emit("SIGINT");
    return;
  }
  console.log("\n  Hasta luego. Lo que hiciste quedó en .dolphin/ (lo ve también la app de escritorio).\n");
  process.exit(0);
}
