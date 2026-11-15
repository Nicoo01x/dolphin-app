"use client";

import { motion } from "motion/react";
import { LAMINAS, type NombreDeLamina } from "@/lib/laminas";

/**
 * Una lámina de archivo, tratada como el grabado de la portada.
 *
 * Son litografías de 1747 y 1904 en dominio público. El tratamiento es lo que las hace parte del
 * sitio y no una estampita pegada encima (Nico, 31/10: «estas imágenes así son cualquier cosa»):
 * se invierten, se pasan a un solo tono y se funden con el fondo, así el papel crema de origen se
 * hunde hasta el azul noche y lo único que queda son las líneas del buril, claras.
 *
 * Sin marco y sin caja: el recuadro es justamente lo que las hacía ver pegadas. Queda el crédito
 * abajo, chiquito, porque una imagen de archivo sin su procedencia es una imagen de banco.
 */
export function LaminaDeArchivo({
  nombre,
  className,
  alto,
  prioridad = false,
}: {
  readonly nombre: NombreDeLamina;
  readonly className?: string;
  /** Recorta la lámina a esta altura (`h-72`, `aspect-[4/3]`…). Sin esto entra entera. */
  readonly alto?: string;
  /** Solo para una lámina que se vea sin bajar la página. El resto carga cuando llega. */
  readonly prioridad?: boolean;
}) {
  const lamina = LAMINAS[nombre];
  return (
    <motion.figure
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <div className={`relative overflow-hidden ${alto ?? ""}`}>
        <img
          src={lamina.src}
          alt={lamina.alt}
          width={lamina.ancho}
          height={lamina.alto}
          loading={prioridad ? "eager" : "lazy"}
          decoding="async"
          {...(prioridad ? { fetchPriority: "high" as const } : {})}
          // El mismo tratamiento que el grabado de la portada: invertido, de un solo tono y en
          // pantalla, con el contraste alto que hunde el papel hasta el negro.
          className={`block w-full mix-blend-screen [filter:invert(1)_grayscale(1)_brightness(0.72)_contrast(1.75)] ${alto ? "h-full object-cover" : ""}`}
        />
      </div>
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-espuma/10 pt-2 text-[13px] text-apagado">
        <span className="max-w-md normal-case">{lamina.epigrafe}</span>
        <span>{lamina.credito}</span>
      </figcaption>
    </motion.figure>
  );
}
