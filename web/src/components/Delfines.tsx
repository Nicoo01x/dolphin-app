"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TRAZO_DEL_LOGO } from "./Logo";
import { useQuieto } from "@/lib/quieto";
import { montarDelfin, type Delfin3d } from "@/lib/delfin-3d";
import { alDescansar } from "@/lib/descanso";

const MODELO = "/modelos/delfin-alt-ccby.glb";

/**
 * Las funciones de Dolphin, una por una, con un delfín hecho de miles de puntos en 3D: nada en
 * el lugar mientras bajás y, en cada función, se lo ve desde otro ángulo, como una foto de
 * producto, con el color de esa función; al costado, su ficha como una hoja de especificaciones.
 * Idea de Nico (27/10). Nada de desarmarse ni de girar sobre sí mismo: Nico lo quiere profesional.
 */

// Solo lo que Dolphin hace hoy, verificado contra el código el 27/10 (C141). Si una fila deja de
// ser cierta, se cambia la fila; la web no promete lo que el producto no cumple.
const FUNCIONES = [
  {
    nombre: "Dolphin X-ray",
    color: "#eaf5fa",
    lema: "Señalás un botón de cualquier app de Windows y el agente sabe exactamente cuál es.",
    ficha: [
      ["Atajo", "Ctrl + Alt + X"],
      ["Dónde", "la app de escritorio, en Windows"],
      ["Lee", "la accesibilidad del sistema (UI Automation)"],
      ["Le pasa al agente", "app, ventana, rol, nombre, texto y recorte"],
    ],
  },
  {
    nombre: "Dolphin Flota",
    color: "#8ecae6",
    lema: "Un líder parte el pedido y cada compañero lo hace en su propia rama, al mismo tiempo.",
    ficha: [
      ["Líder", "parte el pedido y le asigna archivos a cada tarea"],
      ["Aislamiento", "un worktree, un puerto y una base por compañero"],
      ["Choques", "te avisa si dos tocan lo mismo, antes de integrar"],
      ["Antes del «dale»", "el costo estimado, y lo corregís escribiendo"],
    ],
  },
  {
    nombre: "Dolphin Portón",
    color: "#b9def0",
    lema: "Nada llega a tu rama sin pasar tus tests, tu typecheck y la revisión de otro modelo.",
    ficha: [
      ["Orden", "primero lo gratis; lo pago, solo si lo gratis pasó"],
      ["Si rebota", "el agente corrige una vez y vuelve a pasar"],
      ["Si chocan", "un agente resuelve el conflicto y se prueba todo junto"],
      ["Entrega", "una sola rama, revisable compañero por compañero"],
    ],
  },
  {
    nombre: "Dolphin Bitácora",
    color: "#6fb7d6",
    lema: "Una corrección con patrón se vuelve un chequeo gratis que corta la rama, escriba quien escriba.",
    ficha: [
      ["Con patrón", "corta en el portón, sin gastar tokens"],
      ["Sin patrón", "va en el pedido de cada agente"],
      ["Importa", "tu CLAUDE.md y tu AGENTS.md"],
      ["Aprende", "de lo que falla y de lo que deshacés"],
    ],
  },
  {
    nombre: "Dolphin Pantalla",
    color: "#d2ebf5",
    lema: "Antes de que llegue a tu rama, cinco perfiles distintos usan la app y lo que falla queda grabado.",
    ficha: [
      ["Usuarios", "cinco perfiles, en Chrome"],
      ["Mira", "solo lo que cambió en esa rama"],
      ["Si falla", "queda el video del momento"],
      ["Necesita", "la sección pantalla en dolphin.config.json"],
    ],
  },
  {
    nombre: "Dolphin Guardia",
    color: "#a3d3e8",
    lema: "Te avisa cuando termina, cuando se traba o cuando te necesita. Y lo manejás desde Telegram.",
    ficha: [
      ["Avisos", "del sistema, si no estás mirando la terminal"],
      ["Telegram", "le escribís al bot como a la terminal"],
      ["/objetivo", "no para hasta que tu oráculo pase"],
      ["Deshacer", "lo de cada compañero, por separado"],
    ],
  },
] as const;

/** Los puntos del logo en 3D: la cara de adelante, la de atrás y el canto, en coordenadas centradas. */
function puntosDelDelfin(): Float32Array {
  const W = 462;
  const H = 370;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fill(new Path2D(TRAZO_DEL_LOGO), "evenodd");
  const datos = ctx.getImageData(0, 0, W, H).data;
  const adentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && datos[(Math.round(y) * W + Math.round(x)) * 4 + 3]! > 128;
  const pts: number[] = [];
  const paso = 4.2;
  const espesor = 26;
  for (let y = 0; y < H; y += paso) {
    for (let x = 0; x < W; x += paso) {
      if (!adentro(x, y)) continue;
      const borde = !adentro(x - paso, y) || !adentro(x + paso, y) || !adentro(x, y - paso) || !adentro(x, y + paso);
      const cx = x - W / 2;
      const cy = y - H / 2;
      pts.push(cx, cy, espesor, cx, cy, -espesor);
      // El canto: una columna de puntos entre las dos caras.
      if (borde) for (let z = -espesor + 9; z < espesor; z += 9) pts.push(cx, cy, z);
    }
  }
  return new Float32Array(pts);
}

const hexARgb = (h: string) => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

type Rgb = readonly [number, number, number];

/**
 * Desde dónde se lo ve en cada función: giro sobre el eje vertical y altura de la mirada, en
 * radianes. Siempre con el pico hacia la ficha (a la derecha); cambian el ángulo y la luz, no el
 * sentido.
 */
const POSES = [
  { giro: -0.35, altura: 0.12 },
  { giro: -0.8, altura: 0.28 },
  { giro: 0.2, altura: 0.04 },
  { giro: -0.15, altura: -0.14 },
  { giro: -0.6, altura: 0.18 },
  { giro: 0.05, altura: 0.22 },
] as const;

const suave = (x: number) => x * x * (3 - 2 * x);

/** Dónde está el delfín para un punto del recorrido: desde qué ángulo se lo ve y de qué color. */
function estadoDelRecorrido(progreso: number, t: number, quieto: boolean, colores: readonly Rgb[]) {
  const N = colores.length;
  const p = progreso * N;
  const i = Math.min(N - 1, Math.floor(p));
  const f = Math.min(1, Math.max(0, p - i));
  // Mientras leés una función queda quieto en su pose; en el último tramo pasa, despacio, a la
  // siguiente. La última no tiene siguiente.
  const tramo = i === N - 1 ? 0 : suave(Math.min(1, Math.max(0, (f - 0.6) / 0.4)));
  const a = POSES[i % POSES.length]!;
  const b = POSES[(i + 1) % POSES.length]!;
  const vaiven = quieto ? 0 : Math.sin(t * 0.35) * 0.04;
  const giro = a.giro + (b.giro - a.giro) * tramo + vaiven;
  const altura = a.altura + (b.altura - a.altura) * tramo;
  const [r0, g0, b0] = colores[i]!;
  const [r1, g1, b1] = colores[Math.min(N - 1, i + 1)]!;
  const color: Rgb = [r0 + (r1 - r0) * tramo, g0 + (g1 - g0) * tramo, b0 + (b1 - b0) * tramo];
  return { giro, altura, color };
}

export function Delfines() {
  const ref = useRef<HTMLElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const lienzo3d = useRef<HTMLCanvasElement>(null);
  // El delfín real (modelo 3D); si no carga (sin WebGL, sin modelo), el del logo en puntos.
  const [modo, setModo] = useState<"3d" | "2d">("3d");
  const quieto = useQuieto();
  // La preferencia se lee en cada cuadro: si fuera dependencia de los efectos, cambiarla (pasa
  // siempre al hidratar) desarmaba el delfín y lo volvía a armar, con el modelo bajado dos veces.
  const quietoRef = useRef(quieto);
  quietoRef.current = quieto;
  const redibujar = useRef<() => void>(() => {});
  useEffect(() => redibujar.current(), [quieto]);
  // three.js, el modelo y las 22.000 muestras esperan a que la sección esté a una pantalla de distancia.
  const [cerca, setCerca] = useState(false);
  useEffect(() => {
    const seccion = ref.current;
    if (!seccion || cerca) return;
    const obs = new IntersectionObserver(([e]) => e?.isIntersecting && setCerca(true), { rootMargin: "100% 0px" });
    obs.observe(seccion);
    return () => obs.disconnect();
  }, [cerca]);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [activa, setActiva] = useState(0);
  const progreso = useRef(0);
  const N = FUNCIONES.length;
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progreso.current = v;
    setActiva(Math.min(N - 1, Math.floor(v * N)));
  });

  useEffect(() => {
    const canvas = lienzo3d.current;
    if (!canvas || modo !== "3d" || !cerca) return;
    let vivo = true;
    let raf = 0;
    let visible = true;
    let delfin: Delfin3d | null = null;
    const colores = FUNCIONES.map((f) => hexARgb(f.color));
    const inicio = performance.now();
    const dibujar = (ahora: number) => {
      raf = 0;
      if (!delfin) return;
      const t = (ahora - inicio) / 1000;
      const q = quietoRef.current;
      delfin.actualizar({ ...estadoDelRecorrido(progreso.current, t, q, colores), t, nado: q ? 0 : 1 });
      if (visible && !q) raf = requestAnimationFrame(dibujar);
    };
    const seguir = () => {
      if (!raf) raf = requestAnimationFrame(dibujar);
    };
    redibujar.current = seguir;
    const obs = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      if (visible) seguir();
    });
    const redim = new ResizeObserver(() => {
      delfin?.medir();
      seguir();
    });
    const alScroll = () => seguir();
    const cancelar = alDescansar(() =>
      montarDelfin(canvas, MODELO).then(
        (d) => {
          if (!vivo) return d.destruir();
          delfin = d;
          obs.observe(canvas);
          redim.observe(canvas);
          window.addEventListener("scroll", alScroll, { passive: true });
          seguir();
        },
        () => vivo && setModo("2d"),
      ),
    );
    return () => {
      vivo = false;
      cancelar();
      cancelAnimationFrame(raf);
      obs.disconnect();
      redim.disconnect();
      window.removeEventListener("scroll", alScroll);
      delfin?.destruir();
    };
  }, [modo, cerca]);

  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas || modo !== "2d") return;
    const ctx = canvas.getContext("2d")!;
    const pts = puntosDelDelfin();
    const cantidad = pts.length / 3;
    const colores = FUNCIONES.map((f) => hexARgb(f.color));
    let raf = 0;
    let visible = true;
    let dpr = 1;
    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    };
    const inicio = performance.now();
    const dibujar = (ahora: number) => {
      raf = 0;
      const t = (ahora - inicio) / 1000;
      const quieto = quietoRef.current;
      const { giro, altura, color: col } = estadoDelRecorrido(progreso.current, t, quieto, colores);
      const salto = quieto ? 0 : Math.sin(t * 1.1) * 10;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const escala = Math.min(W / 560, H / 470);
      const cosY = Math.cos(giro);
      const sinY = Math.sin(giro);
      const inclinacion = 0.1 + altura;
      const cosX = Math.cos(inclinacion);
      const sinX = Math.sin(inclinacion);
      for (let k = 0; k < cantidad; k++) {
        const x = pts[k * 3]!;
        const y = pts[k * 3 + 1]!;
        const z = pts[k * 3 + 2]!;
        // Giro sobre el eje vertical y una leve inclinación hacia la cámara.
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const persp = 900 / (900 + z2);
        const sx = W / 2 + x1 * persp * escala;
        const sy = H / 2 + (y1 + salto) * persp * escala;
        // Lo de adelante, más claro y más grande; lo de atrás se apaga, como en un grabado.
        const luz = Math.max(0.12, Math.min(1, 0.55 - z2 / 120));
        const lado = (1.1 + luz * 1.2) * dpr * Math.min(1.4, escala * 1.1);
        ctx.fillStyle = `rgba(${col[0]!.toFixed(0)},${col[1]!.toFixed(0)},${col[2]!.toFixed(0)},${luz.toFixed(2)})`;
        ctx.fillRect(sx - lado / 2, sy - lado / 2, lado, lado);
      }
      if (visible && !quieto) raf = requestAnimationFrame(dibujar);
    };
    const seguir = () => {
      if (!raf) raf = requestAnimationFrame(dibujar);
    };
    redibujar.current = seguir;
    const obs = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      if (visible) seguir();
    });
    obs.observe(canvas);
    const redim = new ResizeObserver(() => {
      medir();
      seguir();
    });
    redim.observe(canvas);
    const alScroll = () => seguir();
    window.addEventListener("scroll", alScroll, { passive: true });
    medir();
    seguir();
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      redim.disconnect();
      window.removeEventListener("scroll", alScroll);
    };
  }, [modo]);

  const f = FUNCIONES[activa]!;
  return (
    <section ref={ref} id="funciones" className="relative" style={{ height: `${N * 100 + 40}vh` }}>
      <div className="sticky top-0 flex h-svh items-center overflow-hidden px-6 md:px-10">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-[5/4] w-full">
            <canvas ref={lienzo3d} className={modo === "3d" ? "h-full w-full" : "hidden"} aria-hidden="true" />
            <canvas ref={lienzo} className={modo === "2d" ? "h-full w-full" : "hidden"} aria-hidden="true" />
          </div>

          {/* Las seis, en el HTML: para el lector de pantalla, sin JS y para los buscadores. La que se
              ve al bajar es la misma ficha animada, así que esa queda oculta para no leerse dos veces. */}
          <div className="sr-only">
            {FUNCIONES.map((x) => (
              <div key={x.nombre}>
                <h2>{x.nombre}</h2>
                <p>{x.lema}</p>
                <dl>
                  {x.ficha.map(([clave, valor]) => (
                    <div key={clave}>
                      <dt>{clave}</dt>
                      <dd>{valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <div className="relative min-h-[420px]" aria-hidden="true">
            {/* Dónde estás: una rayita por función, la actual más larga y de su color. Rectas y de
                2 px, como los filetes de la ficha: redondeadas eran seis pastillitas. */}
            <div className="mb-8 flex gap-1.5" aria-hidden="true">
              {FUNCIONES.map((x, i) => (
                <motion.span
                  key={x.nombre}
                  className="h-[2px]"
                  animate={{ width: i === activa ? 36 : 12, backgroundColor: i === activa ? x.color : "#2a3049" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={f.nombre}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-[14px] text-apagado">
                  Función {String(activa + 1).padStart(2, "0")} de {String(N).padStart(2, "0")}
                </p>
                <h2 className="mt-4 titulo-seccion">{f.nombre}</h2>
                <p className="mt-4 max-w-md text-[18px] leading-relaxed text-tinta/80">{f.lema}</p>
                {/* La ficha es una hoja de especificaciones: renglones separados por filetes, con el
                    rótulo a la izquierda. Antes cada renglón era una cajita de vidrio redondeada. */}
                <dl className="mt-8 flex flex-col border-b border-espuma/10">
                  {f.ficha.map(([clave, valor], i) => (
                    <motion.div
                      key={clave}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.07, duration: 0.4 }}
                      className="flex items-baseline justify-between gap-6 border-t border-espuma/10 py-3"
                    >
                      <dt className="flex-none text-[12px] text-tinta/55">{clave}</dt>
                      <dd className="text-right text-[15px] text-tinta">{valor}</dd>
                    </motion.div>
                  ))}
                </dl>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
