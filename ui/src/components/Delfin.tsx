import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { avanzar, formaDelLogo, medirLogo, nuevaPasada, otraFigura, posar, type Figura, type Forma, type Logo, type Pasada } from "@/lib/delfin";
import { quieto, useLienzo } from "./Mar";
import { coloresDeEscena } from "@/lib/embebida";

/**
 * El delfín hecho de símbolos de código, nadando por toda la pantalla.
 *
 * Cada pasada cruza de un borde al otro con una figura distinta (saltos en
 * fila, acercarse desde el horizonte hasta llegar enorme, un salto alto),
 * girando con la trayectoria y nada más, con la cola y la aleta del pecho
 * aleteando, y salpicando símbolos al salir y al entrar al agua. La
 * coreografía vive en lib/delfin.ts; acá solo se pinta. Va detrás de todo y
 * no se lleva el puntero. Con movimiento reducido queda quieto al costado de
 * la tarea, y si no hay costado no está.
 */

// Glifos llenos: «.» y «:» dejaban agujeros y la silueta se leía rala.
const GLIFOS = "{}<>/;=()[]+*#01%&$".split("");
const glifoAlAzar = () => GLIFOS[Math.floor(Math.random() * GLIFOS.length)]!;
// Los colores salen del tema (--escena, --escena-espuma en app.css): el celeste pastel del M2
// (pedido de Nico) en oscuro, uno más hondo en claro. Solo en el delfín, la marca.
/** Lo que tira para abajo a las gotas, en px/s². */
const GRAVEDAD = 900;

const azar = (desde: number, hasta: number) => desde + Math.random() * (hasta - desde);
const acotar = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));

/** Una gota de símbolo: la salpicadura y lo que chorrea de la cola. */
interface Gota {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  readonly dura: number;
  /** La superficie donde cae: al volver ahí, se apaga. */
  readonly agua: number;
  readonly glifo: string;
}

/** La onda que se abre en la superficie donde el delfín la cruza. */
interface Onda {
  readonly x: number;
  readonly agua: number;
  readonly escala: number;
  vida: number;
}

/** Lo que el componente lleva de una pasada: la pasada, sus símbolos y dónde cae cada uno. */
interface Nado {
  readonly pasada: Pasada;
  readonly glifos: string[];
  readonly lugares: Float32Array;
}

let logo: Promise<Logo | null> | null = null;

/** El logo, bajado y medido una sola vez. */
function leerLogo(): Promise<Logo | null> {
  logo ??= (async () => {
    const imagen = new Image();
    imagen.src = "/dolphin-blanco-512.png";
    await imagen.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = imagen.width;
    lienzo.height = imagen.height;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(imagen, 0, 0);
    return medirLogo(ctx.getImageData(0, 0, imagen.width, imagen.height).data, imagen.width, imagen.height);
  })().catch(() => null);
  return logo;
}

/** La fuente monoespaciada de la app, leída una sola vez. */
let mono = "";
function fuente(px: number): string {
  mono ||= getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
  return `600 ${px.toFixed(1)}px ${mono}`;
}

/** Una salpicadura de símbolos: gotas que saltan abiertas hacia arriba y vuelven a caer al agua. */
function salpicar(gotas: Gota[], x: number, agua: number, cuantas: number, escala: number, dir: 1 | -1) {
  for (let i = 0; i < cuantas; i++) {
    const angulo = -Math.PI / 2 + azar(-0.8, 0.8);
    const fuerza = azar(120, 320) * Math.sqrt(escala);
    gotas.push({
      x: x + azar(-12, 12) * escala,
      y: agua - 2,
      vx: Math.cos(angulo) * fuerza + dir * azar(0, 50) * escala,
      vy: Math.sin(angulo) * fuerza,
      vida: 0,
      dura: azar(0.7, 1.2),
      agua,
      glifo: glifoAlAzar(),
    });
  }
}

/**
 * El delfín en su punto de la pasada: lo que está bajo el agua se ve apenas
 * y tiembla, como a través del agua; lo de afuera, celeste (más tenue cuanto
 * más grande, para no tapar la tarea cuando pasa por detrás). Salpica donde
 * el hocico o la cola cruzan la superficie, y la cola gotea mientras vuela.
 */
function dibujarDelfin(ctx: CanvasRenderingContext2D, nado: Nado, t: number, dt: number, gotas: Gota[], ondas: Onda[], tapas: readonly number[]): number {
  const { pasada: p, glifos, lugares } = nado;
  const q = avanzar(p, dt);
  posar(p, q, lugares);

  ctx.font = fuente(Math.max(5, 8 * q.escala));
  const enElAire = 0.88 * acotar(1 - (q.escala - 1.4) * 0.3, 0.6, 1);
  /** Detrás de un texto se atenúa, como detrás de un vidrio: la tarea se lee aunque pase por encima. */
  const detrasDeTexto = (x: number, y: number) => {
    for (let k = 0; k < tapas.length; k += 4) if (x > tapas[k]! && y > tapas[k + 1]! && x < tapas[k + 2]! && y < tapas[k + 3]!) return true;
    return false;
  };
  // Dos pasadas, una por color: cambiar de pincel en cada símbolo cuesta.
  for (const bajoElAgua of [true, false]) {
    ctx.fillStyle = bajoElAgua ? coloresDeEscena().espuma : coloresDeEscena().delfin;
    ctx.globalAlpha = bajoElAgua ? 0.13 : enElAire;
    for (let i = 0; i < glifos.length; i++) {
      const gy = lugares[i * 2 + 1]!;
      if ((gy > q.agua) !== bajoElAgua) continue;
      // Vivo: de vez en cuando un símbolo cambia por otro.
      if (Math.random() < 0.004) glifos[i] = glifoAlAzar();
      const gx = lugares[i * 2]! + (bajoElAgua ? Math.sin(gy * 0.09 + t * 5) * 1.4 : 0);
      if (!bajoElAgua) ctx.globalAlpha = detrasDeTexto(gx, gy) ? enElAire * 0.22 : enElAire;
      ctx.fillText(glifos[i]!, gx, gy);
    }
  }
  ctx.globalAlpha = 1;

  // Salpica donde una punta cruza la superficie, si se ve: fuera de pantalla no hace falta.
  const cruza = (indice: number, antes: number, cuantas: number) => {
    const gx = lugares[indice * 2]!;
    const gy = lugares[indice * 2 + 1]!;
    if (Number.isFinite(antes) && (antes > q.agua) !== (gy > q.agua) && gx > -20 && gx < p.ancho + 20) {
      salpicar(gotas, gx, q.agua, Math.round(cuantas * Math.min(2, q.escala)), q.escala, p.dir);
      ondas.push({ x: gx, agua: q.agua, escala: q.escala, vida: 0 });
    }
    return gy;
  };
  p.hocicoAntes = cruza(p.forma.hocico, p.hocicoAntes, 16);
  p.colaAntes = cruza(p.forma.cola, p.colaAntes, 9);

  // Mientras vuela, la cola gotea.
  const colaX = lugares[p.forma.cola * 2]!;
  const colaY = lugares[p.forma.cola * 2 + 1]!;
  if (colaY < q.agua - 4) {
    for (p.goteo += dt; p.goteo > 0.07; p.goteo -= 0.07) {
      gotas.push({ x: colaX, y: colaY, vx: -p.dir * azar(10, 50) * q.escala, vy: azar(-40, 20), vida: 0, dura: azar(0.5, 0.9), agua: q.agua, glifo: glifoAlAzar() });
    }
  }
  return q.escala;
}

/** Las gotas en vuelo (caen con gravedad y se apagan al volver al agua) y las ondas que se abren en la superficie. */
function dibujarEspuma(ctx: CanvasRenderingContext2D, gotas: Gota[], ondas: Onda[], dt: number, escala: number) {
  ctx.fillStyle = coloresDeEscena().espuma;
  ctx.font = fuente(6 * acotar(escala, 1, 2));
  let quedan = 0;
  for (const g of gotas) {
    g.vy += GRAVEDAD * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vida += dt;
    if (g.vida >= g.dura || (g.vy > 0 && g.y > g.agua + 2)) continue;
    ctx.globalAlpha = 0.55 * (1 - g.vida / g.dura);
    ctx.fillText(g.glifo, g.x, g.y);
    gotas[quedan++] = g;
  }
  gotas.length = quedan;

  // La onda: un anillo de puntos aplastado (el mar se ve en perspectiva) que se abre y se apaga.
  let abiertas = 0;
  for (const o of ondas) {
    o.vida += dt;
    const u = o.vida / 1.1;
    if (u >= 1) continue;
    const rx = (8 + 70 * (1 - Math.pow(1 - u, 3))) * o.escala;
    ctx.globalAlpha = 0.4 * (1 - u);
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      ctx.fillRect(o.x + Math.cos(a) * rx - 0.8, o.agua + Math.sin(a) * rx * 0.16 - 0.8, 1.6, 1.6);
    }
    ondas[abiertas++] = o;
  }
  ondas.length = abiertas;
  ctx.globalAlpha = 1;
}

/** Con movimiento reducido: quieto en lo alto de un salto, al costado de la tarea. Si no hay costado, no está. */
function dibujarQuieto(ctx: CanvasRenderingContext2D, forma: Forma, ancho: number, alto: number) {
  if (ancho < 960) return;
  ctx.font = fuente(8);
  ctx.fillStyle = coloresDeEscena().delfin;
  ctx.globalAlpha = 0.88;
  for (let i = 0; i < forma.xs.length; i++) ctx.fillText(glifoAlAzar(), ancho * 0.84 + forma.xs[i]!, alto * 0.4 + forma.ys[i]!);
  ctx.globalAlpha = 1;
}

export function DelfinDeSimbolos({
  className,
  legibles,
}: {
  className?: string;
  /** Los textos que tienen que seguir leyéndose cuando el delfín pasa por detrás (un selector, buscado junto al lienzo). */
  legibles?: string;
}) {
  const mascara = useRef<Logo | null>(null);
  // Dónde están esos textos, relativo al lienzo (x0, y0, x1, y1 de cada uno): se mide cada tanto, no en cada cuadro.
  const tapas = useRef<{ cajas: number[]; cuadros: number }>({ cajas: [], cuadros: 0 });
  const forma = useRef<Forma | null>(null);
  const nado = useRef<Nado | null>(null);
  const espuma = useRef<{ gotas: Gota[]; ondas: Onda[] }>({ gotas: [], ondas: [] });
  // La primera vez se acerca desde el horizonte: es la figura que más se luce.
  const reloj = useRef<{ ultimo: number; espera: number; dir: 1 | -1; figura: Figura | null; escala: number }>({
    ultimo: 0,
    espera: 0.5,
    dir: Math.random() < 0.5 ? 1 : -1,
    figura: null,
    // Las gotas son del tamaño del delfín que las tiró.
    escala: 1,
  });

  const { ref, redibujar } = useLienzo((ctx, ancho, alto, t) => {
    const logoListo = mascara.current;
    if (!logoListo || ancho < 240 || alto < 240) return;
    // La forma, al tamaño de esta pantalla: se rehace si cambió mucho.
    const tamano = acotar(Math.min(ancho, alto) * 0.2, 72, 150);
    if (!forma.current || Math.abs(forma.current.alto - tamano) > 12) forma.current = formaDelLogo(logoListo, tamano);
    const f = forma.current;
    if (!f) return;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (quieto()) {
      dibujarQuieto(ctx, f, ancho, alto);
      return;
    }
    const r = reloj.current;
    // Con la pestaña oculta no hubo cuadros: el delfín sigue donde estaba, no salta de golpe.
    const dt = acotar(t - r.ultimo, 0, 1 / 20);
    r.ultimo = t;

    let actual = nado.current;
    // Si el lienzo cambió mucho de tamaño, esta pasada ya no entra: se corta y viene otra.
    if (actual && (Math.abs(actual.pasada.ancho - ancho) > 40 || Math.abs(actual.pasada.alto - alto) > 40)) actual = nado.current = null;
    if (!actual) {
      r.espera -= dt;
      if (r.espera <= 0) {
        const figura: Figura = r.figura === null ? "acercarse" : otraFigura(r.figura);
        const pasada = nuevaPasada(f, figura, ancho, alto, r.dir);
        actual = nado.current = { pasada, glifos: Array.from({ length: f.xs.length }, glifoAlAzar), lugares: new Float32Array(f.xs.length * 2) };
        r.figura = figura;
        r.dir = r.dir === 1 ? -1 : 1;
        r.espera = azar(0.8, 1.8);
      }
    }
    const lienzo = ref.current;
    if (legibles && lienzo?.parentElement && tapas.current.cuadros-- <= 0) {
      const base = lienzo.getBoundingClientRect();
      tapas.current = {
        cuadros: 20,
        cajas: [...lienzo.parentElement.querySelectorAll(legibles)].flatMap((el) => {
          const c = el.getBoundingClientRect();
          return c.width > 0 && c.height > 0 ? [c.left - base.left - 6, c.top - base.top - 6, c.right - base.left + 6, c.bottom - base.top + 6] : [];
        }),
      };
    }
    if (actual) {
      if (actual.pasada.s < actual.pasada.largo) r.escala = dibujarDelfin(ctx, actual, t, dt, espuma.current.gotas, espuma.current.ondas, tapas.current.cajas);
      else nado.current = null;
    }
    dibujarEspuma(ctx, espuma.current.gotas, espuma.current.ondas, dt, r.escala);
  });

  useEffect(() => {
    let vivo = true;
    void leerLogo().then((m) => {
      if (!vivo || !m) return;
      mascara.current = m;
      // Llegó el logo: con movimiento reducido no hay bucle que lo dibuje solo.
      redibujar();
    });
    return () => {
      vivo = false;
    };
    // redibujar es estable por dentro (lee una ref): no hace falta en las dependencias.
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}
