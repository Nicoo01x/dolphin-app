// Los íconos de Dolphin a partir del logo (dolphin-blanco-512.png), sin dependencias:
// - el contorno trazado a SVG (marching squares + Ramer-Douglas-Peucker);
// - el ícono de la app (delfín blanco sobre un cuadrado casi negro con esquinas redondeadas)
//   en PNG de cualquier tamaño, y el .ico de Windows con varios tamaños adentro;
// - la plantilla de la barra de menú de macOS (silueta negra sobre transparente).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname } from "node:path";

const ORIGEN = new URL("../ui/public/dolphin-blanco-512.png", import.meta.url);

/* ── PNG ─────────────────────────────────────────────────────────── */

function leerPng(ruta) {
  const b = readFileSync(ruta);
  let ancho = 0;
  let alto = 0;
  const idat = [];
  for (let o = 8; o < b.length; ) {
    const n = b.readUInt32BE(o);
    const tipo = b.toString("ascii", o + 4, o + 8);
    if (tipo === "IHDR") {
      ancho = b.readUInt32BE(o + 8);
      alto = b.readUInt32BE(o + 12);
      if (b[o + 16] !== 8 || b[o + 17] !== 6 || b[o + 20] !== 0) throw new Error("solo RGBA de 8 bits sin entrelazar");
    }
    if (tipo === "IDAT") idat.push(b.subarray(o + 8, o + 8 + n));
    o += 12 + n;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * 4;
  const datos = new Uint8Array(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let x = 0; x < fila; x++) {
      const a = x >= 4 ? datos[y * fila + x - 4] : 0;
      const up = y > 0 ? datos[(y - 1) * fila + x] : 0;
      const c = x >= 4 && y > 0 ? datos[(y - 1) * fila + x - 4] : 0;
      let pr = 0;
      if (filtro === 1) pr = a;
      else if (filtro === 2) pr = up;
      else if (filtro === 3) pr = (a + up) >> 1;
      else if (filtro === 4) {
        const p = a + up - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - up), Math.abs(p - c)];
        pr = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      datos[y * fila + x] = (crudo[y * (fila + 1) + 1 + x] + pr) & 255;
    }
  }
  return { datos, ancho, alto };
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function escribirPng(rgba, ancho, alto) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const filas = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    filas[y * (ancho * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * ancho * 4, ancho * 4).copy(filas, y * (ancho * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque("IHDR", ihdr),
    bloque("IDAT", deflateSync(filas, { level: 9 })),
    bloque("IEND", Buffer.alloc(0)),
  ]);
}

/* ── el logo como máscara ───────────────────────────────────────── */

const png = leerPng(ORIGEN);
const W = png.ancho;
const H = png.alto;
const alfa = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) alfa[i] = png.datos[i * 4 + 3] / 255;
let x0 = W, x1 = 0, y0 = H, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (alfa[y * W + x] < 0.5) continue;
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
const cajaAncho = x1 - x0 + 1;
const cajaAlto = y1 - y0 + 1;

/** La máscara en (x, y) del PNG, con interpolación bilineal. */
function muestra(x, y) {
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = (xx, yy) => alfa[Math.min(H - 1, yy) * W + Math.min(W - 1, xx)];
  return (a(ix, iy) * (1 - fx) + a(ix + 1, iy) * fx) * (1 - fy) + (a(ix, iy + 1) * (1 - fx) + a(ix + 1, iy + 1) * fx) * fy;
}

/** Cobertura del logo en un píxel de destino, con supermuestreo (4×4) para que achicado no se pixele. */
function cobertura(px, py, escala, ox, oy) {
  let suma = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const dx = px + (sx + 0.5) / 4;
    const dy = py + (sy + 0.5) / 4;
    suma += muestra(x0 + (dx - ox) / escala, y0 + (dy - oy) / escala);
  }
  return suma / 16;
}

/* ── el ícono de la app ─────────────────────────────────────────── */

const FONDO = [0x0d, 0x0e, 0x10];
const CELESTE = [0xa8, 0xcd, 0xea];

/**
 * El ícono a `lado` px: cuadrado casi negro con radio de 22 % (redondeado a la manera de los
 * íconos de hoy), el delfín blanco ocupando el 74 % del ancho, un poco arriba del centro
 * óptico. `marca` agrega un punto celeste abajo a la derecha (la versión de desarrollo).
 */
function icono(lado, { marca = false, delfin = [255, 255, 255], margen = 0.04, fondo: FONDO = [0x0d, 0x0e, 0x10] } = {}) {
  const rgba = new Uint8ClampedArray(lado * lado * 4);
  const borde = lado * margen;
  const caja = lado - 2 * borde;
  const radio = caja * 0.22;
  const escala = Math.min((caja * 0.74) / cajaAncho, (caja * 0.62) / cajaAlto);
  const ox = (lado - cajaAncho * escala) / 2;
  const oy = (lado - cajaAlto * escala) / 2 - caja * 0.02;
  const puntoX = lado - borde - caja * 0.2;
  const puntoY = lado - borde - caja * 0.2;
  const puntoR = caja * 0.09;
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      // El cuadrado redondeado, con borde suavizado por distancia firmada.
      const cx = Math.max(borde + radio - (px + 0.5), 0, px + 0.5 - (lado - borde - radio));
      const cy = Math.max(borde + radio - (py + 0.5), 0, py + 0.5 - (lado - borde - radio));
      const distancia = Math.hypot(cx, cy) - radio;
      const fondo = Math.min(1, Math.max(0, 0.5 - distancia));
      if (fondo <= 0) continue;
      const d = cobertura(px, py, escala, ox, oy);
      let color = FONDO.map((f, k) => f + (delfin[k] - f) * d);
      if (marca) {
        const m = Math.min(1, Math.max(0, puntoR - Math.hypot(px + 0.5 - puntoX, py + 0.5 - puntoY) + 0.5));
        color = color.map((c, k) => c + (CELESTE[k] - c) * m);
      }
      const i = (py * lado + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = fondo * 255;
    }
  }
  return escribirPng(rgba, lado, lado);
}

/** La silueta sola, negra sobre transparente (las plantillas de macOS usan solo el alfa). */
function plantilla(ancho, alto) {
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  const escala = Math.min(ancho / cajaAncho, alto / cajaAlto);
  const ox = (ancho - cajaAncho * escala) / 2;
  const oy = (alto - cajaAlto * escala) / 2;
  for (let py = 0; py < alto; py++) for (let px = 0; px < ancho; px++) {
    const i = (py * ancho + px) * 4;
    rgba[i + 3] = cobertura(px, py, escala, ox, oy) * 255;
  }
  return escribirPng(rgba, ancho, alto);
}

/** Un .ico con PNG adentro (Windows Vista en adelante los lee así). */
function ico(tamanos, hacer) {
  const imagenes = tamanos.map((t) => hacer(t));
  const cabecera = Buffer.alloc(6 + 16 * tamanos.length);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(tamanos.length, 4);
  let desplazamiento = cabecera.length;
  tamanos.forEach((t, k) => {
    const e = 6 + 16 * k;
    cabecera[e] = t >= 256 ? 0 : t;
    cabecera[e + 1] = t >= 256 ? 0 : t;
    cabecera.writeUInt16LE(1, e + 4);
    cabecera.writeUInt16LE(32, e + 6);
    cabecera.writeUInt32LE(imagenes[k].length, e + 8);
    cabecera.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += imagenes[k].length;
  });
  return Buffer.concat([cabecera, ...imagenes]);
}

/** Un .icns de macOS con PNG adentro (tipos ic07 a ic10: 128, 256, 512 y 1024). */
function icns(hacer) {
  const entradas = [["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]].map(([tipo, t]) => {
    const datos = hacer(t);
    const cabecera = Buffer.alloc(8);
    cabecera.write(tipo, 0, "ascii");
    cabecera.writeUInt32BE(datos.length + 8, 4);
    return Buffer.concat([cabecera, datos]);
  });
  const cuerpo = Buffer.concat(entradas);
  const cabecera = Buffer.alloc(8);
  cabecera.write("icns", 0, "ascii");
  cabecera.writeUInt32BE(cuerpo.length + 8, 4);
  return Buffer.concat([cabecera, cuerpo]);
}

/* ── el contorno a SVG ──────────────────────────────────────────── */

/** Marching squares sobre la máscara (umbral 0,5): devuelve los anillos cerrados del contorno. */
function contornos() {
  const dentro = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : alfa[y * W + x]);
  const segmentos = [];
  const interp = (a, b) => (0.5 - a) / (b - a);
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const a = dentro(x, y);
      const b = dentro(x + 1, y);
      const c = dentro(x + 1, y + 1);
      const d = dentro(x, y + 1);
      const caso = (a > 0.5 ? 8 : 0) | (b > 0.5 ? 4 : 0) | (c > 0.5 ? 2 : 0) | (d > 0.5 ? 1 : 0);
      if (caso === 0 || caso === 15) continue;
      const arriba = [x + interp(a, b), y];
      const derecha = [x + 1, y + interp(b, c)];
      const abajo = [x + interp(d, c), y + 1];
      const izquierda = [x, y + interp(a, d)];
      const pares = {
        1: [[izquierda, abajo]], 2: [[abajo, derecha]], 3: [[izquierda, derecha]], 4: [[derecha, arriba]],
        5: [[izquierda, arriba], [derecha, abajo]], 6: [[abajo, arriba]], 7: [[izquierda, arriba]], 8: [[arriba, izquierda]],
        9: [[arriba, abajo]], 10: [[arriba, derecha], [abajo, izquierda]], 11: [[arriba, derecha]], 12: [[derecha, izquierda]],
        13: [[derecha, abajo]], 14: [[abajo, izquierda]],
      }[caso];
      // Todos orientados con lo opaco del mismo lado, o no se encadenan: el lado lo decide
      // el producto cruz contra las cuatro esquinas, pesado por cuánto está cada una adentro.
      const esquinas = [[x, y, a], [x + 1, y, b], [x + 1, y + 1, c], [x, y + 1, d]];
      for (const [p, q] of pares) {
        let lado = 0;
        for (const [ex, ey, v] of esquinas) lado += (v - 0.5) * ((q[0] - p[0]) * (ey - p[1]) - (q[1] - p[1]) * (ex - p[0]));
        segmentos.push(lado >= 0 ? [p, q] : [q, p]);
      }
    }
  }
  // Unir los segmentos en anillos por sus extremos.
  const clave = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const desde = new Map();
  for (const s of segmentos) desde.set(clave(s[0]), s);
  const usados = new Set();
  const anillos = [];
  for (const s of segmentos) {
    if (usados.has(s)) continue;
    const anillo = [s[0]];
    let actual = s;
    while (actual && !usados.has(actual)) {
      usados.add(actual);
      anillo.push(actual[1]);
      actual = desde.get(clave(actual[1]));
    }
    if (anillo.length > 8) anillos.push(anillo);
  }
  return anillos;
}

/** Ramer-Douglas-Peucker sobre un anillo cerrado. */
function simplificar(puntos, eps) {
  if (puntos.length < 3) return puntos;
  const [a, b] = [puntos[0], puntos[puntos.length - 1]];
  let lejos = 0;
  let indice = 0;
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < puntos.length - 1; i++) {
    const p = puntos[i];
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / largo;
    if (d > lejos) {
      lejos = d;
      indice = i;
    }
  }
  if (lejos <= eps) return [a, b];
  return [...simplificar(puntos.slice(0, indice + 1), eps).slice(0, -1), ...simplificar(puntos.slice(indice), eps)];
}

/** Un anillo cerrado empieza y termina en el mismo punto: RDP no tiene base. Se parte en el punto más lejano. */
function simplificarAnillo(anillo, eps) {
  let lejos = 0;
  let k = 0;
  anillo.forEach(([x, y], i) => {
    const d = Math.hypot(x - anillo[0][0], y - anillo[0][1]);
    if (d > lejos) {
      lejos = d;
      k = i;
    }
  });
  return [...simplificar(anillo.slice(0, k + 1), eps), ...simplificar(anillo.slice(k), eps).slice(1)];
}

function svg(color) {
  const anillos = contornos().map((r) => simplificarAnillo(r, 0.45));
  const m = 2;
  const caminos = anillos
    .map((r) => "M" + r.slice(0, -1).map(([x, y]) => `${(x - x0 + m).toFixed(1)} ${(y - y0 + m).toFixed(1)}`).join("L") + "Z")
    .join("");
  const vw = cajaAncho + 2 * m;
  const vh = cajaAlto + 2 * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}"><path fill="${color}" fill-rule="evenodd" d="${caminos}"/></svg>\n`;
}

/* ── salida ─────────────────────────────────────────────────────── */

const [destino, ...pedidos] = process.argv.slice(2);
if (!destino) {
  console.error("uso: node iconos.mjs <carpeta de salida>");
  process.exit(1);
}
const guardar = (ruta, datos) => {
  mkdirSync(dirname(`${destino}/${ruta}`), { recursive: true });
  writeFileSync(`${destino}/${ruta}`, datos);
  console.log(`${ruta}  ${datos.length} bytes`);
};
guardar("dolphin.svg", svg("#ffffff"));
guardar("dolphin-negro.svg", svg("#0d0e10"));
guardar("icon-1024.png", icono(1024));
guardar("icon-256.png", icono(256));
guardar("icon-dev-256.png", icono(256, { marca: true }));
guardar("icon-celeste-1024.png", icono(1024, { delfin: CELESTE }));
guardar("icon-claro-1024.png", icono(1024, { fondo: CELESTE, delfin: [0x0d, 0x0e, 0x10] }));
guardar("icon.icns", icns((t) => icono(t)));
guardar("icon.ico", ico([16, 24, 32, 48, 64, 128, 256], (t) => icono(t, { margen: t <= 32 ? 0 : 0.04 })));
guardar("plantilla-22x14.png", plantilla(22, 14));
guardar("plantilla-44x28.png", plantilla(44, 28));
void pedidos;
