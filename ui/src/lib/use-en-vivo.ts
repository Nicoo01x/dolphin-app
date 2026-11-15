import { useEffect, useRef, useState } from "react";
import { reducirVivo, type EventoVivo, type Vivo } from "./vivo";
import { conProyecto } from "./api";

/**
 * La oreja del vivo: escucha `/en-vivo` y mantiene el estado de la
 * siembra en curso.
 *
 * El canal re-manda el archivo entero al conectar, así que lo primero que
 * llega puede ser la HISTORIA de una siembra ya terminada: eso no es un
 * vivo. Solo se considera vivo lo que tiene eventos frescos (de después
 * de abrir la conexión, con un margen) o lo que todavía no terminó.
 *
 * Es también el pulso de la conexión: si el servidor se cae, el canal lo
 * sabe primero (y el navegador reintenta solo). `enLinea` es eso.
 */
export function useEnVivo(alTerminar: () => void, alVolver?: () => void) {
  const [vivo, setVivo] = useState<Vivo | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;
  const alVolverRef = useRef(alVolver);
  alVolverRef.current = alVolver;

  useEffect(() => {
    let abierto = Date.now();
    let estado: Vivo | null = null;
    let fresco = false;
    let seCorto = false;
    let fuente: EventSource | null = null;
    let reintento: ReturnType<typeof setTimeout> | undefined;

    const conectar = () => {
      const esta = new EventSource(conProyecto("/en-vivo"));
      fuente = esta;
      esta.onopen = () => {
        // Cada conexión re-manda el archivo desde el principio: lo que llega es historia
        // hasta que aparezca algo de ahora. Sin esto, al reconectar se repetía la última
        // siembra como si fuera nueva y te sacaba de la cosecha que mirabas.
        abierto = Date.now();
        estado = null;
        fresco = false;
        setEnLinea(true);
        // Volvió después de un corte: lo que pasó mientras tanto no se vio.
        if (seCorto) alVolverRef.current?.();
        seCorto = false;
      };
      esta.onerror = () => {
        if (esta.readyState === EventSource.OPEN) return;
        seCorto = true;
        setEnLinea(false);
        // Cerrado (una respuesta de error, no una caída): el navegador ya no reintenta solo.
        if (esta.readyState === EventSource.CLOSED) {
          esta.close();
          reintento = setTimeout(conectar, 5_000);
        }
      };
      esta.onmessage = (mensaje) => {
        let evento: EventoVivo;
        try {
          evento = JSON.parse(mensaje.data as string) as EventoVivo;
        } catch {
          return;
        }

        if (evento.t >= abierto - 1500) fresco = true;
        estado = reducirVivo(estado, evento);

        if (evento.tipo === "cosecha") {
          // Terminó: la pantalla pasa a la cosecha guardada. Si era pura
          // historia (el replay del archivo), no hay nada que recargar.
          setVivo(null);
          if (fresco) alTerminarRef.current();
          fresco = false;
          estado = null;
          return;
        }

        // La historia de una siembra que quedó a medias (se mató el proceso)
        // tampoco es un vivo: sin eventos frescos no se muestra.
        setVivo(fresco ? estado : null);
      };
    };
    conectar();

    return () => {
      clearTimeout(reintento);
      fuente?.close();
    };
  }, []);

  return { vivo, enLinea };
}
