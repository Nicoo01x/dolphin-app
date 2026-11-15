// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { comprobar, grabar } from "./paridad.js";

/**
 * dolphin paridad grabar --url http://localhost:3000 --ruta / --ruta /api/pedidos [--ignorar fecha,id] [--nombre app]
 * dolphin paridad comprobar --grabacion <archivo> [--levantar "npm start -- --port {PUERTO}"] [--url http://127.0.0.1:{PUERTO}/]
 *
 * Grabar le pregunta a la app vieja; comprobar levanta la nueva (en la carpeta donde estás) y sale en
 * 0 solo si contesta igual. Con eso, una migración se persigue hasta lograrla:
 *   /objetivo pasar el backend de Express a Fastify --oraculo dolphin paridad comprobar --grabacion … --levantar …
 */

const [accion] = process.argv.slice(2);
process.argv.splice(2, 1);
const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    url: { type: "string", default: "" },
    ruta: { type: "string", multiple: true, default: [] },
    ignorar: { type: "string", default: "" },
    nombre: { type: "string", default: "app" },
    grabacion: { type: "string", default: "" },
    levantar: { type: "string", default: "" },
    espera: { type: "string", default: "" },
  },
});

const ayuda = `
  dolphin paridad · migrar y probar que la app nueva contesta igual que la vieja

  dolphin paridad grabar --url http://localhost:3000 --ruta / --ruta /api/pedidos --ignorar fecha,id
  dolphin paridad comprobar --grabacion .dolphin/paridad/app.json --levantar "npm start -- --port {PUERTO}"
`;

if (accion === "grabar") {
  const rutas = values.ruta ?? [];
  if (!values.url || rutas.length === 0) {
    console.error(ayuda);
    process.exit(1);
  }
  const repo = resolve(values.repo ?? process.cwd());
  const ignorar = (values.ignorar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const { archivo, grabacion } = await grabar(repo, { url: values.url, rutas, ignorar, nombre: values.nombre ?? "app" });
  console.log(`\n  Grabé ${Object.keys(grabacion.rutas).length} ruta(s) de ${values.url} en ${archivo}`);
  console.log(`\n  Para migrar hasta que conteste igual:\n  /objetivo <la migración> --oraculo dolphin paridad comprobar --grabacion "${archivo}" --levantar "<cómo se levanta, con {PUERTO}>"\n`);
} else if (accion === "comprobar") {
  if (!values.grabacion || (!values.levantar && !values.url)) {
    console.error(ayuda);
    process.exit(1);
  }
  const { diferencias, total } = await comprobar({
    grabacion: resolve(values.grabacion),
    cwd: process.cwd(),
    ...(values.levantar ? { levantar: values.levantar } : {}),
    url: values.url || "http://127.0.0.1:{PUERTO}/",
    ...(values.espera ? { esperaMs: Number(values.espera) * 1000 } : {}),
  });
  if (diferencias.length === 0) {
    console.log(`paridad: las ${total} ruta(s) contestan igual que antes`);
    process.exit(0);
  }
  for (const d of diferencias) console.log(`${d.ruta}: ${d.que}`);
  console.log(`paridad: ${diferencias.length} de ${total} ruta(s) contestan distinto`);
  process.exit(1);
} else {
  console.error(ayuda);
  process.exit(1);
}
