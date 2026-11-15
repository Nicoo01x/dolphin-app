"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { INSTALAR } from "@/lib/contenido";

/**
 * El comando de instalación es el llamado a la acción: uno solo, entero (en el celular baja de
 * renglón en vez de cortarse) y un botón para copiarlo que confirma con un tilde. Es el mismo en los
 * tres sistemas, así que no hay pestañas: elegir entre tres iguales era una elección falsa.
 */
export function Instalar({ className }: { className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const comando = INSTALAR.comando;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // sin portapapeles (http, permisos): el comando sigue a la vista para copiarlo a mano
    }
  };
  return (
    <div className={className}>
      {/* La caja de la terminal: una superficie tonal con el radio de una caja, sin borde. El
          prompt en celeste es el único lugar del bloque donde aparece el acento. */}
      <div className="flex items-center gap-3 rounded-[var(--radius-caja)] bg-lienzo-3 py-2 pr-2 pl-4">
        <code className="min-w-0 flex-1 font-codigo text-[14px] [overflow-wrap:anywhere] text-espuma max-sm:text-[13px]">
          <span className="select-none text-electrico">$ </span>
          {comando}
        </code>
        <motion.button
          onClick={copiar}
          whileTap={{ scale: 0.96 }}
          aria-label={copiado ? "Copiado" : "Copiar el comando"}
          className="relative grid h-11 min-w-[92px] sm:h-9 flex-none place-items-center rounded-full bg-espuma px-4 text-[13px] font-medium text-lienzo transition-colors hover:bg-black"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copiado ? "si" : "no"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {copiado ? "✓ Copiado" : "Copiar"}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
      {/* En minúscula y sin tracking: las versales de antes eran lo más genérico de la página. */}
      <p className="mt-2.5 text-[13px] text-apagado">{INSTALAR.sistemas}</p>
    </div>
  );
}
