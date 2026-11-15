import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import {
  fondoDelChat,
  OSCURIDAD_DE_PANEL,
  veloDePanel,
  type FondoDelChat,
  type FuenteDelFondo
} from '../../../../../shared/fondo-del-chat'
import { fondoIncluido } from './fondos'

/**
 * El fondo que eligió la persona, listo para pintar.
 *
 * Una imagen propia vive en el perfil y llega por IPC como bytes (`dolphin:fondo:leer`): se arma un
 * `blob:` una sola vez por archivo y se reusa —la ventana y la miniatura de Ajustes la piden a la
 * vez—. Si el archivo no está (otro perfil, se borró a mano), no hay fondo: la ventana vuelve a
 * como estaba y no se inventa otro.
 */

const blobsPropios = new Map<string, Promise<string | null>>()

function urlPropia(nombre: string): Promise<string | null> {
  const enCache = blobsPropios.get(nombre)
  if (enCache) {
    return enCache
  }
  const leer = window.api?.dolphin?.leerFondoDelChat
  const pedido = (leer ? leer(nombre) : Promise.resolve(null))
    .then((bytes) => (bytes ? URL.createObjectURL(new Blob([bytes])) : null))
    .catch(() => null)
  blobsPropios.set(nombre, pedido)
  return pedido
}

/** La URL de la imagen de una fuente: inmediata para un óleo incluido, después de leerla para una propia. */
export function useUrlDelFondo(fuente: FuenteDelFondo): string | null {
  const nombre = fuente.tipo === 'propio' ? fuente.nombre : null
  const [propia, setPropia] = useState<{ nombre: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!nombre) {
      return
    }
    let vigente = true
    void urlPropia(nombre).then((url) => {
      if (vigente) {
        setPropia({ nombre, url })
      }
    })
    return () => {
      vigente = false
    }
  }, [nombre])
  if (fuente.tipo === 'ninguno') {
    return null
  }
  if (fuente.tipo === 'incluido') {
    return fondoIncluido(fuente.id).url
  }
  return propia?.nombre === fuente.nombre ? propia.url : null
}

/** El ajuste ya normalizado: lo que llega del perfil no se cree. */
export function useFondoDelChat(): FondoDelChat {
  const crudo = useAppStore((s) => s.settings?.fondoDelChat)
  return fondoDelChat(crudo)
}

/** En claro el velo es de papel; con el texto atenuado en #4a4a4a pide lo mismo (`fondo-del-chat.ts`). */
export const OSCURIDAD_DE_PANEL_CLARO = 0.78

/**
 * Las variables que leen `paisaje.css` y los paneles: cuánto tapa el velo de la ventana y cuánto
 * le suma cada panel para llegar a AA, en oscuro y en claro.
 */
export function variablesDelPaisaje(velo: number): Record<string, string> {
  return {
    '--paisaje-velo': velo.toFixed(3),
    '--paisaje-panel': veloDePanel(velo, OSCURIDAD_DE_PANEL).toFixed(3),
    '--paisaje-panel-claro': veloDePanel(velo, OSCURIDAD_DE_PANEL_CLARO).toFixed(3)
  }
}
