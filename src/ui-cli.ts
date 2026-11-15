// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { join, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { crearServidor } from "./servidor.js";
import { hogarDeDolphin } from "./nucleo/proyectos.js";
import { abrirTunel, destinoDelTunel } from "./nucleo/tunel.js";

/**
 * npm run ui -- --repo <ruta> [--puerto 4700] [--abrir] [--demo] [--tunel]
 *                [--tunel-nombre <nombre>] [--tunel-host <host>]
 *
 * Levanta la pantalla contra las cosechas de un repo y avisa su URL
 * («http://127.0.0.1:PUERTO») por la salida: el escritorio la lee de ahí. Con --demo, los bots
 * piensan con el motor de mentira: probar la pantalla no gasta cupo.
 *
 * Con `--tunel` además se abre al teléfono por una dirección pública de Cloudflare. Lo que
 * protege esa puerta es el pase, no el nombre del túnel: la dirección la puede abrir cualquiera
 * (ver nucleo/puerta.ts). Por eso lo que se imprime es el link CON el pase, para abrirlo una vez.
 *
 * Con `--tunel-nombre` y `--tunel-host` el túnel deja de ser el del azar y pasa a ser uno propio,
 * siempre en la misma dirección. Las dos van juntas o ninguna: con una sola falla en vez de caer
 * al azar en silencio, porque eso daría una dirección distinta a la que se pidió. Por defecto
 * salen de `DOLPHIN_TUNEL_NOMBRE` y `DOLPHIN_TUNEL_HOST`, así que quien lo configuró una vez
 * escribe `--tunel` y nada más.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    puerto: { type: "string", default: "" },
    abrir: { type: "boolean", default: false },
    demo: { type: "boolean", default: false },
    tunel: { type: "boolean", default: false },
    // Las dos juntas convierten el túnel al azar en uno propio. Por defecto salen del entorno, así
    // que quien ya lo configuró una vez escribe `--tunel` y nada más.
    "tunel-nombre": { type: "string", default: process.env.DOLPHIN_TUNEL_NOMBRE ?? "" },
    "tunel-host": { type: "string", default: process.env.DOLPHIN_TUNEL_HOST ?? "" },
  },
  allowPositionals: true,
});

// Absoluta desde acá: con «../mi-app», el enlace a node_modules de cada worktree apuntaba a la nada.
const repo = resolve(values.repo ?? process.cwd());
// Sin puerto (o con 0) lo elige el sistema al escuchar, y se avisa cuál tomó: el escritorio lo lee
// de esta salida. Elegir uno libre, soltarlo y volver a tomarlo dejaba un hueco para que otro se lo llevara.
const puerto = values.puerto ? Number.parseInt(values.puerto, 10) : 0;

if (values.demo) {
  // La demo no debe leer ni modificar la manada real de ~/.dolphin/bots, aunque el nombre de un
  // bot o una consulta intenten encontrar otro bot. La carpeta temporal vive solo durante este proceso.
  process.env.DOLPHIN_BOTS_DIR = await mkdtemp(join(tmpdir(), "dolphin-demo-bots-"));
}

// El pase de esta corrida. Se genera acá y no adentro del servidor porque con `--tunel` hay que
// imprimirlo: el link al teléfono es el único lugar donde el pase viaja a la vista.
const pase = randomBytes(16).toString("hex");
// El túnel se abre después de escuchar (necesita el puerto), así que el host se consulta.
let hostDelTunel: string | undefined;

// Con la lista de proyectos de la persona: la barra cambia de repo sin reiniciar nada.
const servidor = crearServidor({
  repo,
  proyectos: { hogar: hogarDeDolphin() },
  demo: values.demo ?? false,
  token: pase,
  hostDeAfuera: () => hostDelTunel,
});
if (values.demo) servidor.on("close", () => void rm(process.env.DOLPHIN_BOTS_DIR ?? "", { recursive: true, force: true }));

servidor.listen(puerto, "127.0.0.1", async () => {
  const tomado = (servidor.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${tomado}`;
  console.log(`\n  dolphin · pantalla de ${repo}`);
  console.log(`  ${url}\n`);
  if (values.abrir) abrir(url);

  if (values.tunel) {
    try {
      const destino = destinoDelTunel({
        nombre: values["tunel-nombre"],
        host: values["tunel-host"],
      });
      const tunel = await abrirTunel(tomado, { destino });
      hostDelTunel = tunel.host;
      // El pase va en el link porque es la única forma de entrar: la dirección sola muestra la
      // pantalla que lo pide. Al abrirlo, el servidor lo cambia por una cookie y lo saca de la URL.
      console.log(`  desde el teléfono:\n  ${tunel.url}/?pase=${pase}\n`);
      console.log("  Ese link ES la llave: quien lo tenga entra. El túnel se cierra al cortar esto.\n");
      const cerrar = () => void tunel.detener();
      servidor.on("close", cerrar);
      process.on("SIGINT", () => {
        cerrar();
        process.exit(0);
      });
    } catch (error) {
      console.error(`\n  No pude abrir el túnel: ${error instanceof Error ? error.message : error}\n`);
      console.error("  La consola sigue andando en esta máquina.\n");
    }
  }
});

function abrir(url: string): void {
  import("node:child_process").then(({ spawn }) => {
    const [cmd, args] =
      process.platform === "win32"
        ? ["cmd.exe", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  });
}
