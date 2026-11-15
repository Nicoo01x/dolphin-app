"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Una función contada con el mismo clip que la muestra adentro de la app.
 *
 * Por qué el mismo archivo y no una captura: hay cosas que no se entienden quietas. Delegar son
 * tres terminales abriéndose solas; en una foto son tres rectángulos.
 *
 * Arranca cuando entra en pantalla, no al cargar: son cientos de kilobytes que no tiene por qué
 * bajar alguien que nunca llega hasta acá. Y si el sistema pide menos movimiento, no se mueve: se
 * queda el póster con su botón, y la persona decide.
 *
 * El texto de abajo no es decoración. Es lo que dice el clip para quien no puede verlo —y lo
 * único que un buscador lee de un video.
 *
 * Sin `Ventana` alrededor, a diferencia de las capturas: el clip es una grabación de la app y ya
 * trae su propia barra con el logo y el proyecto. Enmarcarlo daba dos barras de título y dos
 * logos, uno arriba del otro.
 */
export function VideoDeFuncion({
  src,
  poster,
  ancho,
  alto,
  queSeVe,
  className = "",
}: {
  src: string;
  poster: string;
  ancho: number;
  alto: number;
  queSeVe: string;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [menosMovimiento, setMenosMovimiento] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mirar = () => setMenosMovimiento(consulta.matches);
    mirar();
    consulta.addEventListener("change", mirar);
    return () => consulta.removeEventListener("change", mirar);
  }, []);

  useEffect(() => {
    const elemento = video.current;
    if (!elemento || menosMovimiento) {
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            // `play()` devuelve una promesa que el navegador rechaza si decide que no corresponde
            // (una pestaña en segundo plano, el ahorro de datos). No es un error nuestro.
            void elemento.play().catch(() => {});
          } else {
            elemento.pause();
          }
        }
      },
      { threshold: 0.35 },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [menosMovimiento]);

  return (
    <figure className={className}>
      <div className="overflow-hidden bg-lienzo-2 ring-1 ring-espuma/10">
        <video
          ref={video}
          src={src}
          poster={poster}
          width={ancho}
          height={alto}
          muted
          loop
          playsInline
          preload="none"
          controls={menosMovimiento}
          aria-label={queSeVe}
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="mt-4 text-[15px] leading-relaxed text-tinta/80">{queSeVe}</figcaption>
    </figure>
  );
}
