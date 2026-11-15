/**
 * La vidriera: fabrica un repo con dos cosechas ricas para desarrollar la
 * consola con datos extremos (tareas largas, 4 modelos distintos, muertes
 * en cada escalón) sin gastar un token. `npx tsx scripts/vidriera.ts [carpeta]`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { guardarCosecha } from "../src/nucleo/archivo.js";
import type { Candidato, Cosecha } from "../src/nucleo/tipos.js";

const repo = process.argv[2] ?? join(process.cwd(), ".vidriera");
await mkdir(repo, { recursive: true });

const pasada = (verificador: string, costo: "gratis" | "barato" | "caro", paso: boolean, detalle: string, ms: number, gastado = 0) =>
  ({ verificador, costo, paso, detalle, gastado, ms }) as const;

const u = (
  id: string, vivo: boolean, enfoque: string, modelo: string, msAgente: number,
  pasadas: ReturnType<typeof pasada>[],
  extra: Partial<Candidato> = {},
): Candidato => ({
  universo: { id, rama: `dolphin/${id}`, ruta: join(repo, ".universos", id), nacido: Date.now() },
  vivo, enfoque, modelo, msAgente, pasadas,
  ...(vivo
    ? {
        forma: {
          archivos: 2,
          agregadas: 31,
          quitadas: 4,
          dependenciasNuevas: 0,
          tocados: [
            { ruta: "src/carrito/plata.ts", agregadas: 24, quitadas: 3 },
            { ruta: "src/carrito/plata.test.ts", agregadas: 7, quitadas: 1 },
          ],
        },
      }
    : {}),
  ...extra,
});

const candidatos: Candidato[] = [
  u("u1", true, "mínimo", "claude-haiku-5-5", 41_200, [
    pasada("sintaxis", "gratis", true, "sintaxis: pasó", 950),
    pasada("test", "gratis", true, "test: pasó", 7_800),
    pasada("peso", "gratis", true, "peso: pasó", 1_200),
    pasada("pantalla", "caro", true, "pantalla: 5 personas sin hallazgos", 11_400, 0.021),
  ], {
    forma: {
      archivos: 1,
      agregadas: 9,
      quitadas: 2,
      dependenciasNuevas: 0,
      tocados: [{ ruta: "src/carrito/plata.ts", agregadas: 9, quitadas: 2 }],
    },
    contrato: { superficies: ["/carrito"], resumen: "Aplica el IVA una sola vez sobre el neto y redondea a centavos en el único punto donde se calcula el total." },
  }),
  u("u2", true, "test primero", "claude-sonnet-5-5", 63_900, [
    pasada("sintaxis", "gratis", true, "sintaxis: pasó", 1_000),
    pasada("test", "gratis", true, "test: pasó", 8_100),
    pasada("peso", "gratis", true, "peso: pasó", 1_150),
    pasada("pantalla", "caro", true, "pantalla: 5 personas sin hallazgos", 12_050, 0.034),
  ], {
    forma: {
      archivos: 3,
      agregadas: 58,
      quitadas: 11,
      dependenciasNuevas: 0,
      tocados: [
        { ruta: "src/carrito/plata.ts", agregadas: 18, quitadas: 6 },
        { ruta: "src/carrito/plata.test.ts", agregadas: 32, quitadas: 0 },
        { ruta: "src/carrito/tipos.ts", agregadas: 8, quitadas: 5 },
      ],
    },
    contrato: { superficies: ["/carrito"], resumen: "Primero escribe los tests que faltaban (transferencia, monotributista, doble cobro) y después corrige el cálculo para que pasen." },
    // Esta rama salió de la memoria de respuestas: cero tokens del agente.
    deCache: true,
    ahorro: 0.034,
  }),
  u("u3", false, "a fondo", "gpt-5.2-codex", 72_400, [
    pasada("sintaxis", "gratis", true, "sintaxis: pasó", 1_100),
    pasada("test", "gratis", false, "test: ✖ suma el IVA del 21% sobre el neto", 9_300),
  ], { murioEn: "test", porQue: "test: ✖ suma el IVA del 21% sobre el neto" }),
  u("u4", false, "raíz del problema", "gemini-3-pro", 55_100, [
    pasada("sintaxis", "gratis", true, "sintaxis: pasó", 980),
    pasada("test", "gratis", true, "test: pasó", 8_400),
    pasada("peso", "gratis", false, "peso: plata.js pesa 668 bytes y el tope es 400", 1_300),
  ], { murioEn: "peso", porQue: "peso: plata.js pesa 668 bytes y el tope es 400", forma: { archivos: 6, agregadas: 214, quitadas: 40, dependenciasNuevas: 1 } }),
  u("u5", false, "refactor amplio con un nombre de enfoque larguísimo que no entra", "deepseek-v4", 81_000, [
    pasada("sintaxis", "gratis", false, "sintaxis: SyntaxError: Unexpected token '}' en src/carrito/calculadora-de-impuestos-internos.generado.js línea 441", 760),
  ], { murioEn: "sintaxis", porQue: "sintaxis: SyntaxError: Unexpected token '}' en src/carrito/calculadora-de-impuestos-internos.generado.js línea 441" }),
  u("u6", false, "sin tocar deps", "qwen-3.5-coder", 0, [], { murioEn: "el agente", porQue: "el agente no devolvió nada: se quedó sin contexto a mitad del archivo" }),
];

const cosecha: Cosecha = {
  tarea: "Arreglá el cálculo del IVA en el carrito: a un monotributista le está cobrando el 21% dos veces cuando paga con transferencia",
  candidatos,
  ganador: candidatos[0]!,
  porQueGano: "De los 2 que pasaron todas las fases, quedó u1 por simple: 1 archivo y +9 −2 contra 3 archivos y +58 −11.",
  gastado: 0.055,
  muertosGratis: 3,
  ms: 97_300,
};

// Un segundo turno, más viejo y chico, para que la columna tenga historia.
// Corrió con suscripción: en la consola no tiene que aparecer un solo US$.
const vieja: Cosecha = {
  suscripcion: true,
  tarea: "Sumale el botón de exportar a CSV al historial",
  candidatos: [
    u("u1", true, "mínimo", "claude-haiku-5-5", 22_000, [
      pasada("sintaxis", "gratis", true, "sintaxis: pasó", 900),
      pasada("test", "gratis", true, "test: pasó", 6_100),
    ]),
    u("u2", false, "a fondo", "claude-sonnet-5-5", 30_500, [
      pasada("sintaxis", "gratis", true, "sintaxis: pasó", 940),
      pasada("test", "gratis", false, "test: ✖ exporta la coma decimal como punto", 6_600),
    ], { murioEn: "test", porQue: "test: ✖ exporta la coma decimal como punto" }),
  ],
  gastado: 0.012,
  muertosGratis: 1,
  ms: 41_000,
};

// Historia de varios días, para que la barra lateral muestre sus secciones
// (hoy, ayer, la semana, el mes, antes) y una tarea sembrada dos veces.
const dias = (n: number, hora: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hora, 12, 0, 0);
  return d;
};

const una = (tarea: string, candidatos: Candidato[], extra: Partial<Cosecha> = {}): Cosecha => {
  const gastado = candidatos.reduce((n, c) => n + c.pasadas.reduce((m, p) => m + p.gastado, 0), 0);
  const ganador = candidatos.find((c) => c.vivo);
  return {
    tarea,
    candidatos,
    ...(ganador ? { ganador, porQueGano: `Pasó todas las fases: ${ganador.universo.id}.` } : {}),
    gastado,
    muertosGratis: candidatos.filter((c) => !c.vivo).length,
    ms: candidatos.reduce((n, c) => n + (c.msAgente ?? 0) + c.pasadas.reduce((m, p) => m + p.ms, 0), 0),
    ...extra,
  };
};

const verde = (ms: number) => [pasada("sintaxis", "gratis", true, "sintaxis: pasó", 900), pasada("test", "gratis", true, "test: pasó", ms)];

const historia: [Cosecha, Date][] = [
  [
    una("Sacá los console.log que quedaron en el carrito", [u("u1", true, "mínimo", "claude-sonnet-5-5", 18_000, verde(5_200))], {
      suscripcion: true,
    }),
    dias(40, 11),
  ],
  [
    una("Migrá el login a código por correo además de WhatsApp", [
      u("u1", true, "mínimo", "claude-opus-5-5", 96_000, [...verde(9_400), pasada("pantalla", "caro", true, "pantalla: 5 personas sin hallazgos", 12_800, 0.04)]),
      u("u2", false, "test primero", "claude-haiku-5-5", 44_000, [pasada("sintaxis", "gratis", true, "sintaxis: pasó", 950), pasada("test", "gratis", false, "test: ✖ el código vence a los 5 minutos y no a los 10", 8_800)], {
        murioEn: "test",
        porQue: "test: ✖ el código vence a los 5 minutos y no a los 10",
      }),
      u("u3", false, "a fondo", "gpt-5.2-codex", 61_000, [pasada("sintaxis", "gratis", false, "sintaxis: falta cerrar una llave en otp.ts", 700)], {
        murioEn: "sintaxis",
        porQue: "sintaxis: falta cerrar una llave en otp.ts",
      }),
    ]),
    dias(12, 15),
  ],
  [
    una("Que el listado de facturas pagine de a 50 y recuerde la página", [u("u1", true, "mínimo", "claude-sonnet-5-5", 52_000, verde(7_000))], {
      suscripcion: true,
    }),
    dias(3, 18),
  ],
  [
    una("Validá el CUIT del alta con el dígito verificador", [
      u("u1", false, "mínimo", "claude-haiku-5-5", 26_000, [pasada("sintaxis", "gratis", true, "sintaxis: pasó", 900), pasada("test", "gratis", false, "test: ✖ acepta 20-12345678-0", 6_400)], {
        murioEn: "test",
        porQue: "test: ✖ acepta 20-12345678-0",
      }),
    ]),
    dias(1, 10),
  ],
  [
    una("Validá el CUIT del alta con el dígito verificador", [u("u1", true, "mínimo", "claude-sonnet-5-5", 31_000, verde(6_600))]),
    dias(1, 16),
  ],
];

/** Guarda una cosecha como si hubiera corrido en otra fecha. */
async function guardarComoDe(c: Cosecha, fecha: Date): Promise<void> {
  const ruta = await guardarCosecha(c, repo);
  const guardada = JSON.parse(await readFile(ruta, "utf8")) as { cuando: string };
  guardada.cuando = fecha.toISOString();
  await writeFile(join(dirname(ruta), `${guardada.cuando.replace(/[:.]/g, "-")}.json`), JSON.stringify(guardada, null, 2), "utf8");
  await rm(ruta);
}

// Cada corrida arranca de cero: sin esto, la vidriera acumulaba duplicados.
await rm(join(repo, ".dolphin", "cosechas"), { recursive: true, force: true });

for (const [c, fecha] of historia) await guardarComoDe(c, fecha);

// La vieja va antes que la grande: guardarCosecha pisa ultima.json, y la
// que tiene que quedar como última es la grande.
await guardarCosecha(vieja, repo);
await new Promise((r) => setTimeout(r, 1100)); // los nombres de cosecha van por segundo
await guardarCosecha(cosecha, repo);

// El worktree del ganador es un repo git DE VERDAD con un cambio sin
// commitear: es lo que hace que «Lo que escribió» muestre un diff real.
const correr = promisify(execFile);
const w = join(repo, ".universos", "u1");
await mkdir(join(w, "src"), { recursive: true });
await writeFile(join(w, "src", "plata.js"), "export const conIva = (neto) => neto * 1.21;\n");
await correr("git", ["init", "-q"], { cwd: w });
await correr("git", ["add", "-A"], { cwd: w });
// --allow-empty: la segunda corrida sobre la misma carpeta no tiene nada
// nuevo que commitear y sin esto se caía entera.
await correr("git", ["-c", "user.email=v@v", "-c", "user.name=vidriera", "commit", "-qm", "base", "--allow-empty"], { cwd: w });
await writeFile(
  join(w, "src", "plata.js"),
  "// El IVA se aplica UNA vez, sobre el neto, y se redondea a centavos.\nexport const conIva = (neto) => Math.round(neto * 1.21 * 100) / 100;\n",
);
await writeFile(join(w, "src", "plata.test.js"), "import { conIva } from './plata.js';\nif (conIva(100) !== 121) throw new Error('IVA mal');\n");

console.log("vidriera lista en", repo);
