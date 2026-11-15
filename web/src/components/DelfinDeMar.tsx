"use client";

import { motion } from "motion/react";
import { Oceano } from "./Oceano";
import { Rosa } from "./Rosa";

/**
 * El mar, adentro del delfín.
 *
 * Es la pieza propia del sitio, la que no puede tener nadie más: la litografía del delfín de la
 * expedición del Erebus y el Terror (1844) recorta el océano en vivo —el mismo shader que se usa
 * como estampa—, así que el animal de 1844 está hecho de agua que se mueve, con su sol y sus
 * brillos. Encima va el grabado de verdad, tenue, para que no se pierda el buril que lo dibujó.
 *
 * Cómo funciona, por si hay que tocarlo: `delfin-mascara.png` es la misma litografía en blanco y
 * negro, invertida y metida en el CANAL ALFA (la genera `sharp`, ver public/laminas/FUENTE.md).
 * Tiene que ser el alfa y no la luminancia: una máscara opaca la toma el navegador como «se ve
 * todo» y no recorta nada, que es lo que pasaba con el WebP. Sin WebGL2 el canvas queda vacío y se
 * ve solo el grabado, que es exactamente lo que hay que ver.
 */
export function DelfinDeMar({ className }: { readonly className?: string }) {
  return (
    <motion.figure
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`relative ${className ?? ""}`}
    >
      {/* Los rayos de la rosa de los vientos, detrás: el halo del grabado de una lámina antigua. */}
      <Rosa className="pointer-events-none absolute top-1/2 left-1/2 size-[132%] -translate-x-1/2 -translate-y-1/2 text-electrico/20" />

      <div className="relative aspect-[1708/1282] w-full">
        {/* El agua, recortada con la forma del animal. */}
        <div
          className="absolute inset-0 [mask-image:url(/laminas/delfin-mascara.webp)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
          aria-hidden="true"
        >
          {/* Bajo el agua y no en la superficie: con el horizonte adentro, la línea del mar le cortaba
              el cuerpo al animal por la mitad. Acá son rayos de sol y cáusticas, que es textura de
              agua sin una raya que atraviese el dibujo. */}
          <Oceano tramo={[0.22, 0.3]} />
        </div>
        {/* El grabado encima, tenue: las líneas del buril sobre el agua. */}
        <img
          src="/laminas/delfin.webp"
          alt="Litografía de un delfín de costado, de la zoología del viaje del HMS Erebus y Terror (1844), con el mar en movimiento adentro de su silueta."
          width={1200}
          height={901}
          fetchPriority="high"
          className="absolute inset-0 size-full object-contain opacity-70 mix-blend-screen [filter:invert(1)_grayscale(1)_brightness(0.7)_contrast(1.9)]"
        />
      </div>

      <figcaption className="relative mt-3 flex flex-wrap items-baseline justify-between gap-x-6 border-t border-espuma/10 pt-2 text-[13px] text-apagado">
        <span>Delphinus, lám. 24 · con el mar adentro</span>
        <span>Richardson y Gray · 1844</span>
      </figcaption>
    </motion.figure>
  );
}
