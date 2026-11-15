import { useEffect, useState } from "react";
import { traerRendimiento, type InformeDeRendimiento } from "./api";

export type EstadoRendimiento =
  | { que: "cargando" }
  | { que: "error"; motivo: string }
  | { que: "listo"; informe: InformeDeRendimiento };

/**
 * El informe de rendimiento, al día. Se vuelve a pedir cuando cambia el
 * tipo de tarea elegido o `señal` —termina una siembra—: las cifras solo
 * cambian cuando una rama escribe. Si un pedido falla y ya había datos,
 * se quedan los de antes.
 */
export function useRendimiento(tipo: string | undefined, señal: unknown): EstadoRendimiento {
  const [estado, setEstado] = useState<EstadoRendimiento>({ que: "cargando" });

  useEffect(() => {
    let vivo = true;
    traerRendimiento(tipo).then(
      (informe) => {
        if (vivo) setEstado({ que: "listo", informe });
      },
      (error: unknown) => {
        if (vivo)
          setEstado((antes) =>
            antes.que === "listo" ? antes : { que: "error", motivo: error instanceof Error ? error.message : String(error) },
          );
      },
    );
    return () => {
      vivo = false;
    };
  }, [tipo, señal]);

  return estado;
}
