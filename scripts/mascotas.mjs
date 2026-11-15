// Genera src/tui/mascotas-datos.ts: los logos de los agentes (los mismos SVG que dibuja la app de
// escritorio en escritorio/src/renderer/src/components/status-bar/icons.tsx) pasados por Chrome a
// máscaras chicas de cobertura, para que la terminal los dibuje sin rasterizar curvas en vivo.
//
// uso: node scripts/mascotas.mjs   (necesita escritorio/node_modules con playwright-core y Chrome)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raiz, "escritorio", "package.json"));
const { chromium } = require("playwright-core");

const iconos = readFileSync(join(raiz, "escritorio/src/renderer/src/components/status-bar/icons.tsx"), "utf8");
const pathDe = (funcion) => {
  const cuerpo = iconos.slice(iconos.indexOf(`export function ${funcion}`));
  const d = /\bd="([^"]+)"/.exec(cuerpo);
  if (!d) throw new Error(`no encontré el path de ${funcion}`);
  return d[1];
};
const estrellaGemini = /const star =\s*'([^']+)'/.exec(iconos)?.[1];
if (!estrellaGemini) throw new Error("no encontré la estrella de Gemini");

// Lo que se rasteriza: el path, su viewBox y su regla de relleno.
const LOGOS = {
  claude: { d: pathDe("ClaudeIcon"), caja: 24, regla: "nonzero", color: [217, 119, 87] },
  openai: { d: pathDe("OpenAIIcon"), caja: 24, regla: "evenodd", color: [232, 232, 232] },
  gemini: { d: estrellaGemini, caja: 65, regla: "nonzero", color: [120, 150, 255] },
};
const LADO = 32; // píxeles por lado de cada máscara: 16×8 celdas en braille

const navegador = await chromium.launch({ channel: "chrome" });
const pagina = await navegador.newPage();
const mascaras = await pagina.evaluate(
  ({ logos, lado }) => {
    const salida = {};
    for (const [nombre, logo] of Object.entries(logos)) {
      // Con 4×4 de sobremuestreo y promediado, los bordes salen con cobertura parcial (suaves).
      const grande = lado * 4;
      const lienzo = new OffscreenCanvas(grande, grande);
      const ctx = lienzo.getContext("2d");
      ctx.scale(grande / logo.caja, grande / logo.caja);
      ctx.fill(new Path2D(logo.d), logo.regla);
      const { data } = ctx.getImageData(0, 0, grande, grande);
      const valores = [];
      for (let y = 0; y < lado; y++) {
        for (let x = 0; x < lado; x++) {
          let suma = 0;
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) suma += data[((y * 4 + dy) * grande + x * 4 + dx) * 4 + 3];
          // Un dígito hexadecimal por píxel: 0 vacío … f lleno.
          valores.push(Math.round(suma / 16 / 17).toString(16));
        }
      }
      salida[nombre] = valores.join("");
    }
    return salida;
  },
  { logos: LOGOS, lado: LADO },
);
await navegador.close();

const lineas = Object.entries(LOGOS).map(
  ([nombre, logo]) => `  ${nombre}: { lado: ${LADO}, color: [${logo.color.join(", ")}], cobertura: "${mascaras[nombre]}" },`,
);
writeFileSync(
  join(raiz, "src/tui/mascotas-datos.ts"),
  `// Generado por scripts/mascotas.mjs a partir de los íconos de la app de escritorio: no se edita a mano.
// Cada logo es una máscara de LADO×LADO con un dígito hexadecimal de cobertura por píxel (0 vacío, f lleno).

export interface MascaraDeLogo {
  readonly lado: number;
  readonly color: readonly [number, number, number];
  readonly cobertura: string;
}

export const LOGOS: Record<"claude" | "openai" | "gemini", MascaraDeLogo> = {
${lineas.join("\n")}
};
`,
);
console.log("ok: src/tui/mascotas-datos.ts con", Object.keys(LOGOS).join(", "));
