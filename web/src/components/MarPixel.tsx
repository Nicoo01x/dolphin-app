"use client";

import { useEffect, useRef } from "react";
import { ALTO_DELFIN, ANCHO_DELFIN, PIXELES_DEL_DELFIN } from "@/lib/pixeles";
import { useQuieto } from "@/lib/quieto";

/**
 * El mar en píxeles, con los delfines saltando.
 *
 * Es la pieza propia del sitio (Nico, 01/11: «medio estilo hermes-agents y pixel art, tipo océano
 * con delfines pixel art»). Sobre el armado que ya está —azul noche liso, un solo acento, filetes
 * de 1 px— lo que cambia es el lenguaje gráfico: en vez de grabados de archivo, una escena
 * dibujada píxel por píxel.
 *
 * Está hecha en un canvas chiquito —unos 220 píxeles de ancho— que después se estira con
 * `image-rendering: pixelated`. Eso no es un atajo: es lo que hace que los píxeles sean píxeles de
 * verdad, cuadrados y del mismo tamaño, en vez de un dibujo grande con aire de pixel art. También
 * es por qué pesa nada y anda en cualquier teléfono: el navegador pinta 220×90 por cuadro.
 *
 * La paleta sale de las variables del sitio; acá no se inventa ningún color.
 */

/** La grilla lógica. Todo lo de abajo está en estos píxeles, no en los de la pantalla. */
const ANCHO = 200;
const ALTO = 132;
/** Dónde está la superficie del agua, en reposo: poco más de la mitad, para que el salto entre. */
const AGUA = 74;

/** Cada delfín, con su ritmo. Tres bastan: cuatro ya es un acuario. */
const DELFINES = [
  { periodo: 7600, desfasaje: 0, escala: 1.15, alturaDelSalto: 26, desdeX: -34, hastaX: 232 },
  { periodo: 10200, desfasaje: 3400, escala: 0.8, alturaDelSalto: 18, desdeX: 232, hastaX: -34 },
  { periodo: 12800, desfasaje: 6900, escala: 0.55, alturaDelSalto: 12, desdeX: -34, hastaX: 232 },
] as const;

/** Qué tan arriba está el agua en la columna `x` en el momento `t`: dos senos que no coinciden. */
const superficie = (x: number, t: number) =>
  AGUA + Math.round(Math.sin(x / 15 + t / 900) * 1.6 + Math.sin(x / 7 - t / 1400) * 1);

export function MarPixel({ className }: { readonly className?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const quieto = useQuieto();

  useEffect(() => {
    const canvas = lienzo.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    canvas.width = ANCHO;
    canvas.height = ALTO;

    const estilo = getComputedStyle(canvas);
    const color = (nombre: string, porDefecto: string) => estilo.getPropertyValue(nombre).trim() || porDefecto;
    const NOCHE = color("--color-noche", "#0b0e1a");
    // El fondo del mar: más oscuro que el agua de arriba, pero agua. Con `--color-noche-2` se
    // confundía con el fondo de la página y el mar parecía cortado por la mitad.
    const HONDO = "#113354";
    const MARINO = color("--color-marino", "#1b6ca8");
    const ELECTRICO = color("--color-electrico", "#19b9ff");
    const ESPUMA = color("--color-espuma", "#e8f1f8");

    /** Un píxel lógico. Todo pasa por acá: nada se dibuja con decimales. */
    const px = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    };

    // El sprite en una tabla, para poder preguntarle por coordenada: la rotación va al revés
    // —para cada píxel de la pantalla se busca cuál del dibujo le toca— y no del dibujo a la
    // pantalla, que deja agujeros en cuanto el ángulo no es múltiplo de 90° y el delfín aparece
    // cosido con hilachas.
    const tabla = new Map<string, string>();
    for (const p of PIXELES_DEL_DELFIN) tabla.set(`${p.x},${p.y}`, p.letra);
    const COLOR_DE_LETRA: Record<string, string> = { o: MARINO, c: ELECTRICO, e: NOCHE };

    /** El delfín, centrado en (x, y), inclinado `giro` radianes. */
    const delfin = (x: number, y: number, escala: number, giro: number, haciaLaIzquierda: boolean) => {
      const cos = Math.cos(-giro);
      const sen = Math.sin(-giro);
      const cx = ANCHO_DELFIN / 2;
      const cy = ALTO_DELFIN / 2;
      const alcance = Math.ceil((Math.max(ANCHO_DELFIN, ALTO_DELFIN) * escala) / 2) + 1;
      for (let dy = -alcance; dy <= alcance; dy += 1) {
        for (let dx = -alcance; dx <= alcance; dx += 1) {
          // De la pantalla al dibujo: se desgira y se desescala.
          const ux = (dx * cos - dy * sen) / escala + cx;
          const uy = (dx * sen + dy * cos) / escala + cy;
          const sx = Math.round(haciaLaIzquierda ? ANCHO_DELFIN - 1 - ux : ux);
          const sy = Math.round(uy);
          const letra = tabla.get(`${sx},${sy}`);
          if (letra) px(x + dx, y + dy, COLOR_DE_LETRA[letra]!);
        }
      }
    };

    let cuadro = 0;
    const pintar = (t: number) => {
      // El cielo y el agua: dos bloques lisos, como corresponde a un fondo de pixel art.
      g.fillStyle = NOCHE;
      g.fillRect(0, 0, ANCHO, ALTO);

      // Estrellas quietas: siempre las mismas, con una grilla pseudoaleatoria y no con Math.random,
      // o titilarían todas en cada cuadro.
      for (let i = 0; i < 34; i += 1) {
        const x = (i * 71) % ANCHO;
        const y = (i * 37) % (AGUA - 16);
        px(x, y, i % 4 === 0 ? ELECTRICO : HONDO);
      }

      // La luna, en píxeles: un disco con un mordisco, que es como se dibuja una luna en una
      // grilla chica. Da el punto de luz que justifica los brillos del agua.
      const lunaX = 158;
      const lunaY = 26;
      for (let y = -7; y <= 7; y += 1) {
        for (let x = -7; x <= 7; x += 1) {
          if (x * x + y * y > 49) continue;
          // El mordisco: otro círculo corrido, para la fase. Poco profundo, o queda una guadaña.
          if ((x - 7) ** 2 + (y - 3) ** 2 <= 56) continue;
          px(lunaX + x, lunaY + y, (x * 3 + y * 5) % 11 === 0 ? ELECTRICO : ESPUMA);
        }
      }

      // El agua, de la superficie para abajo, más oscura cuanto más hondo.
      for (let x = 0; x < ANCHO; x += 1) {
        const sup = superficie(x, t);
        for (let y = sup; y < ALTO; y += 1) {
          const hondura = (y - sup) / (ALTO - sup);
          // Tres franjas, y la más honda sigue siendo agua: con el fondo de la página abajo, el
          // mar parecía una cinta flotando en el medio del cuadro.
          px(x, y, hondura > 0.55 ? HONDO : hondura > 0.14 ? MARINO : ELECTRICO);
        }
        // La línea de la superficie, clara: es lo que le da el filo al agua.
        px(x, sup, ELECTRICO);
        // Y una cresta de espuma cada tanto, donde la ola está más alta.
        if (sup < AGUA - 1 && (x + Math.floor(t / 120)) % 9 === 0) px(x, sup - 1, ESPUMA);

        // El reflejo de la luna: una columna de destellos que se corta y se vuelve a armar, que
        // es lo que hace que el agua se lea como agua y no como una franja azul.
        if (Math.abs(x - lunaX) < 13 && (x * 3 + Math.floor(t / 260)) % 5 < 2) {
          const hondo = sup + 2 + ((x * 7 + Math.floor(t / 300)) % 9);
          if (hondo < ALTO) px(x, hondo, ESPUMA);
        }
      }

      for (const d of DELFINES) {
        const avance = (((t + d.desfasaje) % d.periodo) / d.periodo);
        const x = d.desdeX + (d.hastaX - d.desdeX) * avance;
        // El salto: una parábola que sale del agua y vuelve a entrar, tres veces por travesía.
        const arco = Math.sin(avance * Math.PI * 3);
        const salto = Math.max(0, arco) ** 1.3 * d.alturaDelSalto;
        const y = superficie(x, t) + 4 - salto;
        // La inclinación sale de la pendiente del salto: sube de nariz y entra de cabeza.
        const giro = Math.cos(avance * Math.PI * 3) * (arco > 0 ? -0.5 : 0);
        delfin(x, y, d.escala, d.hastaX < d.desdeX ? -giro : giro, d.hastaX < d.desdeX);

        // La salpicadura, justo cuando cruza el agua.
        if (salto > 0.5 && salto < 4) {
          for (let i = -3; i <= 3; i += 1) px(x + i * 2, superficie(x, t) - Math.abs(i), ESPUMA);
        }
      }
    };

    if (quieto) {
      // Sin movimiento: una sola escena, con los delfines en el aire. Lo que se cuenta es lo mismo.
      pintar(2600);
      return;
    }
    const arranque = performance.now();
    const paso = (ahora: number) => {
      pintar(ahora - arranque);
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [quieto]);

  return (
    <canvas
      ref={lienzo}
      className={`w-full [image-rendering:pixelated] ${className ?? ""}`}
      // El alto sale de la proporción de la grilla: el canvas se estira sin deformarse.
      style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}
      role="img"
      aria-label="Un mar dibujado en píxeles, de noche, con tres delfines saltando."
    />
  );
}
