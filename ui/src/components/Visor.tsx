import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { gsap } from "gsap";
import { BotonCopiar } from "./BotonCopiar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";

/**
 * El visor «en grande»: se cierra arrastrándolo.
 *
 * La física es la de /nico-mockup, copiada sin reinterpretar: sigue al
 * puntero 1:1, se achica como miniatura desde el punto exacto donde lo
 * agarraste, y cierra por distancia o por velocidad o vuelve con rebote
 * elástico. Los números son esos y no otros.
 *
 * Lo único adaptado: se agarra por la cabecera y no por cualquier punto,
 * porque el cuerpo es un diff que scrollea.
 *
 * Con `flotante` (el Master Prompt; Nico, 30/10: «como 3d, flotante») la
 * ventana es un objeto con profundidad: entra en perspectiva como una hoja
 * que se asienta, con luz en el canto de arriba y la sombra larga abajo, y
 * atrás tiene dos platos que respiran despacio. Lo que se mueve son los
 * platos y no la ventana —como se dibuja algo que flota: la sombra pulsa, el
 * objeto no—, así se puede escribir adentro sin que se mueva y cualquier
 * cosa que la toque (el tester de pantalla) la encuentra quieta. La física
 * no cambia: lo que se arrastra es el conjunto, platos incluidos.
 */

gsap.registerPlugin(Draggable, InertiaPlugin);

const ESCALAS: readonly [number, number][] = [
  [0, 1],
  [220, 0.75],
  [350, 0.5],
  [500, 0.12],
];

function escalaPara(distancia: number): number {
  for (let i = 1; i < ESCALAS.length; i++) {
    const [d0, s0] = ESCALAS[i - 1]!;
    const [d1, s1] = ESCALAS[i]!;
    if (distancia <= d1) return gsap.utils.mapRange(d0, d1, s0, s1, distancia);
  }
  return ESCALAS[ESCALAS.length - 1]![1];
}

/**
 * Los dos platos de atrás de una ventana flotante: cada uno más angosto, más abajo y más apagado.
 * `respira` es cuánto baja y sube cada uno: el de más atrás se mueve más, como en una paralaje.
 */
const PLATOS: readonly { readonly estilo: React.CSSProperties; readonly respira: number }[] = [
  { estilo: { left: 14, right: 14, top: 10, bottom: -10, opacity: 0.58 }, respira: 4 },
  { estilo: { left: 28, right: 28, top: 20, bottom: -20, opacity: 0.3 }, respira: 8 },
];

export interface VisorProps {
  /** El botón que lo abrió: al cerrar, el foco vuelve ahí. */
  quienAbrio: HTMLElement | null;
  titulo: string;
  sub?: string;
  onCerrado: () => void;
  /** Devuelve si se copió: el botón lo dice, no finge. */
  onCopiar?: () => Promise<boolean>;
  /** Ancho máximo en px: el diff necesita aire, un formulario no. */
  ancho?: number;
  /** «codigo» es monoespaciada y chica; «formulario», texto común. */
  variante?: "codigo" | "formulario";
  /** Un objeto flotante con profundidad (ver arriba), en vez de una tarjeta más. */
  flotante?: boolean;
  children: ReactNode;
}

export function Visor({ quienAbrio, titulo, sub, onCerrado, onCopiar, ancho = 920, variante = "codigo", flotante = false, children }: VisorProps) {
  const veloRef = useRef<HTMLDivElement>(null);
  const visorRef = useRef<HTMLDivElement>(null);
  const agarreRef = useRef<HTMLElement>(null);
  const cerradoRef = useRef(onCerrado);
  cerradoRef.current = onCerrado;

  useEffect(() => {
    const velo = veloRef.current;
    const visor = visorRef.current;
    const agarre = agarreRef.current;
    if (!velo || !visor || !agarre) return;

    let origen = { x: 50, y: 50 };
    const velocidad = (eje: "x" | "y") => InertiaPlugin.getVelocity(visor, eje);

    // Trabar el scroll saca la barra: sin devolver ese ancho, la consola
    // de atrás saltaba 15 px a la derecha al abrir.
    const barra = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (barra > 0) document.body.style.paddingRight = `${barra}px`;
    const destrabar = () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
    // Con movimiento reducido entra y sale sin escalar ni desplazarse; el arrastre, que lo hace la mano, queda.
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.set(visor, { x: 0, y: 0, transformOrigin: "50% 50%", filter: "blur(0px)" });
    gsap.fromTo(velo, { opacity: 0 }, { opacity: 1, duration: quieto ? 0 : 0.22, ease: "power2.out" });
    if (quieto) gsap.set(visor, { scale: 1, opacity: 1, y: 0 });
    else if (flotante) {
      // Entra en perspectiva, con la bisagra abajo, como una hoja que se asienta. Al terminar, el
      // origen vuelve al centro: la física lo agarra desde donde lo toques, no desde la bisagra.
      gsap.fromTo(
        visor,
        { scale: 0.92, opacity: 0, y: 28, rotationX: 12, transformPerspective: 1200, transformOrigin: "50% 100%" },
        { scale: 1, opacity: 1, y: 0, rotationX: 0, duration: 0.5, ease: "power3.out", onComplete: () => gsap.set(visor, { transformOrigin: "50% 50%" }) },
      );
    } else gsap.fromTo(visor, { scale: 0.94, opacity: 0, y: 16 }, { scale: 1, opacity: 1, y: 0, duration: 0.34, ease: "power3.out" });
    // Los platos respiran: bajan y suben despacio (ida y vuelta en 2,8 s, sin fin), cada uno lo suyo.
    const platos = [...visor.querySelectorAll<HTMLElement>("[data-plato]")];
    const respirar = flotante && !quieto ? platos.map((plato, i) => gsap.to(plato, { y: PLATOS[i]?.respira ?? 0, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 })) : [];
    // Si un campo de adentro ya tomó el foco (autoFocus), es suyo: no se lo saca el visor.
    if (!visor.contains(document.activeElement)) visor.focus({ preventScroll: true });

    /** Estado final: desmonta y devuelve el foco a quien lo abrió. */
    const guardar = () => {
      destrabar();
      cerradoRef.current();
      quienAbrio?.focus();
    };

    /** Cierre sin arrastre: la ×, Escape o un click en el velo. */
    const cerrar = () => {
      gsap.killTweensOf([velo, visor]);
      if (quieto) {
        gsap.set(velo, { opacity: 0 });
        return guardar();
      }
      gsap.to(visor, { scale: 0.94, opacity: 0, duration: 0.18, ease: "power2.in", onComplete: guardar });
      gsap.to(velo, { opacity: 0, duration: 0.18, ease: "power2.out" });
    };

    const alTocarVelo = (e: MouseEvent) => {
      if (e.target === velo) cerrar();
    };
    velo.addEventListener("click", alTocarVelo);
    visor.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", cerrar));

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") return cerrar();

      // `aria-modal` promete que el Tab no se escapa; sin esto el foco se
      // iba a la consola de atrás, que para el lector de pantalla no existe.
      if (e.key !== "Tab") return;
      const dentro = [...visor.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")].filter(
        (el) => el.offsetParent !== null,
      );
      if (dentro.length === 0) return;
      const primero = dentro[0]!;
      const ultimo = dentro[dentro.length - 1]!;
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === visor)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);

    const [arrastre] = Draggable.create(visor, {
      type: "x,y",
      trigger: agarre,
      inertia: false,
      zIndexBoost: false,
      cursor: "grab",
      activeCursor: "grabbing",

      onPress(this: Draggable, evento: PointerEvent) {
        gsap.killTweensOf([visor, velo]);
        gsap.to(velo, { opacity: 1, duration: 0.15 });

        const caja = visor.getBoundingClientRect();
        const cx = "clientX" in evento ? evento.clientX : this.pointerX - window.scrollX;
        const cy = "clientY" in evento ? evento.clientY : this.pointerY - window.scrollY;
        const ox = ((cx - caja.left) / caja.width) * 100;
        const oy = ((cy - caja.top) / caja.height) * 100;

        // Si lo agarran en pleno rebote la escala no es 1: cambiar el origen
        // lo haría saltar, así que se compensa en x/y.
        const escala = Number(gsap.getProperty(visor, "scale"));
        const dx = ((ox - origen.x) / 100) * (caja.width / escala) * (1 - escala);
        const dy = ((oy - origen.y) / 100) * (caja.height / escala) * (1 - escala);
        origen = { x: ox, y: oy };

        // rotationX: si lo agarran mientras entra en perspectiva, no se lo lleva inclinado.
        gsap.set(visor, { transformOrigin: `${ox}% ${oy}%`, x: this.x - dx, y: this.y - dy, rotationX: 0 });
        this.update();
      },

      onDrag(this: Draggable) {
        const d = Math.hypot(this.x, this.y);
        gsap.set(visor, {
          x: this.x,
          y: this.y,
          scale: escalaPara(d),
          opacity: gsap.utils.interpolate(1, 0.86, gsap.utils.clamp(0, 1, (d - 350) / 180)),
          filter: `blur(${gsap.utils.interpolate(0, 3, gsap.utils.clamp(0, 1, (d - 220) / 280))}px)`,
        });
      },

      onDragEnd(this: Draggable) {
        const d = Math.hypot(this.x, this.y);
        const vx = velocidad("x");
        const vy = velocidad("y");
        const rapidez = Math.hypot(vx, vy);

        if (escalaPara(d) <= 0.35 || d > 430 || (rapidez > 900 && d > 260)) {
          gsap.to(visor, {
            x: this.x + vx * 0.12,
            y: this.y + vy * 0.12,
            scale: 0.08,
            opacity: 0,
            duration: 0.18,
            ease: "power2.in",
            onComplete: guardar,
          });
          gsap.to(velo, { opacity: 0, duration: 0.18, ease: "power2.out" });
          return;
        }

        gsap.to(visor, {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.58,
          ease: "elastic.out(0.75, 0.55)",
        });
      },
    });

    return () => {
      arrastre?.kill();
      respirar.forEach((r) => r.kill());
      velo.removeEventListener("click", alTocarVelo);
      document.removeEventListener("keydown", alTeclear);
      destrabar();
      gsap.killTweensOf([velo, visor, ...platos]);
    };
  }, [quienAbrio, flotante]);

  return createPortal(
    <div
      ref={veloRef}
      className="fixed inset-0 z-40 grid place-items-center"
      // /nico-mockup usa .11, pensado para fondos claros: sobre el negro de la
      // consola no se notaba y el visor parecía una tarjeta más. Es color, no
      // física. Sin backdrop-filter: el velo cubre la pantalla entera y se
      // recompondría en cada cuadro del arrastre.
      style={{ background: "rgba(0, 0, 0, .55)" }}
    >
      {/* Lo que se arrastra es este conjunto: la ventana y, si flota, sus platos. */}
      <div
        ref={visorRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="relative max-w-[calc(100vw-32px)] outline-none will-change-transform"
        style={{ width: ancho }}
      >
        {flotante && PLATOS.map((plato, i) => <div key={i} data-plato aria-hidden="true" className="bg-card pointer-events-none absolute rounded-3xl will-change-transform" style={plato.estilo} />)}
        <section
          className="bg-card relative flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-3xl"
          style={{
            minHeight: 220,
            boxShadow: flotante ? "var(--flotante-sombra)" : "0 1px 1px rgba(0,0,0,.5), 0 32px 80px -20px rgba(0,0,0,.85)",
            ...(flotante ? { backgroundImage: "var(--flotante-luz)" } : {}),
          }}
        >
          <header
            ref={agarreRef as React.RefObject<HTMLElement>}
            className="flex flex-none cursor-grab touch-none items-center justify-between gap-4 px-5 pt-4 pb-3 active:cursor-grabbing"
          >
            <div className="min-w-0">
              <h2 className="titulo-vista truncate">{titulo}</h2>
              {sub ? <p className="text-muted-foreground mt-0.5 text-[12px] tabular-nums">{sub}</p> : null}
            </div>
            <div className="flex flex-none gap-2">
              {onCopiar ? <BotonCopiar alCopiar={onCopiar} rotulo="Copiar" /> : null}
              <Button variant="secondary" size="icon-lg" data-cerrar aria-label="Cerrar">
                <X aria-hidden="true" />
              </Button>
            </div>
          </header>
          <div
            className={cn(
              // El código scrollea de costado: sin el margen de la derecha, la última columna quedaba pegada al borde.
              "min-h-0 flex-initial overflow-auto px-5 pb-5 [scroll-padding-inline-end:20px] [&_pre]:pr-5",
              variante === "codigo" ? "font-mono text-xs leading-relaxed" : "text-sm",
            )}
            // El diff scrollea con el teclado; un formulario ya tiene sus campos.
            {...(variante === "codigo" ? { tabIndex: 0 } : {})}
          >
            {children}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
