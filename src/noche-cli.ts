// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { motorDe } from "./nucleo/router.js";
import { correrNoche, horaDeDespertar, issuesParaLaNoche, pendientesDeIssues, pendientesDeLaNoche, type IssueDeLaNoche } from "./noche.js";
import { escribirParteDeLaManana, textoDelParte } from "./manana.js";
import { crearAvisador, emisoresDelEntorno } from "./nucleo/avisos.js";
import { preguntarAGh } from "./nucleo/vista-git.js";

/**
 * dolphin noche [--hasta 07:00] [--tarea "…"]… [--agente claude] [--verificar typecheck,test]
 *
 * El turno de noche: lo que marcaste «para esta noche» en la bandeja y lo que pases con --tarea, de a
 * una, cada una en su rama con el portón, hasta la hora en que te despertás. Si se acaba el cupo de
 * todas tus cuentas, espera la ventana siguiente y sigue. Corre sin pedir permisos (no hay nadie
 * mirando), con la política encima: no deploya ni toca migraciones.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    hasta: { type: "string", default: "07:00" },
    tarea: { type: "string", multiple: true, default: [] },
    agente: { type: "string", default: "claude" },
    verificar: { type: "string", default: "" },
    issues: { type: "string", default: "" },
    demo: { type: "boolean", default: false },
  },
});

const repo = resolve(values.repo ?? process.cwd());
const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}
const hasta = horaDeDespertar(values.hasta ?? "07:00", new Date());
if (!hasta) {
  console.error(`\n  No entendí la hora «${values.hasta}»: usá --hasta 07:00.\n`);
  process.exit(1);
}
let pendientes = await pendientesDeLaNoche(repo, values.tarea ?? []);
let issuePropios: readonly IssueDeLaNoche[] = [];
if (values.issues) {
  if (values.issues !== "dolphin") {
    console.error(`\n  --issues por ahora acepta «dolphin».\n`);
    process.exit(1);
  }
  const resultado = await issuesParaLaNoche(repo, values.issues);
  if (!resultado.disponible) {
    console.error(`\n  No pude leer los issues: ${resultado.porQue}\n`);
    process.exit(1);
  }
  issuePropios = resultado.propios;
  pendientes = [...pendientesDeIssues(resultado.propios), ...pendientes];
  if (resultado.ajenos.length > 0) console.log(`  ${resultado.ajenos.length} issue${resultado.ajenos.length === 1 ? "" : "s"} ajeno${resultado.ajenos.length === 1 ? "" : "s"} quedó${resultado.ajenos.length === 1 ? "" : "aron"} en la Bandeja, sin correr.\n`);
}
if (pendientes.length === 0) {
  console.error(`
  dolphin noche · tus pendientes, hechos mientras dormís

  No hay nada para esta noche. Marcá ideas o errores «para esta noche» en la bandeja de la consola,
  o pasalas acá:

  dolphin noche --tarea "que el carrito acepte cupones" --tarea "exportar pedidos a CSV" --hasta 07:00
`);
  process.exit(1);
}
soltarEnlacesAlCortar();

const agente = values.demo ? "mentira" : motorDe(values.agente, "claude");
const verificar = (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const hora = `${String(hasta.getHours()).padStart(2, "0")}:${String(hasta.getMinutes()).padStart(2, "0")}`;
console.log(`\n  dolphin noche · ${pendientes.length} tarea${pendientes.length === 1 ? "" : "s"} hasta las ${hora}. Dejalo andar y andá a dormir.\n`);

const noche = await correrNoche(
  { repo, agente, hasta, pendientes, ...(verificar.length ? { verificar } : {}) },
  {
    contar: (texto) => console.log(`  ${texto}`),
    ...(issuePropios.length > 0 ? {
      issueAbierto: async (numero: number) => {
        const salida = await preguntarAGh(repo, ["issue", "view", String(numero), "--json", "state"]);
        return (JSON.parse(salida) as { state?: string }).state === "OPEN";
      },
    } : {}),
  },
);

const listas = noche.tareas.filter((t) => t.estado === "lista").length;
const gastado = noche.tareas.reduce((s, t) => s + t.gastado, 0);
console.log(`\n  ${listas} de ${noche.tareas.length} quedaron listas para revisar${gastado > 0 ? ` · US$ ${gastado.toFixed(2)}` : ""}.`);
// El parte de la mañana: la página con una tarjeta por tarea, y el aviso (Windows, y Telegram si está).
const pagina = await escribirParteDeLaManana(noche).catch(() => "");
await crearAvisador(emisoresDelEntorno()).avisar({ tipo: "termino", titulo: `Buen día: ${listas} de ${noche.tareas.length} listas`, texto: textoDelParte(noche), clave: `noche:${noche.id}` });
console.log(`  El parte: ${pagina || `.dolphin/noches/${noche.id}.json`}`);
console.log("  Decidí cada una desde la terminal o Telegram: /aprobar 1, /descartar 2.\n");
