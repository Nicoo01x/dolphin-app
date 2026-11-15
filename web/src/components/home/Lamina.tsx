import type { ReactNode } from "react";

/**
 * Un paisaje a sangre con algo encima: la superficie de todas las escenas de la home.
 *
 * Why `<img>` y no `background-image`: así el navegador difiere solo los que están abajo
 * (`loading="lazy"`) y el de la portada sale con prioridad y con su ancho y alto puestos, sin
 * saltos. Es decorativo: `alt=""` y `aria-hidden`, un lector de pantalla no tiene nada que leer ahí.
 *
 * En el celular la lámina va de borde a borde y la tarjeta queda a 16 px de cada lado; desde `sm`
 * vuelve a ser una caja redondeada dentro del margen de la página.
 */

export interface Paisaje {
  readonly src: string;
  readonly ancho: number;
  readonly alto: number;
}

/** Los óleos, con su tamaño real (para que el navegador reserve el lugar). Origen en LEEME.md. */
export const PAISAJES = {
  lago: { src: "/paisajes/lago.webp", ancho: 2000, alto: 1352 },
  andes: { src: "/paisajes/andes.webp", ancho: 1600, alto: 882 },
  lagoQuieto: { src: "/paisajes/lago-quieto.webp", ancho: 1600, alto: 1194 },
  meandro: { src: "/paisajes/meandro.webp", ancho: 1600, alto: 1094 },
  merced: { src: "/paisajes/merced.webp", ancho: 1600, alto: 1150 },
  desfiladero: { src: "/paisajes/desfiladero.webp", ancho: 1600, alto: 1136 },
  delaware: { src: "/paisajes/delaware.webp", ancho: 1600, alto: 1148 },
} as const satisfies Record<string, Paisaje>;

export function Lamina({
  paisaje,
  foco = "center",
  prioridad = false,
  lado = "centro",
  className = "",
  children,
}: {
  readonly paisaje: Paisaje;
  /** `object-position`: qué parte del cuadro queda a la vista cuando se recorta. */
  readonly foco?: string;
  /** `true`: la imagen prioritaria de la página. `"sin-diferir"`: arriba del pliegue, pero cede la prioridad (a un póster). */
  readonly prioridad?: boolean | "sin-diferir";
  readonly lado?: "izquierda" | "centro" | "derecha";
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const justificar = lado === "izquierda" ? "md:justify-start" : lado === "derecha" ? "md:justify-end" : "md:justify-center";
  return (
    <div
      className={`relative -mx-4 flex items-center overflow-hidden p-4 sm:mx-0 sm:rounded-escena sm:p-10 md:p-14 ${className}`}
    >
      <img
        src={paisaje.src}
        width={paisaje.ancho}
        height={paisaje.alto}
        alt=""
        aria-hidden
        loading={prioridad ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={prioridad === true ? "high" : "auto"}
        className="absolute inset-0 size-full object-cover"
        style={{ objectPosition: foco }}
      />
      <div className={`relative flex w-full justify-center ${justificar}`}>{children}</div>
    </div>
  );
}
