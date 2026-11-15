import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Copiar con respuesta. Sin ella, quien toca «Copiar» se queda con la duda
 * de si se copió: el explorador de Dolphin lo marcó como botón roto, y
 * tenía razón. Si el portapapeles no deja, lo dice; no finge un «Copiado».
 */
export function BotonCopiar({
  alCopiar,
  rotulo,
  disabled = false,
  chico = false,
}: {
  alCopiar: () => Promise<boolean>;
  rotulo: string;
  disabled?: boolean;
  chico?: boolean;
}) {
  const [estado, setEstado] = useState<"quieto" | "copiado" | "fallo">("quieto");
  const reloj = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  const copiar = async () => {
    const salio = await alCopiar().catch(() => false);
    setEstado(salio ? "copiado" : "fallo");
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setEstado("quieto"), salio ? 1600 : 2600);
  };

  const texto = estado === "copiado" ? "Copiado" : estado === "fallo" ? "No se pudo copiar" : rotulo;

  // `relative`: el aviso es absoluto, y sin un ancestro posicionado se ubicaba
  // contra el body y estiraba la página aunque viviera en un panel con scroll.
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void copiar()}
        className={cn(
          "presionable bg-secondary hover:bg-accent inline-flex cursor-pointer items-center rounded-full font-medium disabled:cursor-default disabled:opacity-40",
          chico ? "h-8 gap-1.5 px-3 text-xs" : "h-9 gap-2 px-4 text-[13px]",
        )}
      >
        {estado === "copiado" ? (
          <Check aria-hidden="true" className={cn("text-paso", chico ? "size-3.5" : "size-4")} />
        ) : (
          <Copy aria-hidden="true" className={chico ? "size-3.5" : "size-4"} />
        )}
        <span className={cn(estado === "fallo" && "text-murio")}>{texto}</span>
      </button>
      {/* El lector de pantalla también se entera. Va AL LADO del botón: adentro
          le cambiaba el nombre a «Copiado Copiado al portapapeles». */}
      <span role="status" className="sr-only">
        {estado === "copiado" ? "Copiado al portapapeles" : estado === "fallo" ? "No se pudo copiar" : ""}
      </span>
    </span>
  );
}
