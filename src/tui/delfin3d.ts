import { LOGO } from "./delfin.js";
import { mezclar, type Bufer, type Rgb } from "./celdas.js";

/**
 * El delfín del logo como un objeto 3D hecho de puntos braille, al estilo de la flor de Codex: el
 * trazo se extruye (una placa con espesor), gira sobre su eje vertical y se ilumina; cada punto de
 * braille es un rayo que sale de la cámara y busca la placa. La luz se ve en el gris de cada celda y
 * en cuántos puntos quedan prendidos (las caras en sombra se ralean).
 *
 * `pintarDelfin3d` es pura: el mismo `t` da el mismo cuadro. La máscara del logo se rasteriza una
 * sola vez y después solo se muestrea.
 */

// --- La máscara: cobertura de 0 a 1, a la mitad de la resolución del viewBox. ---

const MW = Math.ceil(LOGO.ancho / 2);
const MH = Math.ceil(LOGO.alto / 2);
let mascara: Float32Array | null = null;

/** Relleno par-impar por barrido (un píxel por unidad del viewBox), promediado de a 2×2. */
export function mascaraDelLogo(): Float32Array {
  if (mascara) return mascara;
  const lleno = new Uint8Array(LOGO.ancho * LOGO.alto);
  for (let y = 0; y < LOGO.alto; y++) {
    const cy = y + 0.5;
    const cortes: number[] = [];
    for (const p of LOGO.poligonos) {
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i]!;
        const [xj, yj] = p[j]!;
        if (yi > cy !== yj > cy) cortes.push(((xj - xi) * (cy - yi)) / (yj - yi) + xi);
      }
    }
    cortes.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const desde = Math.max(0, Math.ceil(cortes[k]! - 0.5));
      const hasta = Math.min(LOGO.ancho - 1, Math.floor(cortes[k + 1]! - 0.5));
      for (let x = desde; x <= hasta; x++) lleno[y * LOGO.ancho + x] = 1;
    }
  }
  mascara = new Float32Array(MW * MH);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let suma = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) suma += lleno[(y * 2 + dy) * LOGO.ancho + x * 2 + dx] ?? 0;
      mascara[y * MW + x] = suma / 4;
    }
  }
  return mascara;
}

/** Cobertura del logo en (x, y) del viewBox, interpolada. */
function cobertura(m: Float32Array, x: number, y: number): number {
  const mx = x / 2 - 0.5;
  const my = y / 2 - 0.5;
  const x0 = Math.floor(mx);
  const y0 = Math.floor(my);
  if (x0 < -1 || y0 < -1 || x0 >= MW || y0 >= MH) return 0;
  const fx = mx - x0;
  const fy = my - y0;
  const v = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= MW || cy >= MH ? 0 : m[cy * MW + cx]!);
  return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
}

// Bits de braille por punto (columna 0..1, fila 0..3), desde U+2800.
const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;
// Umbrales de Bayer para un carácter de 2×4: las sombras se ralean parejo, sin manchas.
const BAYER = [
  [0, 4],
  [6, 2],
  [1, 5],
  [7, 3],
] as const;

export interface OpcionesDelDelfin3d {
  /** Cuánto gira por segundo, en vueltas. Trabajando gira más rápido. */
  readonly vueltasPorSegundo?: number;
  /** Desde cuándo se arma (la entrada): los puntos llegan de a poco durante ~1,4 s. */
  readonly armadoDesde?: number;
  /** Gris más oscuro y más claro de los puntos. */
  readonly oscuro?: Rgb;
  readonly claro?: Rgb;
  /** Un pulso de luz (0 a 1), para cuando está trabajando. */
  readonly pulso?: number;
  /** Cada cuánto salta (ms); 0 no salta. Salta sin dejar de girar. */
  readonly cadaSalto?: number;
}

const DURA_EL_SALTO = 1150;

/**
 * El salto: cuánto sube (0 a 1) y cuánto cabecea en el instante t. Sube con la nariz arriba, cae
 * con la nariz abajo y al tocar fondo se aplasta un poco, como algo con peso.
 */
export function salto(t: number, cada: number): { altura: number; cabeceo: number; aplaste: number } {
  if (cada <= 0) return { altura: 0, cabeceo: 0, aplaste: 0 };
  const fase = (t % cada) / DURA_EL_SALTO;
  if (fase >= 1.25) return { altura: 0, cabeceo: 0, aplaste: 0 };
  if (fase >= 1) return { altura: 0, cabeceo: 0, aplaste: Math.sin(((fase - 1) / 0.25) * Math.PI) * 0.06 };
  return { altura: Math.sin(Math.PI * fase), cabeceo: -0.55 * Math.cos(Math.PI * fase), aplaste: 0 };
}

const ESPESOR = 26; // la mitad del espesor de la placa, en unidades del viewBox
const PASOS = 12;
const LUZ = (() => {
  const l = [-0.45, -0.55, 0.7];
  const n = Math.hypot(l[0]!, l[1]!, l[2]!);
  return [l[0]! / n, l[1]! / n, l[2]! / n] as const;
})();

const ruido = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Dibuja el delfín girando en el rectángulo (x, y, ancho, alto) en celdas. Escribe solo donde hay
 * puntos: lo demás queda como estaba (el fondo de quien lo llama).
 */
export function pintarDelfin3d(b: Bufer, x0: number, y0: number, ancho: number, alto: number, t: number, opciones: OpcionesDelDelfin3d = {}): void {
  const m = mascaraDelLogo();
  const W = ancho * 2;
  const H = alto * 4;
  const vueltas = opciones.vueltasPorSegundo ?? 1 / 7;
  const armado = opciones.armadoDesde === undefined ? 1 : Math.max(0, Math.min(1, (t - opciones.armadoDesde) / 1400));
  const entrada = 1 - Math.pow(1 - armado, 3);
  // Gira sobre el eje vertical, cabecea un poco y flota.
  const theta = t * 0.001 * vueltas * Math.PI * 2 + (1 - entrada) * 2.4;
  const cada = opciones.cadaSalto ?? 4200;
  const brinco = salto(t, cada);
  const phi = 0.16 * Math.sin(t / 1700) + brinco.cabeceo;
  const flota = Math.sin(t / 900) * 1.2;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  // Si salta, el delfín es un poco más chico y descansa abajo: el salto entra en el recuadro.
  const lugar = cada > 0 ? 0.74 : 1;
  const escala = Math.min(W / (LOGO.ancho * 1.05), H / (LOGO.alto * 1.12)) * (0.86 + 0.14 * entrada) * lugar;
  const base = cada > 0 ? H * 0.13 : 0;
  const subida = brinco.altura * H * 0.24;
  // Hasta dónde llega de costado en este giro (con la perspectiva y el cabeceo, un margen).
  const alcance = (LOGO.ancho / 2) * Math.abs(ct) + ESPESOR * Math.abs(st) + 40;
  const camara = 1500; // distancia de la cámara, en unidades del logo: perspectiva suave
  const oscuro = opciones.oscuro ?? [58, 62, 66];
  const claro = opciones.claro ?? [224, 230, 234];
  const pulso = opciones.pulso ?? 0;

  for (let cy = 0; cy < alto; cy++) {
    for (let cx = 0; cx < ancho; cx++) {
      let bits = 0;
      let luz = 0;
      let prendidos = 0;
      for (let fy = 0; fy < 4; fy++) {
        for (let fx = 0; fx < 2; fx++) {
          const px = cx * 2 + fx;
          const py = cy * 4 + fy;
          // Del punto de la pantalla al plano del logo (z = 0), en unidades del viewBox.
          const sx = (px + 0.5 - W / 2) / escala;
          const sy = ((py + 0.5 - H / 2 - flota - base + subida) / escala) * (1 + brinco.aplaste);
          // Afuera de lo que el delfín puede tapar en este giro, ni se tira el rayo.
          if (Math.abs(sy) > LOGO.alto * 0.62 || Math.abs(sx) > alcance) continue;
          // El rayo de la cámara (en z = camara) a ese punto, llevado al espacio del delfín.
          let dx = sx;
          let dy = sy;
          let dz = -camara;
          let ox = 0;
          let oy = 0;
          let oz = camara;
          // Deshacer el cabeceo (eje x) y el giro (eje y).
          [oy, oz] = [oy * cp + oz * sp, -oy * sp + oz * cp];
          [dy, dz] = [dy * cp + dz * sp, -dy * sp + dz * cp];
          [ox, oz] = [ox * ct - oz * st, ox * st + oz * ct];
          [dx, dz] = [dx * ct - dz * st, dx * st + dz * ct];
          if (Math.abs(dz) < 1e-6) continue;
          // Dónde entra y sale el rayo de la placa |z| ≤ ESPESOR.
          let t0 = (ESPESOR - oz) / dz;
          let t1 = (-ESPESOR - oz) / dz;
          if (t0 > t1) [t0, t1] = [t1, t0];
          let golpe = -1;
          let cara = false;
          for (let k = 0; k <= PASOS; k++) {
            const tt = t0 + ((t1 - t0) * k) / PASOS;
            const lx = ox + dx * tt + LOGO.ancho / 2;
            const ly = oy + dy * tt + LOGO.alto / 2;
            if (cobertura(m, lx, ly) > 0.5) {
              golpe = tt;
              cara = k === 0;
              break;
            }
          }
          if (golpe < 0) continue;
          // La normal: la cara de adelante/atrás, o la pared (del gradiente de la máscara).
          let nx = 0;
          let ny = 0;
          let nz = oz + dz * golpe > 0 ? 1 : -1;
          if (!cara) {
            const lx = ox + dx * golpe + LOGO.ancho / 2;
            const ly = oy + dy * golpe + LOGO.alto / 2;
            nx = cobertura(m, lx - 3, ly) - cobertura(m, lx + 3, ly);
            ny = cobertura(m, lx, ly - 3) - cobertura(m, lx, ly + 3);
            nz = 0;
            const n = Math.hypot(nx, ny) || 1;
            nx /= n;
            ny /= n;
          }
          // La normal vuelve al mundo: girar y cabecear.
          [nx, nz] = [nx * ct + nz * st, -nx * st + nz * ct];
          [ny, nz] = [ny * cp - nz * sp, ny * sp + nz * cp];
          if (nz < 0) [nx, ny, nz] = [-nx, -ny, -nz];
          const difusa = Math.max(0, nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]);
          const brillo = Math.pow(Math.max(0, nz), 18) * 0.35;
          const valor = Math.min(1, 0.16 + 0.78 * difusa + brillo + pulso * 0.18);
          // Al armarse, cada punto aparece en su momento.
          if (ruido(px, py) > entrada * 1.15) continue;
          // Las sombras se ralean: el punto queda si la luz le gana a su umbral.
          if (valor < (BAYER[fy]![fx]! / 8) * 0.62) continue;
          bits |= BIT[fy]![fx]!;
          luz += valor;
          prendidos++;
        }
      }
      if (bits === 0) continue;
      const color = mezclar(oscuro, claro, luz / prendidos);
      b.poner(x0 + cx, y0 + cy, String.fromCharCode(0x2800 + bits), { fg: color });
    }
  }
}
