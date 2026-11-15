/**
 * Capturas del CLI, para poder mirarlo al lado de una referencia.
 *
 * `npx tsx scripts/capturar-tui.ts [carpeta]` deja un HTML con las tres vistas dibujadas tal
 * cual las pinta la app —mismo búfer, mismos colores— y una captura por archivo.
 *
 * Why un HTML y no una foto de la terminal: una foto depende del tema, de la fuente y del
 * tamaño de la ventana de quien la saca, así que dos capturas del mismo día no se pueden
 * comparar. Esto dibuja las celdas con sus colores de verdad, así que lo que se ve es lo que la
 * app decidió y nada más.
 *
 * No prueba nada por su cuenta: es para mirar. Lo que tiene que pasar sí o sí vive en los tests.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Bufer, Celda, Rgb } from "../src/tui/celdas.js";
import { App } from "../src/tui/app.js";
import { Sesion } from "../src/tui/sesion.js";
import { T } from "../src/tui/piezas.js";

const ANCHO = 120;
const ALTO = 38;

const hex = (c: Rgb | null | undefined, siNo: Rgb): string => {
  const [r, g, b] = c ?? siNo;
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
};

const escapar = (ch: string): string =>
  ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === " " ? "&#160;" : ch;

/** Una celda es un <span> con su color; las iguales seguidas se juntan en uno solo. */
function renglonHtml(bufer: Bufer, y: number): string {
  const partes: string[] = [];
  let actual: { fg: string; bg: string; negrita: boolean; cursiva: boolean; texto: string } | null = null;
  for (let x = 0; x < bufer.ancho; x++) {
    const celda: Celda | undefined = bufer.celda(x, y);
    if (!celda) continue;
    const estilo = {
      fg: hex(celda.fg, T.texto),
      bg: hex(celda.bg, T.fondo),
      negrita: celda.negrita === true,
      cursiva: celda.cursiva === true,
    };
    if (
      actual &&
      actual.fg === estilo.fg &&
      actual.bg === estilo.bg &&
      actual.negrita === estilo.negrita &&
      actual.cursiva === estilo.cursiva
    ) {
      actual.texto += escapar(celda.ch);
      continue;
    }
    if (actual) partes.push(spanDe(actual));
    actual = { ...estilo, texto: escapar(celda.ch) };
  }
  if (actual) partes.push(spanDe(actual));
  return partes.join("");
}

function spanDe(p: { fg: string; bg: string; negrita: boolean; cursiva: boolean; texto: string }): string {
  const estilos = [`color:${p.fg}`, `background:${p.bg}`];
  if (p.negrita) estilos.push("font-weight:700");
  if (p.cursiva) estilos.push("font-style:italic");
  return `<span style="${estilos.join(";")}">${p.texto}</span>`;
}

function paginaHtml(vistas: readonly { readonly nombre: string; readonly bufer: Bufer }[]): string {
  const bloques = vistas
    .map(
      (v) =>
        `<h2>${v.nombre}</h2>\n<pre>${Array.from({ length: v.bufer.alto }, (_, y) => renglonHtml(v.bufer, y)).join("\n")}</pre>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>El CLI de Dolphin</title>
<style>
  body { background:${hex(undefined, T.fondo)}; color:${hex(undefined, T.texto)};
         font-family: system-ui, sans-serif; margin:0; padding:32px 24px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 4px; }
  p.sub { margin:0 0 28px; opacity:.6; font-size:13px; }
  h2 { font-size:13px; font-weight:500; opacity:.55; margin:28px 0 8px; }
  pre { font-family: "Cascadia Code", "JetBrains Mono", ui-monospace, monospace;
        font-size:13px; line-height:1.25; margin:0; white-space:pre; overflow-x:auto;
        border-radius:10px; padding:10px 0; }
</style></head>
<body><h1>El CLI de Dolphin</h1>
<p class="sub">${ANCHO}×${ALTO} · dibujado con el mismo búfer que la app, no es una foto de una terminal.</p>
${bloques}
</body></html>`;
}

const carpeta = resolve(process.argv[2] ?? join(process.cwd(), ".capturas"));
await mkdir(carpeta, { recursive: true });

const app = new App(new Sesion({ repo: process.cwd(), agente: "mentira", automatico: false }));
const vistas: { nombre: string; bufer: Bufer }[] = [];
for (const vista of ["inicio", "chat", "equipo"] as const) {
  app.irA(vista);
  vistas.push({ nombre: vista, bufer: app.dibujar(ANCHO, ALTO) });
}

await writeFile(join(carpeta, "cli.html"), paginaHtml(vistas), "utf8");
for (const v of vistas) {
  await writeFile(join(carpeta, `cli-${v.nombre}.txt`), v.bufer.comoTexto().join("\n"), "utf8");
}
console.log(`\n  Listo: ${join(carpeta, "cli.html")}\n  Y una por vista en texto plano, al lado.\n`);
