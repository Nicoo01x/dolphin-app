import type { WriteStream } from "node:tty";
import { aplicarEvento, estadoInicial, type EstadoTablero, type EventoConHora } from "./estado.js";
import { dibujarTablero } from "./dibujo.js";

/**
 * Un tablero redibujándose en la terminal. Usa la pantalla alternativa (como `less` o `htop`):
 * al terminar, la terminal vuelve como estaba y el último cuadro queda impreso en el historial.
 * Sin parpadeo: cada cuadro va de una vez, dentro de una actualización sincronizada (la terminal
 * que la entiende lo pinta entero; la que no, lo ignora), cursor arriba y borrando lo que sobra.
 */

const ALTERNATIVA = "\x1b[?1049h";
const NORMAL = "\x1b[?1049l";
const SIN_CURSOR = "\x1b[?25l";
const CON_CURSOR = "\x1b[?25h";
const ARRIBA = "\x1b[H";
const BORRAR_HASTA_EL_FINAL = "\x1b[J";
const BORRAR_LINEA = "\x1b[K";
const SINCRO_EMPIEZA = "\x1b[?2026h";
const SINCRO_TERMINA = "\x1b[?2026l";

export interface Pantalla<E> {
  recibir(evento: E): void;
  /** Deja de redibujar, vuelve a la pantalla normal e imprime el último cuadro. */
  cerrar(): void;
}

export interface Medidas {
  ancho: number;
  alto: number;
  ahora: number;
  color: boolean;
}

/** Abre una pantalla en vivo para cualquier tablero: un estado, cómo cambia y cómo se dibuja. */
export function abrirPantalla<E>(
  salida: WriteStream,
  aplicar: (evento: E) => void,
  dibujar: (medidas: Medidas) => string[],
  opciones: { cuadroMs?: number; ahora?: () => number } = {},
): Pantalla<E> {
  const ahora = opciones.ahora ?? Date.now;
  const color = salida.hasColors?.() ?? true;
  let cerrado = false;
  const cuadro = (): string[] => dibujar({ ancho: salida.columns ?? 100, alto: salida.rows ?? 40, ahora: ahora(), color });

  const pintar = (): void => {
    if (cerrado) return;
    const lineas = cuadro().slice(0, Math.max(10, (salida.rows ?? 60) - 1));
    salida.write(SINCRO_EMPIEZA + ARRIBA + lineas.map((l) => l + BORRAR_LINEA).join("\n") + BORRAR_HASTA_EL_FINAL + SINCRO_TERMINA);
  };
  const restaurar = (): void => {
    if (!cerrado) salida.write(CON_CURSOR + NORMAL);
  };
  // Un Ctrl+C o un error no pueden dejar la terminal en la pantalla alternativa sin cursor.
  process.once("exit", restaurar);

  salida.write(ALTERNATIVA + SIN_CURSOR);
  const latido = setInterval(pintar, opciones.cuadroMs ?? 100);
  latido.unref();
  const alCambiarTamano = (): void => pintar();
  salida.on("resize", alCambiarTamano);
  pintar();

  return {
    recibir(evento) {
      aplicar(evento);
    },
    cerrar() {
      if (cerrado) return;
      clearInterval(latido);
      salida.off("resize", alCambiarTamano);
      const ultimo = cuadro();
      cerrado = true;
      salida.write(CON_CURSOR + NORMAL);
      salida.write(`\n${ultimo.join("\n")}\n`);
      process.off("exit", restaurar);
    },
  };
}

export interface TableroEnVivo extends Pantalla<EventoConHora> {
  readonly estado: EstadoTablero;
}

/** El tablero de una siembra. */
export function abrirTablero(salida: WriteStream, ahora: () => number = Date.now): TableroEnVivo {
  const estado = estadoInicial(ahora());
  const pantalla = abrirPantalla<EventoConHora>(
    salida,
    (evento) => aplicarEvento(estado, evento),
    (m) =>
      dibujarTablero(estado, {
        ancho: m.ancho,
        ahora: m.ahora,
        color: m.color,
        // El log usa lo que sobra de alto, entre 4 y 10 renglones.
        renglonesDeLog: Math.max(4, Math.min(10, m.alto - 34)),
      }),
    { ahora },
  );
  return { ...pantalla, estado };
}
