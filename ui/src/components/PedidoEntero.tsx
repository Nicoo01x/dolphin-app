import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { restoDeTarea } from "@/lib/datos";
import { cn } from "@/lib/utils";

/**
 * Lo que vio el agente además del título: el elemento que tocaste en el modo
 * live, o los asuntos que se juntaron desde la bandeja. Cerrado no ocupa
 * lugar; abierto se lee entero, con sus saltos de línea. Una tarea de una
 * línea no tiene nada que abrir.
 */
export function PedidoEntero({ tarea }: { tarea: string }) {
  const [abierto, setAbierto] = useState(false);
  const resto = restoDeTarea(tarea);
  if (resto === "") return null;
  return (
    <div className="mt-1.5 max-w-[72ch]">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((x) => !x)}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-7 cursor-pointer items-center gap-1 text-[12px] font-medium transition-colors duration-150"
      >
        El pedido entero
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-150", abierto && "rotate-180")} />
      </button>
      {/* Abierto no empuja la rama y el código fuera de la pantalla: tiene su alto y su scroll. Monoespaciada,
          porque lo que vio el agente es código y estilos. */}
      {abierto && (
        <pre className="bg-secondary/60 text-foreground/80 mt-1 max-h-48 overflow-auto rounded-2xl px-3.5 py-2.5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">
          {resto}
        </pre>
      )}
    </div>
  );
}
