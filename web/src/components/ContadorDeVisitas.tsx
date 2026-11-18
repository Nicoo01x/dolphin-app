"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { contarVisita } from "@/lib/contador";

/** Suma una visita por cada página que se abre, incluso navegando sin recargar. */
export function ContadorDeVisitas() {
  const ruta = usePathname();
  useEffect(() => {
    if (!ruta || ruta.startsWith("/admin")) return;
    contarVisita(ruta + window.location.search);
  }, [ruta]);
  return null;
}
