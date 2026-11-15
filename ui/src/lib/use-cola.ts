import { useEffect, useState } from "react";
import { traerCola, type TareaDeCola } from "./api";

/**
 * La cola, al día: mientras hay algo trabajando se mira seguido; quieta, de
 * vez en cuando. Sin canal en vivo propio: la cola escribe su estado en
 * disco y con eso alcanza.
 */
export function useCola(): TareaDeCola[] {
  const [tareas, setTareas] = useState<TareaDeCola[]>([]);

  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;

    const mirar = async () => {
      const activa = await traerCola()
        .then(({ tareas }) => {
          if (vivo) setTareas(tareas);
          return tareas.some((t) => t.estado === "esperando" || t.estado === "trabajando");
        })
        .catch(() => false);
      if (vivo) reloj = window.setTimeout(() => void mirar(), activa ? 1500 : 10_000);
    };
    void mirar();

    return () => {
      vivo = false;
      window.clearTimeout(reloj);
    };
  }, []);

  return tareas;
}
