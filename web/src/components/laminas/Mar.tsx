"use client";

import { Oceano } from "../Oceano";
import { metrosDe, zonaDe, type Tramo } from "@/lib/profundidad";

/**
 * El mar, enmarcado: la única pieza con color del sitio y la única que se mueve sola.
 *
 * Hasta el 31/10 el océano era el fondo de la página entera, y eso la arruinaba: el tramado del
 * grabado se leía como una textura sucia, el sol dejaba una mancha blanca en el medio y todo lo
 * que iba encima necesitaba un vidrio turbio para poder leerse (Nico: «toda la web está
 * asquerosa»). Del tamaño de un cuadro, el mismo shader es una estampa.
 *
 * El epígrafe dice a qué profundidad mira: es lo que explica por qué una tiene sol y otra es casi
 * negra.
 */
export function Mar({
  numero,
  tramo,
  epigrafe,
  alto = "h-[58svh] min-h-[320px]",
  className,
}: {
  /** El número de la estampa, en romanos, como en las láminas de archivo. */
  readonly numero: string;
  readonly tramo: Tramo;
  readonly epigrafe: string;
  readonly alto?: string;
  readonly className?: string;
}) {
  const desde = metrosDe(tramo[0]);
  const hasta = metrosDe(tramo[1]);
  const metros = desde === hasta ? `${desde.toLocaleString("es-AR")} m` : `${desde.toLocaleString("es-AR")}–${hasta.toLocaleString("es-AR")} m`;
  return (
    <figure className={className}>
      <div className={`relative overflow-hidden bg-lienzo-2 ring-1 ring-espuma/15 ${alto}`}>
        <Oceano tramo={tramo} />
        <span className="pointer-events-none absolute top-0 left-0 bg-lienzo/80 px-2.5 py-1 text-[11px] text-espuma/80">
          Lám. {numero}
        </span>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-espuma/10 pt-2">
        <span className="max-w-xl text-[15px] text-tinta/80">{epigrafe}</span>
        <span className="text-[11px] text-tinta/65 tabular-nums">
          {metros} · {zonaDe(hasta)}
        </span>
      </figcaption>
    </figure>
  );
}
