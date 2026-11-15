import { useEffect, useState } from "react";
import { traerGuardian, type EstadoDeGuardian } from "./api";

/**
 * Lo que vio Guardian, al día: se relee cada 15 s, porque Guardian corre
 * aparte (npm run guardian) y no avisa. Sin datos, o si el pedido falla
 * antes de tener alguno, es null: el tablero no muestra la tarjeta.
 */
export function useGuardian(): EstadoDeGuardian | null {
  const [estado, setEstado] = useState<EstadoDeGuardian | null>(null);

  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;
    const mirar = async () => {
      try {
        const leido = await traerGuardian();
        if (vivo) setEstado(leido);
      } catch {
        // Un corte de red no borra lo que ya se veía.
      }
      if (vivo) reloj = window.setTimeout(() => void mirar(), 15_000);
    };
    void mirar();
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
    };
  }, []);

  return estado;
}
