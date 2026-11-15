import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Sprout, WandSparkles, WifiOff } from "lucide-react";
import { embebida, pedirALaApp } from "@/lib/embebida";
import { cn } from "@/lib/utils";
import { SelectorDeProyecto } from "./Proyectos";

export type Vista = "tareas" | "nueva" | "bandeja" | "tablero" | "cosecha" | "memoria" | "bots" | "git";

/** La barra: la marca, las vistas, el proyecto que estás mirando, Nueva tarea y Refrescar. */
export function Barra({
  repo,
  alRefrescar,
  vista,
  alCambiarVista,
  nadando = false,
  abiertos = 0,
  desconectado = false,
  alAbrirPrompt,
}: {
  repo: string;
  alRefrescar: () => void;
  vista?: Vista;
  alCambiarVista?: (vista: Vista) => void;
  /** Hay una siembra corriendo: el delfín salta. */
  nadando?: boolean;
  /** Cuántos asuntos abiertos hay en la bandeja: un número quieto, no un globo rojo. */
  abiertos?: number;
  /** Se cortó la conexión con el servidor: se dice, y se sigue reintentando solo. */
  desconectado?: boolean;
  /** Abre el Master Prompt (la ventana flotante): recibe el botón, para devolverle el foco al cerrar. */
  alAbrirPrompt?: (boton: HTMLElement) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  const [masADerecha, setMasADerecha] = useState(false);
  // Y a la izquierda: con la vista activa centrada, la primera queda cortada atrás y un «ablero»
  // a medias se lee como un error de la pantalla, no como algo que se puede deslizar.
  const [masAIzquierda, setMasAIzquierda] = useState(false);
  const medirNav = useCallback(() => {
    const n = nav.current;
    if (!n) return;
    setMasADerecha(n.scrollLeft + n.clientWidth < n.scrollWidth - 2);
    setMasAIzquierda(n.scrollLeft > 2);
  }, []);
  useEffect(() => {
    medirNav();
    window.addEventListener("resize", medirNav);
    return () => window.removeEventListener("resize", medirNav);
  }, [medirNav]);
  // En el teléfono no entran todas: la que estás mirando se centra, o quedaba cortada en una «C».
  useEffect(() => {
    const n = nav.current;
    const activa = n?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!n || !activa) return;
    n.scrollLeft = Math.max(0, activa.offsetLeft - (n.clientWidth - activa.offsetWidth) / 2);
    medirNav();
  }, [vista, medirNav]);

  return (
    <header
      className={cn(
        "bg-background flex items-center gap-4 max-[640px]:gap-2 max-[640px]:px-3",
        // Adentro de la app, la altura de sus cabeceras y sin línea abajo, como sus otras páginas:
        // una barra más de la app, no una web pegada.
        embebida ? "h-11 px-3" : "h-[52px] border-b px-4 pointer-coarse:h-[60px]",
      )}
    >
      {/* Adentro de la app, la marca y el proyecto ya están en su barra: no se repiten acá. */}
      {!embebida && (
      <div className="flex flex-none items-center gap-2" title={nadando ? "Hay una siembra corriendo" : undefined}>
        {/* El logo trazado a vector (scripts/iconos.mjs): nítido en cualquier densidad de pantalla. */}
        <img
          src="/dolphin.svg"
          alt=""
          width={22}
          height={18}
          className={cn("h-[18px] w-auto", nadando && "delfin-saltando")}
        />
        <span className="font-display text-[15px] font-bold tracking-tight max-[640px]:hidden">dolphin</span>
      </div>
      )}

      {/* También adentro de la app: la barra lateral tenía las siete vistas repetidas y Nico pidió
          centralizarlo (31/10). Ahora la app tiene una sola entrada «Dolphin» y acá se elige cuál. */}
      {vista && alCambiarVista && (
        <nav
          ref={nav}
          aria-label="Vistas"
          onScroll={medirNav}
          // Si queda algo a la derecha (en el teléfono no entran todas), el borde se desvanece: avisa que scrollea.
          className={cn(
            // Sin caja alrededor (Nico, 30/10): la pastilla la lleva la vista que estás mirando, y no las
            // siete juntas adentro de un control segmentado, que es lo que se veía como una web cualquiera.
            // scroll-px: la activa, centrada al cambiar de vista, no queda comida contra el borde.
            "sin-barra flex min-w-0 flex-initial scroll-px-2 items-center gap-0.5 overflow-x-auto",
            masADerecha && !masAIzquierda && "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]",
            masAIzquierda && !masADerecha && "[mask-image:linear-gradient(to_right,transparent,black_28px)]",
            masAIzquierda && masADerecha && "[mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]",
          )}
        >
          {(
            [
              // El tablero propio es el centro; lo que corre ahora es «En vivo» (la vista vieja, #tablero).
              ["tareas", "Tablero"],
              ["tablero", "En vivo"],
              ["cosecha", "Cosechas"],
              ["bandeja", "Bandeja"],
              ["memoria", "Memoria"],
              ["bots", "Bots"],
              ["git", "Git"],
            ] as const
          ).map(([clave, rotulo]) => (
            <button
              key={clave}
              type="button"
              aria-current={vista === clave ? "page" : undefined}
              onClick={() => alCambiarVista(clave)}
              className={cn(
                "presionable flex-none cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 max-[640px]:px-2.5",
                vista === clave ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              {rotulo}
              {clave === "bandeja" && abiertos > 0 && (
                <span className="text-muted-foreground ml-1.5 font-normal tabular-nums">{abiertos}</span>
              )}
            </button>
          ))}
        </nav>
      )}

      {/* El proyecto que estás mirando, con su logo, y el menú para pasar a otro. */}
      {!embebida && <SelectorDeProyecto repo={repo} />}

      <span role="status" className="contents">
        {desconectado && (
          <span className="text-murio bg-murio/10 inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium">
            <WifiOff aria-hidden="true" className="size-3.5" />
            <span className="max-[640px]:sr-only">Sin conexión · reintentando</span>
          </span>
        )}
      </span>

      {/* La consola se actualiza sola: Refrescar es por si acaso, y no compite con nada. Los atajos, en su title. */}
      <div className="ml-auto flex flex-none items-center gap-1.5">
        {alAbrirPrompt && (
          <button
            type="button"
            onClick={(ev) => alAbrirPrompt(ev.currentTarget)}
            title="Master Prompt (P)"
            className="presionable text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium max-[640px]:px-2.5"
          >
            {/* Capturas con su nota → el pedido entero para Claude. Flota sobre cualquier vista, también adentro de la app. */}
            <WandSparkles aria-hidden="true" className="size-4" />
            <span className="max-[640px]:sr-only">Prompt</span>
          </button>
        )}
        {/* La acción principal tiene peso propio: no es una pestaña más entre las vistas. */}
        {alCambiarVista && (
          <button
            type="button"
            aria-current={vista === "nueva" ? "page" : undefined}
            onClick={() => alCambiarVista("nueva")}
            className="presionable bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold max-[640px]:px-2.5"
          >
            {/* Lanza agentes ya, sin tarjeta: es sembrar. Una tarjeta se anota en el Tablero. */}
            <Sprout aria-hidden="true" className="size-4" />
            <span className="max-[640px]:sr-only">Sembrar</span>
          </button>
        )}
        <button
          type="button"
          onClick={alRefrescar}
          aria-label="Refrescar"
          title="Refrescar (R)"
          className="presionable text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex size-8 cursor-pointer items-center justify-center rounded-full"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </button>
        {embebida && (
          <button
            type="button"
            onClick={() => pedirALaApp("abrir-afuera")}
            aria-label="Abrir en el navegador"
            title="Abrir en el navegador"
            className="presionable text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex size-8 cursor-pointer items-center justify-center rounded-full"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </header>
  );
}
