"use client";

import { motion } from "motion/react";

/**
 * El encabezado de una sección, con el armado de Linear: el título grande a la IZQUIERDA y la
 * explicación en su propia columna a la derecha, no debajo y centrada.
 *
 * Existe como componente para que la escala no se vuelva a escribir a mano en cada sección: hasta
 * el 01/11 había siete `clamp()` distintos y tres rótulos en versales con tracking, que es
 * justo lo que vuelve genérica una página.
 *
 * El rótulo de antes («EL CICLO DE TRABAJO», en versales con 0.22em) no se repone: en el catálogo
 * de slop de Nico los labels en mayúscula con tracking están marcados, y Linear tampoco los usa
 * arriba de sus títulos.
 */
export function Encabezado({
  id,
  titulo,
  bajada,
  enlace,
}: {
  readonly id: string;
  readonly titulo: React.ReactNode;
  readonly bajada: React.ReactNode;
  readonly enlace?: { readonly href: string; readonly texto: string };
}) {
  return (
    <motion.div
      initial={{ y: 18 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-x-16 gap-y-6 lg:grid-cols-2"
    >
      <h2 id={id} className="titulo-seccion max-w-[14ch]">
        {titulo}
      </h2>
      <div className="max-w-[46ch] lg:pt-1.5">
        <p className="bajada">{bajada}</p>
        {enlace && (
          <a
            href={enlace.href}
            className="group mt-5 inline-flex items-center gap-1.5 text-[16px] text-espuma transition-colors hover:text-white"
          >
            {enlace.texto}
            <span aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
              →
            </span>
          </a>
        )}
      </div>
    </motion.div>
  );
}

/** La caja de una sección: el mismo ancho, el mismo aire y el mismo margen en todas. */
export function Seccion({
  id,
  etiqueta,
  tonal,
  children,
}: {
  readonly id?: string;
  readonly etiqueta?: string;
  /** Un escalón más claro que el lienzo: así se separa de la anterior sin una línea en el medio. */
  readonly tonal?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={etiqueta}
      className={`scroll-mt-20 px-6 py-24 md:px-10 md:py-32 ${tonal ? "bg-lienzo-2" : ""}`}
    >
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </section>
  );
}
