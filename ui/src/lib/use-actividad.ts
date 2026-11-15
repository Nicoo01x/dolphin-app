import { useEffect, useState } from "react";
import { traerActividad, type Actividad } from "./api";

export type EstadoActividad =
  | { que: "cargando" }
  | { que: "error"; motivo: string }
  | { que: "lista"; actividad: Actividad[]; recortada: boolean };

/**
 * La actividad, al día. Se vuelve a pedir cuando cambia `señal` —termina
 * una siembra— y, quieta, cada 15 s: la bandeja y la memoria no avisan.
 * Si un pedido falla y ya había datos, se quedan los de antes: un corte de
 * red no borra lo que ya se veía.
 */
export function useActividad(señal: unknown): EstadoActividad {
  const [estado, setEstado] = useState<EstadoActividad>({ que: "cargando" });

  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;

    const mirar = async () => {
      try {
        const { actividad, recortada } = await traerActividad();
        if (vivo) setEstado({ que: "lista", actividad, recortada: recortada === true });
      } catch (error) {
        if (vivo)
          setEstado((antes) =>
            antes.que === "lista" ? antes : { que: "error", motivo: error instanceof Error ? error.message : String(error) },
          );
      }
      if (vivo) reloj = window.setTimeout(() => void mirar(), 15_000);
    };
    void mirar();

    return () => {
      vivo = false;
      window.clearTimeout(reloj);
    };
  }, [señal]);

  return estado;
}
