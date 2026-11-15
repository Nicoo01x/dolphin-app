/**
 * Si la ventana del pop-out que está abierta es la isla (y no el dashboard normal). Vive aparte de
 * dolphin-isla.ts para que el dashboard lo lea sin importar la isla entera: la isla ya importa del
 * dashboard (el último tablero), y al revés quedaba un ciclo.
 */
let islaAbierta = false

export function islaAbiertaAhora(): boolean {
  return islaAbierta
}

export function marcarIslaAbierta(abierta: boolean): void {
  islaAbierta = abierta
}
