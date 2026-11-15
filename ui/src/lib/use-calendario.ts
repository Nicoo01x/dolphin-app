import { useCallback, useEffect, useState } from "react";
import { traerCalendario, type TurnoAgendado } from "./api";

/**
 * El calendario, al día: con algo corriendo o por correr en los próximos
 * minutos se mira seguido; si no, de vez en cuando.
 */
export function useCalendario(): { turnos: TurnoAgendado[]; refrescar: () => void } {
  const [turnos, setTurnos] = useState<TurnoAgendado[]>([]);
  const [vuelta, setVuelta] = useState(0);
  const refrescar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;

    const mirar = async () => {
      const cerca = await traerCalendario()
        .then(({ turnos }) => {
          if (vivo) setTurnos(turnos);
          const pronto = Date.now() + 5 * 60 * 1000;
          return turnos.some((t) => t.estado === "corriendo" || (t.estado === "agendado" && new Date(t.cuando).getTime() < pronto));
        })
        .catch(() => false);
      if (vivo) reloj = window.setTimeout(() => void mirar(), cerca ? 2000 : 30_000);
    };
    void mirar();

    return () => {
      vivo = false;
      window.clearTimeout(reloj);
    };
  }, [vuelta]);

  return { turnos, refrescar };
}
