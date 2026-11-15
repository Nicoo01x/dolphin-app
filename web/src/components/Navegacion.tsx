"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { LogoPastilla } from "./Logo";
import { REPO } from "@/lib/contenido";
import { SECCIONES } from "@/lib/navegacion";

/** ¿Este enlace es la página donde estás? Las anclas de la home no cuentan como página. */
function esActual(href: string, ruta: string): boolean {
  if (href.includes("#")) return false;
  return href === "/" ? ruta === "/" : ruta === href || ruta.startsWith(`${href}/`);
}

/**
 * La barra que flota arriba, en todas las páginas. En el celular quedan Bots, Docs e Instalar: el
 * resto está en el pie, así no hace falta un menú que tape la pantalla.
 *
 * Armada como la de Linear (01/11): wordmark chico a la izquierda, los links juntos a la derecha
 * en minúscula y a 14 px —se fueron las versales con tracking de hermes-agent— y una pill blanca
 * de 32 px al final. Nada separado con filetes; la barra se apoya en el fondo y se despega con
 * desenfoque cuando hay contenido abajo.
 */
export function Navegacion() {
  const ruta = usePathname() ?? "/";
  // Next exporta las páginas con la ruta sin barra final; por si un servidor la agrega.
  const actual = ruta.length > 1 ? ruta.replace(/\/$/, "") : ruta;
  const enInicio = actual === "/";
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      // Fondo sólido: el vidrio esmerilado en la barra es uno de los tics que Nico sacó (27/10).
      className="sticky top-0 z-50 bg-lienzo px-4 md:px-10"
    >
      <nav aria-label="Principal" className="mx-auto flex h-[64px] w-full max-w-[1200px] items-center gap-3 sm:gap-6">
        <a href="/" className="flex flex-none items-center gap-2 text-[17px] leading-none font-medium tracking-[-0.02em] text-espuma" aria-label="Dolphin, al inicio">
          <LogoPastilla className="size-[22px]" />
          <span className="max-[400px]:hidden">Dolphin</span>
        </a>
        <div className="ml-auto flex min-w-0 items-center gap-5 text-[14px] tracking-[-0.01em] text-tenue md:gap-7">
          {SECCIONES.map((s) => {
            const es = esActual(s.href, actual);
            return (
              <a
                key={s.href}
                href={s.href}
                aria-current={es ? "page" : undefined}
                className={`py-2 transition-colors hover:text-espuma aria-[current=page]:text-espuma ${s.siempre ? "" : "max-md:hidden"}`}
              >
                {s.nombre}
              </a>
            );
          })}
          <a href={REPO} className="py-2 transition-colors hover:text-espuma max-md:hidden">
            GitHub
          </a>
        </div>
        <a
          href={enInicio ? "#instalar" : "/docs/instalacion"}
          className="boton-pill ml-4 h-[32px] flex-none px-3.5 text-[13px] max-[400px]:ml-2"
        >
          Descargar
        </a>
      </nav>
    </motion.header>
  );
}
