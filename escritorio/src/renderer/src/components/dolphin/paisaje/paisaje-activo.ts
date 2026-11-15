import { create } from 'zustand'

/**
 * Si la ventana tiene pintura detrás ahora mismo. Lo escribe `FondoDePaisaje` cuando la imagen
 * está lista y lo lee el chat vacío: sin pintura (por «Ninguno», o porque una imagen propia no se
 * pudo leer), el chat vacío es el de siempre.
 */
export const usePaisajeActivo = create<{ activo: boolean }>()(() => ({ activo: false }))
