/**
 * Mover la ventana flotante de la delegación adentro del panel del chat.
 *
 * La isla arrastra una ventana de Electron (ver isla/use-arrastre-isla.ts) y por eso le pide al
 * proceso principal que la mueva. Esta flota adentro de un panel, así que la posición es de este
 * lado y se guarda contra la esquina de abajo a la derecha: el chat crece hacia arriba, y anclada
 * arriba a la izquierda la ventana se despegaba del compositor cada vez que entraba un mensaje.
 */

export type PosicionDeVentana = {
  /** Píxeles entre el borde derecho de la ventana y el del panel. */
  readonly derecha: number
  /** Píxeles entre el borde de abajo de la ventana y el del panel. */
  readonly abajo: number
}

export const POSICION_INICIAL: PosicionDeVentana = { derecha: 16, abajo: 16 }

/** Un borde afuera y quien la arrastró se queda sin cabecera para traerla de vuelta. */
const MINIMO_A_LA_VISTA = 48

export type LimitesDelPanel = {
  readonly ancho: number
  readonly alto: number
  readonly anchoVentana: number
  readonly altoVentana: number
}

const entre = (valor: number, minimo: number, maximo: number): number =>
  Math.min(Math.max(valor, minimo), Math.max(minimo, maximo))

/**
 * Dónde queda la ventana después de mover el puntero `delta` píxeles. Siempre con un pedazo
 * adentro del panel: un panel más chico que la ventana (una columna partida en cuatro) no la
 * manda afuera, la deja pegada al borde.
 */
export function moverVentana(
  posicion: PosicionDeVentana,
  delta: { readonly x: number; readonly y: number },
  limites: LimitesDelPanel
): PosicionDeVentana {
  const aLaVista = Math.min(MINIMO_A_LA_VISTA, limites.anchoVentana, limites.altoVentana)
  return {
    derecha: entre(
      posicion.derecha - delta.x,
      aLaVista - limites.anchoVentana,
      limites.ancho - aLaVista
    ),
    abajo: entre(posicion.abajo - delta.y, aLaVista - limites.altoVentana, limites.alto - aLaVista)
  }
}
