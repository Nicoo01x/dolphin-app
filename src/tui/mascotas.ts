import { mezclar, type Bufer, type Rgb } from "./celdas.js";
import { pintarDelfin3d } from "./delfin3d.js";
import { LOGOS, type MascaraDeLogo } from "./mascotas-datos.js";

/**
 * Las mascotas de los agentes, para las tarjetas del equipo: cada compañero se reconoce por quién
 * lo corre. Claude tiene su bichito (dibujado acá, píxel por píxel), los demás su logo (los mismos
 * del escritorio, ver mascotas-datos.ts) y Dolphin su delfín. Todas se mueven según lo que pasa:
 * esperando respiran, trabajando saltan o giran, terminadas festejan.
 */

export type Mascota = "bicho" | "claude" | "openai" | "gemini" | "dolphin";
export type Animo = "espera" | "trabaja" | "lista" | "fallo";

/** De qué mascota es un modelo o un motor: opus, sonnet, haiku → Claude; gpt, codex → OpenAI… */
export function mascotaDe(modelo: string | undefined, motor?: string, principal = false): Mascota {
  const quien = `${modelo ?? ""} ${motor ?? ""}`.toLowerCase();
  if (/demo|mentira/.test(quien)) return "dolphin";
  if (/gpt|codex|openai|\bo\d/.test(quien)) return "openai";
  if (/gemini|antigravity/.test(quien)) return "gemini";
  // El que dirige (el líder) es el bichito; los compañeros de Claude, el asterisco que gira.
  return principal ? "bicho" : "claude";
}

export const COLOR_DE_MASCOTA: Record<Mascota, Rgb> = {
  bicho: [217, 119, 87],
  claude: [217, 119, 87],
  openai: [232, 232, 232],
  gemini: [120, 150, 255],
  dolphin: [214, 220, 226],
};

// --- El bichito de Claude: 12×10 píxeles en medios bloques (12 columnas × 5 renglones). ---

const CUERPO = ["..########..", "..########..", "..#.####.#..", "..#.####.#..", "############", "..########..", "..########.."];
const OJOS_CERRADOS = ["..########..", "..########.."];
const BRAZOS_ARRIBA = "#.########.#";
const PATAS = [
  ["..#.#..#.#..", "..#.#..#.#.."],
  ["...##..##...", "...##..##..."],
];

/** Los píxeles del bichito en el instante t: parpadea, camina, festeja. */
export function bicho(t: number, animo: Animo): string[] {
  const filas = [...CUERPO];
  // Parpadea cada ~3 s, un instante.
  if (t % 3200 < 140) filas.splice(2, 2, ...OJOS_CERRADOS);
  if (animo === "lista") {
    // Brazos arriba: festeja.
    filas[1] = BRAZOS_ARRIBA;
    filas[4] = "..########..";
  }
  const paso = animo === "trabaja" ? Math.floor(t / 180) % 2 : 0;
  return [...filas, ...PATAS[paso]!, "............"];
}

/**
 * Dibuja el bichito con la esquina en (x, y). Trabajando salta (un píxel arriba y abajo), fallado
 * se apaga. Ocupa 12 columnas y 5 renglones.
 */
export function pintarBicho(b: Bufer, x: number, y: number, t: number, animo: Animo, fondo: Rgb): void {
  const pixeles = bicho(t, animo);
  const salto = animo === "trabaja" && Math.floor(t / 180) % 2 === 1 ? 1 : 0;
  const color = animo === "fallo" ? mezclar(COLOR_DE_MASCOTA.bicho, fondo, 0.6) : animo === "espera" ? mezclar(COLOR_DE_MASCOTA.bicho, fondo, 0.25) : COLOR_DE_MASCOTA.bicho;
  const lleno = (px: number, py: number) => {
    const fila = pixeles[py + salto];
    return !!fila && fila[px] === "#";
  };
  for (let cy = 0; cy < 5; cy++) {
    for (let cx = 0; cx < 12; cx++) {
      const arriba = lleno(cx, cy * 2);
      const abajo = lleno(cx, cy * 2 + 1);
      if (!arriba && !abajo) continue;
      b.poner(x + cx, y + cy, "▀", { fg: arriba ? color : fondo, bg: abajo ? color : fondo });
    }
  }
}

// --- Los logos: braille, girando como una moneda. ---

const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

function cobertura(m: MascaraDeLogo, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= m.lado || iy >= m.lado) return 0;
  return parseInt(m.cobertura[iy * m.lado + ix]!, 16) / 15;
}

/**
 * Un logo en braille en (x, y), de `ancho`×`alto` celdas. Trabajando gira sobre su eje vertical
 * (se angosta y se da vuelta, como una moneda) y late; esperando queda quieto y tenue.
 */
export function pintarLogo(b: Bufer, x: number, y: number, ancho: number, alto: number, logo: "claude" | "openai" | "gemini", t: number, animo: Animo, fondo: Rgb): void {
  const m = LOGOS[logo];
  const W = ancho * 2;
  const H = alto * 4;
  const lado = Math.min(W, H);
  const giro = animo === "trabaja" ? Math.cos(t / 520) : animo === "lista" ? Math.cos(Math.min(1, (t % 2600) / 700) * Math.PI * 2) : 1;
  const escalaX = Math.max(0.08, Math.abs(giro));
  const pulso = animo === "trabaja" ? 0.75 + 0.25 * Math.sin(t / 160) : 1;
  const base = mezclar(m.color as Rgb, fondo, animo === "espera" ? 0.55 : animo === "fallo" ? 0.7 : 0);
  for (let cy = 0; cy < alto; cy++) {
    for (let cx = 0; cx < ancho; cx++) {
      let bits = 0;
      let luz = 0;
      for (let fy = 0; fy < 4; fy++) {
        for (let fx = 0; fx < 2; fx++) {
          const px = cx * 2 + fx + 0.5 - W / 2;
          const py = cy * 4 + fy + 0.5 - H / 2;
          // Del punto al logo: deshacer el angostamiento del giro (y darlo vuelta del otro lado).
          const lx = (px / escalaX) * Math.sign(giro || 1);
          const c = cobertura(m, (lx / lado + 0.5) * m.lado, (py / lado + 0.5) * m.lado);
          if (c < 0.45) continue;
          bits |= BIT[fy]![fx]!;
          luz += c;
        }
      }
      if (bits === 0) continue;
      // Del otro lado de la moneda, un poco más oscuro: se nota que giró.
      const cara = giro < 0 ? 0.7 : 1;
      b.poner(x + cx, y + cy, String.fromCharCode(0x2800 + bits), { fg: mezclar(fondo, base, Math.min(1, (luz / 4) * pulso * cara + 0.35)) });
    }
  }
}

/** Cualquier mascota en su recuadro (ancho×alto celdas), centrada. */
export function pintarMascota(b: Bufer, x: number, y: number, ancho: number, alto: number, mascota: Mascota, t: number, animo: Animo, fondo: Rgb): void {
  if (mascota === "bicho") {
    pintarBicho(b, x + Math.max(0, Math.floor((ancho - 12) / 2)), y + Math.max(0, Math.floor((alto - 5) / 2)), t, animo, fondo);
    return;
  }
  if (mascota === "dolphin") {
    const a = Math.min(alto, Math.floor(ancho / 2.5));
    const w = Math.round(a * 2.5);
    pintarDelfin3d(b, x + Math.floor((ancho - w) / 2), y + Math.floor((alto - a) / 2), w, a, t, {
      vueltasPorSegundo: animo === "trabaja" ? 0.5 : 0.12,
      cadaSalto: animo === "trabaja" ? 2400 : 0,
      ...(animo === "fallo" ? { claro: [110, 110, 110] as Rgb } : {}),
    });
    return;
  }
  const lado = Math.min(alto, Math.floor(ancho / 2));
  pintarLogo(b, x + Math.floor((ancho - lado * 2) / 2), y + Math.floor((alto - lado) / 2), lado * 2, lado, mascota, t, animo, fondo);
}
