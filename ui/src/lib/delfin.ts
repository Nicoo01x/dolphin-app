/**
 * La coreografía del delfín de símbolos, sin pantalla: de qué está hecho
 * (la silueta del logo, con la aleta de la cola y la del pecho separadas
 * para que se muevan solas), por dónde nada y dónde queda cada símbolo en
 * cada cuadro. El componente (components/Delfin.tsx) solo lo pinta; lo que
 * está acá se prueba sin navegador.
 *
 * Cada pasada cruza la pantalla de un borde al otro con una figura:
 * - saltos: de uno a tres, a la misma distancia;
 * - acercarse: sale chiquito del horizonte y llega enorme al frente;
 * - alto: un salto solo, alto y cerca.
 * En el aire el cuerpo sigue el arco (sube con la nariz arriba, cae de
 * nariz) y nada más: sin vueltas. La silueta es plana, y hacerla rodar
 * como una rueda o aplastarla como una carta que se da vuelta se veía
 * falso (Nico, 22/10: «muy falsa la vuelta del delfín»).
 * La profundidad usa la misma perspectiva que el mar de puntos: más lejos
 * es más chico, más lento y con el agua más cerca del horizonte.
 */

/** El logo como máscara: los píxeles RGBA y la caja de lo opaco (el PNG tiene márgenes). */
export interface Logo {
  readonly datos: Uint8ClampedArray | Uint8Array;
  readonly ancho: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface Punto {
  readonly x: number;
  readonly y: number;
}

/** Las partes que se mueven solas. */
export const CUERPO = 0;
export const PEDUNCULO = 1;
export const CAUDAL = 2;
export const PECTORAL = 3;

/** La silueta a escala 1, centrada en su caja y mirando a la derecha, como el logo. */
export interface Forma {
  /** El alto con que se muestreó, en px. */
  readonly alto: number;
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  /** Qué es cada punto: CUERPO, PEDUNCULO, CAUDAL o PECTORAL. */
  readonly parte: Uint8Array;
  /** Cuánto dobla cada punto del pedúnculo: 1 junto a la cola, 0 donde empieza el cuerpo. */
  readonly peso: Float32Array;
  /** Hasta dónde llega desde el centro, con lugar para la cola en su punto más abierto. */
  readonly radio: number;
  /** La punta del hocico y la de la cola (índices). */
  readonly hocico: number;
  readonly cola: number;
  /** Dónde se engancha la aleta de la cola, alrededor de qué dobla el pedúnculo y dónde nace la del pecho. */
  readonly bisagra: Punto;
  readonly pivote: Punto;
  readonly raiz: Punto;
}

export type Figura = "saltos" | "acercarse" | "alto";

/** Un salto, en px de recorrido: dónde sale del agua, dónde vuelve a entrar y cuánto sube el centro. */
export interface Salto {
  readonly sale: number;
  readonly entra: number;
  altura: number;
}

/** Una pasada de un borde de la pantalla al otro. */
export interface Pasada {
  readonly figura: Figura;
  /** 1: nada hacia la derecha, como el logo; -1: hacia la izquierda, en espejo. */
  readonly dir: 1 | -1;
  /** El lienzo cuando arrancó: si cambia mucho, la pasada ya no entra y se corta. */
  readonly ancho: number;
  readonly alto: number;
  /** La profundidad al entrar y al salir: 0 es la fila de adelante del mar, ~0,7 casi el horizonte; negativa, más cerca todavía. */
  readonly z0: number;
  readonly z1: number;
  readonly forma: Forma;
  /** Lo que recorre fuera de la pantalla antes de asomar. */
  readonly entrada: number;
  readonly largo: number;
  /** px/s a escala 1. */
  readonly velocidad: number;
  readonly saltos: Salto[];
  /** Lo recorrido, en px. */
  s: number;
  /** La cola: en qué punto del aleteo va y con cuánta fuerza (más bajo el agua). */
  fase: number;
  aleteo: number;
  /** Dónde estaban el hocico y la cola el cuadro anterior (para saber cuándo cruzan el agua) y el goteo acumulado. */
  hocicoAntes: number;
  colaAntes: number;
  goteo: number;
}

/** Dónde y cómo está el delfín en un punto del recorrido. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly agua: number;
  readonly escala: number;
  /** Cuánto gira el cuerpo: con la trayectoria, nada más. */
  readonly angulo: number;
  readonly enElAire: boolean;
}

/** Lo más cerca que llega del borde de arriba, en px. */
export const TECHO = 16;
/** El aleteo más fuerte (bajo el agua): el techo se calcula con la cola en su punto más abierto. */
const ALETEO_MAXIMO = 0.45;
/** Lo opaco del logo: el borde antialiaseado no cuenta. */
const UMBRAL = 140;

const acotar = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const suave = (x: number) => x * x * (3 - 2 * x);
/** Lo más rápido que gira bajo el agua, en rad/s: más, y se ve un tirón aunque esté hundido. */
const GIRO_BAJO_EL_AGUA = 5;
/** La perspectiva del mar de puntos: horizonte en la mitad de la pantalla. */
const perspectiva = (z: number) => 1 / (1 + z * 2.6);
/** Cuánto más grande se ve a la profundidad z que a la de referencia (0,2). */
export const escalaA = (z: number) => perspectiva(z) / perspectiva(0.2);
/** La superficie a la profundidad z: la fila del mar de puntos a esa distancia; lo más cerca, al pie de la pantalla. */
export const aguaA = (z: number, alto: number) => Math.min(alto * 0.97, alto * (0.5 + 0.5 * Math.pow(Math.max(0, 1 - z), 1.6)));
/** La profundidad en el recorrido: llega a la final cuando asoma por el otro borde, no cuando ya se fue. */
export const zEn = (p: Pasada, s: number) => p.z0 + (p.z1 - p.z0) * suave(acotar(s / (p.entrada + p.ancho)));

/** La caja de lo opaco: el PNG trae margen alrededor del delfín. */
export function medirLogo(datos: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): Logo | null {
  let x0 = ancho;
  let x1 = 0;
  let y0 = alto;
  let y1 = 0;
  for (let y = 0; y < alto; y += 2) {
    for (let x = 0; x < ancho; x += 2) {
      if ((datos[(y * ancho + x) * 4 + 3] ?? 0) <= UMBRAL) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 > x0 && y1 > y0 ? { datos, ancho, x0, x1, y0, y1 } : null;
}

/** Las partes del logo píxel a píxel (dentro de su caja), medidas una vez por logo. */
const partesPorLogo = new WeakMap<Logo, Uint8Array>();

/**
 * Qué parte es cada píxel opaco del logo. Se mira a resolución completa y
 * no en la grilla de los símbolos: con el paso de un delfín de 150 px, la
 * aleta de la cola queda pegada al cuerpo por un vecino en diagonal.
 * - La aleta de la cola es la segunda pieza suelta del logo.
 * - La del pecho es el tramo de abajo en las columnas del cuerpo que tienen
 *   dos, cuando es más fino que el de arriba: la punta curva de la dorsal
 *   también deja columnas con hueco, pero ahí el de abajo es el lomo, más
 *   grueso. De lo que queda, el grupo más grande.
 */
function partesDe(logo: Logo): Uint8Array {
  const guardadas = partesPorLogo.get(logo);
  if (guardadas) return guardadas;
  const w = logo.x1 - logo.x0 + 1;
  const h = logo.y1 - logo.y0 + 1;
  const opaco = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) opaco[y * w + x] = (logo.datos[((y + logo.y0) * logo.ancho + x + logo.x0) * 4 + 3] ?? 0) > UMBRAL ? 1 : 0;
  }

  // Las piezas sueltas, con vecinos en las ocho direcciones.
  const padre = new Int32Array(w * h).map((_, i) => i);
  const raiz = (i: number): number => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]!]!;
      i = padre[i]!;
    }
    return i;
  };
  const unir = (a: number, b: number) => {
    if (opaco[b]) padre[raiz(a)] = raiz(b);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!opaco[i]) continue;
      if (x + 1 < w) unir(i, i + 1);
      if (y + 1 < h) {
        unir(i, i + w);
        if (x > 0) unir(i, i + w - 1);
        if (x + 1 < w) unir(i, i + w + 1);
      }
    }
  }
  const tamanos = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (!opaco[i]) continue;
    total++;
    tamanos.set(raiz(i), (tamanos.get(raiz(i)) ?? 0) + 1);
  }
  const piezas = [...tamanos.entries()].sort((a, b) => b[1] - a[1]);
  const principal = piezas[0]?.[0] ?? -1;
  const suelta = piezas[1] && piezas[1][1] >= total * 0.04 ? piezas[1][0] : -1;
  const parte = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (opaco[i] && raiz(i) === suelta) parte[i] = CAUDAL;

  // La aleta del pecho.
  const candidato = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const tramos: [number, number][] = [];
    let desde = -1;
    for (let y = 0; y <= h; y++) {
      const dentro = y < h && opaco[y * w + x] === 1 && raiz(y * w + x) === principal;
      if (dentro && desde < 0) desde = y;
      if (!dentro && desde >= 0) {
        tramos.push([desde, y - 1]);
        desde = -1;
      }
    }
    const abajo = tramos.at(-1);
    const arriba = tramos.at(-2);
    if (!abajo || !arriba || abajo[1] - abajo[0] >= arriba[1] - arriba[0]) continue;
    for (let y = abajo[0]; y <= abajo[1]; y++) candidato[y * w + x] = 1;
  }
  let pecho: number[] = [];
  const visto = new Uint8Array(w * h);
  for (let inicio = 0; inicio < w * h; inicio++) {
    if (!candidato[inicio] || visto[inicio]) continue;
    visto[inicio] = 1;
    const grupo = [inicio];
    for (let k = 0; k < grupo.length; k++) {
      const i = grupo[k]!;
      const [x, y] = [i % w, Math.floor(i / w)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * w + x + dx;
          if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h || !candidato[j] || visto[j]) continue;
          visto[j] = 1;
          grupo.push(j);
        }
      }
    }
    if (grupo.length > pecho.length) pecho = grupo;
  }
  // Solo si parece una aleta: ni un puñado de píxeles ni medio delfín.
  if (pecho.length >= total * 0.05 && pecho.length <= total * 0.4) for (const i of pecho) parte[i] = PECTORAL;

  partesPorLogo.set(logo, parte);
  return parte;
}

/**
 * La silueta del logo con el delfín de `alto` px: un punto cada `paso` px
 * donde el logo es opaco, cada uno con su parte (ver `partesDe`). El
 * pedúnculo es lo del cuerpo que está cerca de donde se engancha la cola.
 */
export function formaDelLogo(logo: Logo, alto: number, paso = 5): Forma | null {
  const escala = alto / (logo.y1 - logo.y0);
  const salto = Math.max(1, Math.round(paso / escala));
  const cx = (logo.x0 + logo.x1) / 2;
  const cy = (logo.y0 + logo.y1) / 2;
  const partes = partesDe(logo);
  const ancho = logo.x1 - logo.x0 + 1;
  const gx: number[] = [];
  const gy: number[] = [];
  const etiqueta: number[] = [];
  for (let y = logo.y0; y <= logo.y1; y += salto) {
    for (let x = logo.x0; x <= logo.x1; x += salto) {
      if ((logo.datos[(y * logo.ancho + x) * 4 + 3] ?? 0) <= UMBRAL) continue;
      gx.push(x);
      gy.push(y);
      etiqueta.push(partes[(y - logo.y0) * ancho + x - logo.x0] ?? CUERPO);
    }
  }
  const n = gx.length;
  if (n === 0) return null;
  const parte = Uint8Array.from(etiqueta);
  const suelta = parte.includes(CAUDAL);

  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (gx[i]! - cx) * escala;
    ys[i] = (gy[i]! - cy) * escala;
  }
  /** Donde se tocan dos partes: el punto medio del par más cercano. */
  const union = (a: number, b: number): Punto | null => {
    let mejor = Number.POSITIVE_INFINITY;
    let punto: Punto | null = null;
    for (let i = 0; i < n; i++) {
      if (parte[i] !== a) continue;
      for (let j = 0; j < n; j++) {
        if (parte[j] !== b) continue;
        const d = (xs[i]! - xs[j]!) ** 2 + (ys[i]! - ys[j]!) ** 2;
        if (d < mejor) {
          mejor = d;
          punto = { x: (xs[i]! + xs[j]!) / 2, y: (ys[i]! + ys[j]!) / 2 };
        }
      }
    }
    return punto;
  };
  const extremo = (signo: 1 | -1, de: (i: number) => boolean) => {
    let mejor = -1;
    for (let i = 0; i < n; i++) if (de(i) && (mejor < 0 || xs[i]! * signo > xs[mejor]! * signo)) mejor = i;
    return mejor;
  };
  const hocico = extremo(1, (i) => parte[i] !== CAUDAL);
  const cola = extremo(-1, (i) => !suelta || parte[i] === CAUDAL);
  const raiz = union(PECTORAL, CUERPO) ?? { x: xs[hocico]!, y: ys[hocico]! };

  // El pedúnculo dobla alrededor de un punto camino al centro; más cuanto más cerca de la cola.
  const bisagra = union(CAUDAL, CUERPO) ?? { x: xs[cola]!, y: ys[cola]! };
  const alcance = alto * 0.38;
  const hastaElCentro = Math.hypot(bisagra.x, bisagra.y) || 1;
  const pivote = { x: bisagra.x - (bisagra.x / hastaElCentro) * alcance, y: bisagra.y - (bisagra.y / hastaElCentro) * alcance };
  const peso = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (parte[i] !== CUERPO) continue;
    const d = Math.hypot(xs[i]! - bisagra.x, ys[i]! - bisagra.y);
    if (d >= alcance) continue;
    parte[i] = PEDUNCULO;
    peso[i] = Math.pow(1 - d / alcance, 1.2);
  }

  let radio = 0;
  for (let i = 0; i < n; i++) radio = Math.max(radio, Math.hypot(xs[i]!, ys[i]!));
  return { alto, xs, ys, parte, peso, radio: radio + alto * 0.12, hocico, cola, bisagra, pivote, raiz };
}

/**
 * Cuánto sube el centro sobre el agua (negativo: hundido) en el recorrido
 * `s`, y cómo cambia. En el aire, la parábola de un tiro; bajo el agua,
 * curvas de Hermite que empalman la pendiente con la que entró con la que
 * va a salir, así el cuerpo nunca pega un tirón en la superficie. Al entrar
 * y al salir de la pantalla va hundido: que no asome por el borde.
 */
export function elevacion(p: Pasada, s: number): { altura: number; pendiente: number } {
  let antes: Salto | undefined;
  let despues: Salto | undefined;
  for (const salto of p.saltos) {
    if (s >= salto.sale && s <= salto.entra) {
      const tramo = salto.entra - salto.sale;
      const u = (s - salto.sale) / tramo;
      return { altura: 4 * salto.altura * u * (1 - u), pendiente: (4 * salto.altura * (1 - 2 * u)) / tramo };
    }
    if (salto.entra < s) antes = salto;
    else despues ??= salto;
  }
  const desde = antes?.entra ?? 0;
  const hasta = despues?.sale ?? p.largo;
  const hondo = (en: number) => -(p.forma.radio * escalaA(zEn(p, en)) + 12);
  const e0 = antes ? 0 : hondo(desde);
  const e1 = despues ? 0 : hondo(hasta);
  const m0 = antes ? (-4 * antes.altura) / (antes.entra - antes.sale) : 0;
  const m1 = despues ? (4 * despues.altura) / (despues.entra - despues.sale) : 0;
  const tramo = Math.max(1, hasta - desde);
  const t = acotar((s - desde) / tramo);
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    altura: e0 * (2 * t3 - 3 * t2 + 1) + e1 * (3 * t2 - 2 * t3) + tramo * (m0 * (t3 - 2 * t2 + t) + m1 * (t3 - t2)),
    pendiente: ((e1 - e0) * (6 * t - 6 * t2)) / tramo + m0 * (3 * t2 - 4 * t + 1) + m1 * (3 * t2 - 2 * t),
  };
}

/** Dónde y cómo está el delfín en el recorrido `s`. */
export function pose(p: Pasada, s: number): Pose {
  const z = zEn(p, s);
  const agua = aguaA(z, p.alto);
  const e = elevacion(p, s);
  // La superficie también se mueve cuando se acerca: entra en la pendiente.
  const pendiente = (aguaA(zEn(p, s + 1), p.alto) - aguaA(zEn(p, s - 1), p.alto)) / 2 - e.pendiente;
  return {
    x: p.dir === 1 ? s - p.entrada : p.ancho + p.entrada - s,
    y: agua - e.altura,
    agua,
    escala: escalaA(z),
    // Gira con la trayectoria, un poco menos: el logo ya viene curvado.
    angulo: Math.atan(pendiente) * 0.9 * p.dir,
    enElAire: e.altura > 0,
  };
}

/**
 * Dónde va cada símbolo en este cuadro (x e y intercalados): la forma con
 * la cola y la aleta del pecho en su fase, girada y escalada según la pose.
 * La aleta de la cola gira en la bisagra un poco después que el pedúnculo
 * (el latigazo), y el pedúnculo dobla más cerca de la cola.
 */
export function posar(p: Pasada, q: Pose, lugares: Float32Array): void {
  const f = p.forma;
  const golpe = p.aleteo * 0.35 * Math.sin(p.fase);
  const latigo = p.aleteo * 1.15 * Math.sin(p.fase - 0.9);
  const pecho = 0.2 * Math.sin(p.fase * 0.6 + 1);
  const cosA = Math.cos(q.angulo);
  const sinA = Math.sin(q.angulo);
  const cosL = Math.cos(latigo);
  const sinL = Math.sin(latigo);
  const cosG = Math.cos(golpe);
  const sinG = Math.sin(golpe);
  const cosP = Math.cos(pecho);
  const sinP = Math.sin(pecho);
  const { bisagra, pivote, raiz } = f;
  for (let i = 0; i < f.xs.length; i++) {
    let x = f.xs[i]!;
    let y = f.ys[i]!;
    const parte = f.parte[i];
    if (parte === CAUDAL) {
      const dx = x - bisagra.x;
      const dy = y - bisagra.y;
      x = bisagra.x + dx * cosL - dy * sinL;
      y = bisagra.y + dx * sinL + dy * cosL;
    }
    if (parte === CAUDAL || parte === PEDUNCULO) {
      // La aleta va con la punta del pedúnculo; el pedúnculo, según lo cerca que esté de ella.
      const cos = parte === CAUDAL ? cosG : Math.cos(golpe * f.peso[i]!);
      const sin = parte === CAUDAL ? sinG : Math.sin(golpe * f.peso[i]!);
      const dx = x - pivote.x;
      const dy = y - pivote.y;
      x = pivote.x + dx * cos - dy * sin;
      y = pivote.y + dx * sin + dy * cos;
    } else if (parte === PECTORAL) {
      const dx = x - raiz.x;
      const dy = y - raiz.y;
      x = raiz.x + dx * cosP - dy * sinP;
      y = raiz.y + dx * sinP + dy * cosP;
    }
    const bx = x * p.dir * q.escala;
    const by = y * q.escala;
    lugares[i * 2] = q.x + bx * cosA - by * sinA;
    lugares[i * 2 + 1] = q.y + bx * sinA + by * cosA;
  }
}

/** El punto más alto de la silueta en `s`, con la cola en cualquier punto de su aleteo más fuerte y el medio símbolo de arriba. */
export function topeEn(p: Pasada, s: number, lugares: Float32Array): number {
  const q = pose(p, s);
  const { fase, aleteo } = p;
  p.aleteo = ALETEO_MAXIMO;
  let tope = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 6; k++) {
    p.fase = (Math.PI * 2 * k) / 6;
    posar(p, q, lugares);
    for (let i = 1; i < lugares.length; i += 2) tope = Math.min(tope, lugares[i]!);
  }
  p.fase = fase;
  p.aleteo = aleteo;
  return tope - 4 * q.escala - 3;
}

/**
 * Arma una pasada con su figura: cuántos saltos y dónde, a qué distancia, y
 * el techo, que se ajusta salto por salto hasta que ningún punto de la
 * silueta (girada, dando la vuelta, con la cola abierta) pase del borde de
 * arriba. `aleatorio` es para los tests.
 */
export function nuevaPasada(
  forma: Forma,
  figura: Figura,
  ancho: number,
  alto: number,
  dir: 1 | -1,
  aleatorio: () => number = Math.random,
): Pasada {
  const azar = (desde: number, hasta: number) => desde + aleatorio() * (hasta - desde);
  let z0 = azar(0.12, 0.55);
  let z1 = z0;
  if (figura === "acercarse") {
    z0 = azar(0.55, 0.7);
    z1 = azar(-0.18, -0.08);
  } else if (figura === "alto") {
    z0 = z1 = azar(0, 0.25);
  }
  const entrada = forma.radio * escalaA(z0) + 24;
  const p: Pasada = {
    figura,
    dir,
    ancho,
    alto,
    z0,
    z1,
    forma,
    entrada,
    largo: ancho + entrada + forma.radio * escalaA(z1) + 24,
    velocidad: azar(300, 350),
    saltos: [],
    s: 0,
    fase: azar(0, Math.PI * 2),
    aleteo: 0.3,
    hocicoAntes: Number.NaN,
    colaAntes: Number.NaN,
    goteo: 0,
  };
  const visible = (fraccion: number) => entrada + ancho * fraccion;
  /**
   * Cuánto nada bajo el agua entre dos saltos (de alturas relativas `a` y
   * `b`) en `s`. Ahí da la vuelta de entrar a salir: el giro depende de las
   * dos pendientes y de lo rápido que va, así que el hueco sale de eso y no
   * del largo del salto (medido en largos, con un delfín grande quedaba
   * enorme; con uno chico y empinado, medio giro en un cuadro).
   */
  const hueco = (a: number, b: number, s: number, tramo: number) =>
    Math.max(0.35 * tramo, (4 * (a + b) * p.velocidad * Math.pow(escalaA(zEn(p, s)), 0.6)) / GIRO_BAJO_EL_AGUA) * azar(1, 1.25);

  if (figura === "alto") {
    // Un solo salto, por el medio y tan alto como deje el techo, pero no a pique: con el salto
    // más alto que 0,8 veces su largo sale del agua como un cohete.
    const tramo = acotar(ancho * azar(0.42, 0.6), 240, 900);
    const centro = visible(acotar(azar(0.32, 0.68), tramo / 2 / ancho, 1 - tramo / 2 / ancho));
    p.saltos.push({ sale: centro - tramo / 2, entra: centro + tramo / 2, altura: Math.min(aguaA(z0, alto), tramo * 0.8) });
  } else if (figura === "acercarse") {
    // De atrás para adelante: el último salto, el más grande, cae justo antes del borde y es el
    // cierre. Todos con el mismo largo base: lo que los hace crecer es la distancia.
    const base = azar(190, 250);
    let cursor = visible(azar(0.9, 0.97));
    let alta = azar(0.4, 0.55);
    for (let k = 0; k < 5; k++) {
      // El tamaño que le toca por la distancia, medido en el medio del salto.
      const tramo = base * escalaA(zEn(p, cursor - (base * escalaA(zEn(p, cursor))) / 2));
      if (cursor - tramo < visible(0.03)) break;
      p.saltos.unshift({ sale: cursor - tramo, entra: cursor, altura: tramo * alta });
      const anterior = azar(0.4, 0.55);
      cursor -= tramo + hueco(anterior, alta, cursor - tramo, tramo);
      alta = anterior;
    }
  } else {
    // En fila, a la misma distancia.
    const cuantos = 1 + Math.floor(aleatorio() * acotar(Math.floor(ancho / 480), 1, 3));
    let cursor = visible(azar(0.02, 0.18));
    let alta = azar(0.32, 0.6);
    for (let k = 0; k < cuantos; k++) {
      const tramo = acotar(ancho * azar(0.2, 0.32), 200, 520) * escalaA(zEn(p, cursor));
      if (cursor + tramo > visible(0.97)) break;
      p.saltos.push({ sale: cursor, entra: cursor + tramo, altura: tramo * alta });
      const siguiente = azar(0.32, 0.6);
      cursor += tramo + hueco(alta, siguiente, cursor + tramo, tramo);
      alta = siguiente;
    }
  }
  if (p.saltos.length === 0) {
    const tramo = ancho * 0.6;
    p.saltos.push({ sale: visible(0.2), entra: visible(0.2) + tramo, altura: tramo * 0.5 });
  }

  // El techo, salto por salto.
  const lugares = new Float32Array(forma.xs.length * 2);
  for (const salto of p.saltos) {
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      let peor = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 24; i++) peor = Math.min(peor, topeEn(p, salto.sale + ((salto.entra - salto.sale) * i) / 24, lugares));
      if (peor >= TECHO) break;
      salto.altura = Math.max(0, salto.altura - (TECHO - peor) - 1);
    }
  }
  return p;
}

/** Avanza la pasada: en pantalla va más rápido cuanto más cerca, y la cola aletea más fuerte y más seguido bajo el agua. */
export function avanzar(p: Pasada, dt: number): Pose {
  const antes = pose(p, p.s);
  p.s += p.velocidad * Math.pow(antes.escala, 0.6) * dt;
  const q = pose(p, p.s);
  p.aleteo += ((q.enElAire ? 0.16 : 0.42) - p.aleteo) * Math.min(1, dt * 3);
  p.fase += Math.PI * 2 * (q.enElAire ? 1.3 : 2.1) * dt;
  return q;
}

const PESOS: Readonly<Record<Figura, number>> = { saltos: 3, acercarse: 3, alto: 2 };

/** La figura siguiente: cualquiera menos la que acaba de hacer. */
export function otraFigura(anterior: Figura | null, aleatorio: () => number = Math.random): Figura {
  const opciones = (Object.keys(PESOS) as Figura[]).filter((f) => f !== anterior);
  let r = aleatorio() * opciones.reduce((suma, f) => suma + PESOS[f], 0);
  for (const f of opciones) {
    r -= PESOS[f];
    if (r < 0) return f;
  }
  return opciones[0]!;
}
