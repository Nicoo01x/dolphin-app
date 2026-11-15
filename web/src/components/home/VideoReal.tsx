"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import type { Video } from "./videos";

/**
 * Un video real de la app con el mismo marco que las capturas (radio 14, fondo oscuro, sombra en
 * dos capas). De dónde sale cada video y cómo regenerarlo: `public/videos/app-12-11/LEEME.md`.
 *
 * - `portada`: arranca solo, en bucle y sin sonido. El póster es la imagen prioritaria de la
 *   página (el video no compite con el LCP: `preload="metadata"`).
 * - `clip`: `preload="none"`; baja y se reproduce recién cuando entra en vista, y se pausa al salir.
 *
 * Con movimiento reducido no arranca solo: queda el póster y un botón para reproducirlo. Siempre
 * hay un botón de pausa accesible (WCAG 2.2.2: lo que se mueve más de 5 s se tiene que poder parar);
 * los controles nativos no se muestran.
 */
export function VideoReal({
  video,
  modo,
  ancho,
  className = "",
}: {
  readonly video: Video;
  readonly modo: "portada" | "clip";
  /** Tope en px de pantalla; por defecto, el tamaño al que se ve nítido. */
  readonly ancho?: number;
  readonly className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [andando, setAndando] = useState(false);
  // null hasta leer la preferencia: si arrancara en false, el primer efecto llamaría a play() y
  // el navegador dejaría de mostrar el póster aunque después se pause.
  const [reducido, setReducido] = useState<boolean | null>(null);
  const [pausadoAMano, setPausadoAMano] = useState(false);

  if (modo === "portada") {
    preload(video.poster, { as: "image", fetchPriority: "high" });
  }

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const leer = () => setReducido(consulta.matches);
    leer();
    consulta.addEventListener("change", leer);
    return () => consulta.removeEventListener("change", leer);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (reducido === null) return;
    if (!el || reducido || pausadoAMano) {
      el?.pause();
      return;
    }
    const reproducir = () => {
      el.play().catch(() => setAndando(false));
    };
    if (modo === "portada") {
      reproducir();
      return;
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) {
          reproducir();
        } else {
          el.pause();
        }
      },
      { threshold: 0.35 },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [modo, reducido, pausadoAMano]);

  const alternar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      setPausadoAMano(false);
      el.play().catch(() => setAndando(false));
    } else {
      setPausadoAMano(true);
      el.pause();
    }
  };

  const tope = ancho ?? Math.round(video.ancho / video.escala);
  return (
    <div
      className={`marco-captura relative overflow-hidden rounded-[14px] bg-[#111111] ${className}`}
      style={{ maxWidth: tope }}
    >
      <video
        ref={ref}
        width={video.ancho}
        height={video.alto}
        poster={video.poster}
        muted
        loop
        playsInline
        preload={modo === "portada" ? "metadata" : "none"}
        aria-label={video.alt}
        onPlay={() => setAndando(true)}
        onPause={() => setAndando(false)}
        className="block h-auto w-full"
      >
        <source src={video.webm} type="video/webm" />
        <source src={video.mp4} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={alternar}
        aria-label={andando ? "Pausar el video" : "Reproducir el video"}
        className={`absolute right-3 bottom-3 grid cursor-pointer place-items-center rounded-full bg-[rgb(17_17_17/0.72)] text-white backdrop-blur transition-[opacity,transform] duration-150 ease-out hover:bg-[rgb(17_17_17/0.9)] focus-visible:opacity-100 active:scale-[0.94] ${
          andando ? "size-9 opacity-60 hover:opacity-100" : "size-12 opacity-100"
        }`}
      >
        {andando ? <IconoPausa /> : <IconoPlay />}
      </button>
    </div>
  );
}

function IconoPausa() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
    </svg>
  );
}

function IconoPlay() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="ml-0.5 size-4" fill="currentColor">
      <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
    </svg>
  );
}
