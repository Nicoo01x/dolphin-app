import { create } from 'zustand'

/**
 * Si la ventana tiene pintura detrás ahora mismo, y si los paneles son de vidrio. Lo escribe
 * `FondoDePaisaje` cuando la imagen está lista. El chat vacío lee `activo`: sin pintura (por
 * «Ninguno», o porque una imagen propia no se pudo leer) es el de siempre. El editor y la terminal
 * leen `vidrio`: con paneles de vidrio pintan sin fondo propio, y con «Paneles opacos» no.
 */
export const usePaisajeActivo = create<{ activo: boolean; vidrio: boolean }>()(() => ({
  activo: false,
  vidrio: false
}))
