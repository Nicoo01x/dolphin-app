import { execFile } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sembrar } from "../src/nucleo/sembrar.js";
import { TallerDeGit } from "../src/nucleo/taller.js";
import { verificadoresDeNpm } from "../src/nucleo/verificadores.js";
import { guardarCosecha } from "../src/nucleo/archivo.js";
import { crearServidor } from "../src/servidor.js";
import { abrirEnVivo, reducirEvento } from "../src/nucleo/en-vivo.js";
import { puertoLibre } from "../src/nucleo/puertos.js";
import { medirForma } from "../src/nucleo/forma.js";
import type { Agente } from "../src/nucleo/tipos.js";
import { sembrarBotsDeDemo } from "../src/bots/demo.js";

/**
 * npm run demo
 *
 * De cero a la cosecha en pantalla, sin configurar nada y sin gastar un
 * token: arma un repo de ejemplo, siembra seis universos con un agente de
 * mentira, los pasa por el portón de verdad y abre la pantalla.
 *
 * Es lo primero que corre alguien que acaba de clonar esto.
 */

const correr = promisify(execFile);
const repo = await mkdtemp(join(tmpdir(), "dolphin-demo-"));

console.log(`\n  dolphin · demo en ${repo}\n`);

// Los bots de la demo viven en el repo de ejemplo, no en tu ~/.dolphin, y piensan con el motor de mentira.
process.env["DOLPHIN_BOTS_DIR"] = join(repo, ".dolphin", "bots");
await sembrarBotsDeDemo(repo);

/* ── un repo con un bug de verdad ── */
await mkdir(join(repo, "src"), { recursive: true });
await writeFile(
  join(repo, "package.json"),
  JSON.stringify(
    {
      name: "demo",
      version: "1.0.0",
      type: "module",
      // Tres escalones de verdad, para que la vista Portón muestre la
      // escalera y no un solo renglón: sintaxis, tests y tamaño.
      scripts: {
        sintaxis: "node --check src/plata.js",
        test: "node --test",
        peso: "node scripts/peso.js",
      },
    },
    null,
    2,
  ),
);
await writeFile(
  join(repo, "src", "plata.js"),
  "// Devuelve el total con IVA incluido.\nexport function conIva(neto, alicuota) {\n  return neto + alicuota;\n}\n",
);
await writeFile(
  join(repo, "src", "plata.test.js"),
  `import { test } from "node:test";
import assert from "node:assert/strict";
import { conIva } from "./plata.js";

test("suma el IVA del 21%", () => assert.equal(conIva(1000, 0.21), 1210));
test("sin IVA devuelve el neto", () => assert.equal(conIva(500, 0), 500));
`,
);
await mkdir(join(repo, "scripts"), { recursive: true });
await writeFile(
  join(repo, "scripts", "peso.js"),
  `import { readFile } from "node:fs/promises";
const fuente = await readFile(new URL("../src/plata.js", import.meta.url), "utf8");
const tope = 400;
if (fuente.length > tope) {
  console.error(\`plata.js pesa \${fuente.length} bytes y el tope es \${tope}\`);
  process.exit(1);
}
`,
);

await correr("git", ["init", "-q"], { cwd: repo });
await correr("git", ["add", "-A"], { cwd: repo });
await correr("git", ["-c", "user.email=d@d", "-c", "user.name=d", "commit", "-qm", "base"], { cwd: repo });

/* ── siete intentos: cuatro aciertan de entrada, u4 corrige cuando el
      test lo rebota, u6 insiste con lo mismo y queda cortado con su
      diagnóstico, u7 se pasa del tope de peso ── */
const arreglos: Record<string, string> = {
  u1: "return neto * (1 + alicuota);",
  u2: "return Number(neto) * (1 + Number(alicuota));",
  u3: "return neto + neto * alicuota;",
  u4: "return neto * alicuota;", // se olvida el neto: muere en los tests
  u5: "if (alicuota > 1) throw new RangeError('alicuota');\n  return neto * (1 + alicuota);",
  u6: "return neto + alicuota;", // no cambia nada: muere en los tests
  // Correcto, pero tan largo que se pasa del tope de peso: el tercer
  // escalón también tiene que matar a alguien.
  u7: [
    "// Validación extensa que documenta cada caso posible del cálculo de IVA,",
    "  // incluyendo netos negativos, alícuotas fuera de rango y valores que no",
    "  // son números, con un mensaje explicativo para cada situación.",
    "  if (typeof neto !== 'number' || Number.isNaN(neto)) throw new TypeError('neto');",
    "  if (typeof alicuota !== 'number' || Number.isNaN(alicuota)) throw new TypeError('alicuota');",
    "  if (neto < 0) throw new RangeError('el neto no puede ser negativo');",
    "  if (alicuota < 0 || alicuota > 1) throw new RangeError('la alicuota va entre 0 y 1');",
    "  return neto * (1 + alicuota);",
  ].join("\n"),
};

const agente: Agente = {
  nombre: "demo",

  // El bucle Code → Test → Fix, sin tokens: u4 entiende el veredicto y lo
  // arregla; u6 «corrige» escribiendo lo mismo, para que el demo también
  // muestre el corte honesto con el diagnóstico.
  async corregir(universo, _tarea, _falla) {
    const cuerpo = universo.id === "u4" ? arreglos["u1"]! : (arreglos[universo.id] ?? arreglos["u1"]!);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 1200));
    await writeFile(
      join(universo.ruta, "src", "plata.js"),
      `// Devuelve el total con IVA incluido.
export function conIva(neto, alicuota) {
  ${cuerpo}
}
`,
    );
    return { forma: await medirForma(universo.ruta), gastado: 0, modelo: "demo" };
  },

  async trabajar(universo, _tarea, enfoque) {
    const cuerpo = arreglos[universo.id] ?? arreglos["u1"]!;
    await writeFile(
      join(universo.ruta, "src", "plata.js"),
      `// Devuelve el total con IVA incluido.\nexport function conIva(neto, alicuota) {\n  ${cuerpo}\n}\n`,
    );
    // La escritura de un modelo tarda: el demo lo imita para que el vivo
    // se vea de verdad (cada intento arranca y entrega a su ritmo).
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 3800));
    return {
      forma: await medirForma(universo.ruta),
      gastado: 0,
      contrato: { superficies: [], resumen: `enfoque ${enfoque?.nombre ?? "—"}` },
      // Se dice de demo: sin esto la consola le pone el logo de Claude y parece que Claude no cobra.
      modelo: "demo",
    };
  },
};
/* ── la pantalla, ANTES de sembrar: el demo se mira EN VIVO ── */
const puerto = await puertoLibre();
const transmitir = await abrirEnVivo(repo);

await new Promise<void>((listo) =>
  crearServidor({ repo, demo: true }).listen(puerto, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${puerto}`;
    console.log(`
  mirá la siembra EN VIVO en:
  ${url}
`);
    if (!process.env["DOLPHIN_SIN_ABRIR"]) {
      const [cmd, args] =
        process.platform === "win32"
          ? (["cmd.exe", ["/c", "start", "", url]] as const)
          : process.platform === "darwin"
            ? (["open", [url]] as const)
            : (["xdg-open", [url]] as const);
      execFile(cmd, [...args], { windowsHide: true }, () => {});
    }
    listo();
  }),
);

transmitir({ tipo: "siembra", tarea: "conIva suma la alícuota en vez de aplicarla", universos: 7 });

const cosecha = await sembrar({
  tarea: "conIva suma la alícuota en vez de aplicarla",
  cantidad: 7,
  rama: "demo",
  taller: new TallerDeGit(repo),
  agente,
  verificadores: verificadoresDeNpm(["sintaxis", "test", "peso"]),
  reintentos: 1,
  alPasar(evento) {
    const reducido = reducirEvento(evento);
    if (reducido) transmitir(reducido);
    if (evento.tipo === "nace") console.log(`  ·  ${evento.universo.id} · ${evento.enfoque}`);
  },
});

await guardarCosecha(cosecha, repo);
transmitir({ tipo: "cosecha" });

const vivos = cosecha.candidatos.filter((c) => c.vivo).length;
console.log(
  `
  ${vivos} de ${cosecha.candidatos.length} pasaron todas las fases · quedó ${cosecha.ganador?.universo.id ?? "ninguno"}`,
);
console.log(`
  la pantalla sigue abierta en http://127.0.0.1:${puerto} — Ctrl+C para cerrarla
`);
