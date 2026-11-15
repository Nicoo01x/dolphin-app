import { parseArgs } from "node:util";
import { verificadorDePantalla } from "./tester/pantalla.js";
import type { Universo } from "./nucleo/tipos.js";

/**
 * dolphin mirar <url>
 *
 * Corre el escalón de pantalla contra una URL cualquiera, sin sembrar nada.
 * Sirve para calibrar las personas y para auditar algo que ya existe.
 */

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { superficies: { type: "string", default: "" } },
});
const url = positionals[0];
const superficies = (values.superficies ?? "").split(",").map((s) => s.trim()).filter(Boolean);

if (!url) {
  console.error("\n  uso: tsx src/mirar.ts <url>\n");
  process.exit(1);
}

const universo: Universo = { id: "x", rama: "x", ruta: process.cwd(), nacido: Date.now() };

console.log(`\n  mirando ${url}\n`);

// Si se declaran superficies, se arma la url de cada una sobre la base.
const verificador = verificadorDePantalla({
  url: (_u, superficie) => (superficie ? `${url}${superficie}` : url),
  tolerancia: 0,
});
const desde = Date.now();
const veredicto = await verificador.correr(
  universo,
  superficies.length > 0 ? { contrato: { superficies } } : undefined,
);

console.log(veredicto.evidencia?.trim() ? veredicto.evidencia : "  (sin hallazgos)");
console.log("\n  ─────────────────────────────────────────────");
console.log(`  ${veredicto.paso ? "✓ pasó" : "× murió"}  ${veredicto.detalle}`);
console.log(`  tardó ${((Date.now() - desde) / 1000).toFixed(1)} s\n`);
