import { watch } from "node:fs";
import { parseArgs } from "node:util";
import { crearVigia, importa, type Vuelta } from "./nucleo/vigia.js";
import { decirSalteadas } from "./nucleo/porton.js";
import { verificadoresDeNpm } from "./nucleo/verificadores.js";
import { verificadorDePantalla } from "./tester/pantalla.js";
import type { Universo } from "./nucleo/tipos.js";

/**
 * dolphin vigilar --repo <ruta> --url http://localhost:5173 [--superficies "/,/alta"]
 *                 [--verificar "typecheck,test"] [--personas pulgar,teclado] [--hasta-verde]
 *
 * Mientras escribís (vos o un agente), cada cambio vuelve a pasar por las
 * fases del repo y por la pantalla —las cinco personas, sobre la app
 * levantada— hasta que todo da verde. La app la levantás vos, con tu dev
 * server de siempre: el vigía solo mira.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    url: { type: "string", default: "" },
    superficies: { type: "string", default: "" },
    verificar: { type: "string", default: "" },
    personas: { type: "string", default: "" },
    "hasta-verde": { type: "boolean", default: false },
  },
});

const lista = (texto: string | undefined) =>
  (texto ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

if (!values.url) {
  console.error(`
  dolphin vigilar · cada cambio vuelve a pasar por las fases y por la pantalla, hasta que todo da verde

  npm run vigilar -- --repo "D:/mi-app" --url http://localhost:5173 --verificar "test"

  --repo         la carpeta a vigilar (por defecto, esta)
  --url          dónde está la app levantada (tu dev server)
  --superficies  qué pantallas mirar, separadas por coma: "/", "/alta", "#cuenta"
  --verificar    scripts de npm que corren antes de la pantalla
  --personas     cuáles de las cinco personas miran (por defecto, todas)
  --hasta-verde  terminar apenas todo pasa (sale con 2 si alguna fase no se pudo correr)
`);
  process.exit(1);
}

const repo = values.repo ?? process.cwd();
const base = values.url;
const superficies = lista(values.superficies);
const universo: Universo = { id: "vigia", rama: "", ruta: repo, nacido: Date.now() };

const verificadores = [
  ...verificadoresDeNpm(lista(values.verificar)),
  verificadorDePantalla({
    // «/alta» y «#cuenta» se resuelven contra la URL de la app.
    url: (_u, superficie) => (superficie ? new URL(superficie, base).href : base),
    personas: lista(values.personas),
    tolerancia: 0,
    topeDeSuperficies: Math.max(superficies.length, 1),
  }),
];

const hora = () => new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const segundos = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);

function contar(vuelta: Vuelta): void {
  for (const r of vuelta.resultados) {
    // Una fase que no corrió no se marca en verde: se dice por qué no corrió.
    const marca = r.salteada ? "–" : r.paso ? "✓" : "✗";
    console.log(`    ${marca} ${r.nombre.padEnd(9)} ${segundos(r.ms).padStart(7)}  ${r.paso && !r.salteada ? "" : r.detalle}`);
    // Lo que encontró la pantalla, entero: es lo que hay que ir a arreglar.
    if (!r.paso && r.evidencia) {
      for (const linea of r.evidencia.split("\n").slice(0, 14)) console.log(`        ${linea}`);
    }
  }
  const salteadas = vuelta.resultados.filter((r) => r.salteada).map((r) => r.nombre);
  if (!vuelta.verde) console.log("\n  esperando cambios…\n");
  else console.log(salteadas.length > 0 ? `\n  ✓ en verde lo que corrió; ${decirSalteadas(salteadas)}\n` : "\n  ✓ todo en verde\n");
}

const vigia = crearVigia({
  universo,
  verificadores,
  ...(superficies.length > 0 ? { contexto: { contrato: { superficies } } } : {}),
  alEmpezar: (n, por) => console.log(`  vuelta ${n} · ${hora()} · por ${por.slice(0, 3).join(", ")}${por.length > 3 ? ` y ${por.length - 3} más` : ""}`),
  alTerminar: contar,
});

console.log(`\n  vigilando ${repo}\n  app en ${base}${superficies.length > 0 ? ` · pantallas: ${superficies.join(", ")}` : ""}\n`);

const vigilante = watch(repo, { recursive: true }, (_evento, archivo) => {
  if (archivo && importa(String(archivo))) vigia.avisar(String(archivo));
});

const terminar = async (codigo: number) => {
  vigilante.close();
  await vigia.detener();
  process.exitCode = codigo;
};

process.on("SIGINT", () => void terminar(0));

if (values["hasta-verde"]) {
  // Con fases salteadas sale con 2: lo que corrió está en verde, pero no se probó todo, y un CI no puede leer eso como un 0.
  void vigia.hastaVerde().then((vuelta) => terminar(vuelta.resultados.some((r) => r.salteada) ? 2 : 0));
}
vigia.arrancar();
