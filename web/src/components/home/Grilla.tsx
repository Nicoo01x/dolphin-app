import type { ReactNode } from "react";
import type { Captura } from "./capturas";
import type { Paisaje } from "./Lamina";
import { Marco } from "./Marco";
import type { Video } from "./videos";
import { VideoReal } from "./VideoReal";

/**
 * La grilla de tres columnas de la home: cada celda, un recorte real de la app sobre un pedazo de
 * paisaje, con un título corto y una línea. La usan «Y además» y «Nuevo en la 1.7».
 *
 * Una pieza más alta que su caja arranca arriba y se corta abajo, como un recorte de la ventana.
 * Las celdas con clip lo bajan recién al entrar en vista (`preload="none"`).
 */
export interface Celda {
  readonly titulo: string;
  readonly linea: ReactNode;
  readonly pieza: { readonly video: Video } | { readonly captura: Captura; readonly ancho?: number };
  readonly paisaje: Paisaje;
  readonly foco: string;
  /** Ocupa dos columnas en escritorio. */
  readonly ancha?: boolean;
}

export function Grilla({ celdas }: { readonly celdas: readonly Celda[] }) {
  return (
    <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {celdas.map((celda) => (
        <li key={celda.titulo} className={`overflow-hidden rounded-[24px] bg-lienzo-2 ${celda.ancha ? "sm:col-span-2" : ""}`}>
          <div
            className={`relative flex flex-col items-center overflow-hidden px-5 py-6 sm:px-7 [justify-content:safe_center] ${
              celda.ancha && "video" in celda.pieza ? "h-[300px] sm:h-[420px]" : "h-[300px]"
            }`}
          >
            <img
              src={celda.paisaje.src}
              width={celda.paisaje.ancho}
              height={celda.paisaje.alto}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
              style={{ objectPosition: celda.foco }}
            />
            {"video" in celda.pieza ? (
              <VideoReal video={celda.pieza.video} modo="clip" ancho={celda.ancha ? 600 : 400} className="relative w-full flex-none" />
            ) : (
              <Marco captura={celda.pieza.captura} ancho={celda.pieza.ancho} className="relative w-full flex-none" />
            )}
          </div>
          <div className="px-5 pt-4 pb-5">
            <h3 className="text-[16px] leading-[1.3] font-medium tracking-[-0.012em] text-espuma">{celda.titulo}</h3>
            <p className="mt-1.5 text-[14px] leading-[1.5] text-tenue">{celda.linea}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
