/**
 * El delfín pixel art, construido con geometría y rasterizado.
 *
 * Dibujarlo píxel por píxel a mano sale tiburón: la silueta de un delfín es toda curva —el lomo,
 * el melón, la dorsal que cae hacia atrás— y una grilla chica dibujada a ojo convierte esas curvas
 * en cuñas rectas. Acá la forma se define como lo que es (elipses y triángulos de una silueta) y
 * la grilla sale de preguntarle a esa forma, píxel por píxel, si está adentro.
 *
 * Escupe la matriz lista para pegar en `src/lib/pixeles.ts`. Se corre a mano cuando hay que
 * cambiar la forma, no en cada build: lo que entra al sitio se mira antes con los ojos.
 *
 *   node scripts/delfin-pixel.mjs [ancho] [alto]
 */

const ANCHO = Number(process.argv[2] ?? 40);
const ALTO = Number(process.argv[3] ?? 24);

/** Una elipse rotada: el cuerpo y el pedúnculo de la cola. */
const elipse = (cx, cy, rx, ry, grados = 0) => {
  const a = (grados * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * cos + dy * sen) / rx;
    const v = (-dx * sen + dy * cos) / ry;
    return u * u + v * v <= 1;
  };
};

/** Un triángulo por coordenadas baricéntricas: las aletas. */
const triangulo = (ax, ay, bx, by, cx, cy) => {
  const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  return (x, y) => {
    const s = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / d;
    const t = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / d;
    return s >= 0 && t >= 0 && s + t <= 1;
  };
};

// Todo en una grilla de 40×24 y después se escala: así los números se leen como un dibujo.
const E = 40 / ANCHO;
const en = (f) => (x, y) => f((x + 0.5) * E, ((y + 0.5) * ALTO * E) / 24 / (ALTO / 24) * (24 / ALTO) * (ALTO / 24) * E === 0 ? 0 : (y + 0.5) * (24 / ALTO));

const PARTES = [
  // El cuerpo: fusiforme y apenas inclinado, el morro más abajo que la nuca.
  elipse(20, 12.6, 13.5, 5.4, -7),
  // El melón: la frente redonda que separa al delfín de cualquier pez.
  elipse(30.5, 12, 4.4, 4),
  // El pico, corto y recto, saliendo del melón hacia abajo.
  triangulo(31, 12, 38.5, 13.8, 31, 15.2),
  // La dorsal, cayendo hacia atrás: la punta queda a la IZQUIERDA de su base, y es chica —una
  // vela grande y recta es de tiburón—.
  triangulo(21.5, 8.6, 14.5, 2.6, 15, 9.2),
  // La pectoral, corta y hacia atrás.
  triangulo(25, 15, 19, 20, 24, 16.8),
  // El pedúnculo y los dos lóbulos de la cola, con su muesca en el medio. Anchos a propósito: un
  // triángulo muy agudo se pierde en una grilla chica y el delfín queda sin cola.
  elipse(9, 13.4, 5.5, 2.4, 12),
  // Los lóbulos van como elipses y no como triángulos: un triángulo agudo en una grilla chica
  // queda en una línea de un píxel, y el delfín aparece con dos hilos en vez de cola.
  elipse(5.2, 10, 4.2, 1.5, -42),
  elipse(5.2, 17.4, 4.2, 1.5, 42),
];

const dentro = (x, y) => PARTES.some((p) => p(x, y));

/** La panza clara: la mitad de abajo del cuerpo, siguiendo su inclinación. */
const esPanza = (x, y) => y > 13.6 - (x - 20) * 0.1;

const filas = [];
for (let fy = 0; fy < ALTO; fy += 1) {
  let fila = "";
  for (let fx = 0; fx < ANCHO; fx += 1) {
    const x = ((fx + 0.5) * 40) / ANCHO;
    const y = ((fy + 0.5) * 24) / ALTO;
    fila += dentro(x, y) ? (esPanza(x, y) ? "c" : "o") : ".";
  }
  filas.push(fila);
}

// El ojo: adentro del melón, arriba y atrás del pico.
const ojoX = Math.round((30.5 * ANCHO) / 40);
const ojoY = Math.round((11.5 * ALTO) / 24);
if (filas[ojoY]?.[ojoX] && filas[ojoY][ojoX] !== ".") {
  filas[ojoY] = filas[ojoY].slice(0, ojoX) + "e" + filas[ojoY].slice(ojoX + 1);
}

const conTinta = (l) => /[oce]/.test(l);
const recortadas = filas.slice(filas.findIndex(conTinta), filas.length - [...filas].reverse().findIndex(conTinta));

console.log(`// ${ANCHO}×${recortadas.length} · generado por scripts/delfin-pixel.mjs`);
console.log("export const DELFIN: readonly string[] = [");
for (const l of recortadas) console.log(`  "${l}",`);
console.log("];");
