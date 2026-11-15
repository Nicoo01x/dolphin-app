import { defineFixture } from '../../../component-fixtures/component-fixture'
import { LandingStartComposer } from '../../landing/LandingStartComposer'
import { esperarGrabados } from '../mundo/esperar-grabado'
import type { GrabadoCongelado } from '../mundo/GrabadoEnPuntos'
import {
  AGENTES,
  CARGANDO,
  CON_ERROR,
  CON_PROYECTOS,
  CON_TARJETAS,
  PERFIL_NUEVO,
  REPOS_DEL_STORE
} from './datos-de-ejemplo-del-inicio'
import type { DatosDelInicio } from './use-inicio'
import { VistaDelInicio } from './VistaDelInicio'

/**
 * El inicio entero con datos de ejemplo, un estado por captura (la tabla de
 * docs/reforma/inicio-v2.md). Lo que se mueve queda quieto en un instante dado.
 *
 *   pnpm fixtures:shot "dolphin/inicio/VistaDelInicio:*" --theme both
 */
const QUIETO: GrabadoCongelado = { progreso: 1, ms: 2_000 }

const inicio = (
  datos: DatosDelInicio,
  {
    // El visor de fixtures mide 1280: es el ancho grande que se puede capturar entero.
    ancho = 1280,
    alto = 900,
    grabado = QUIETO,
    ejemplo,
    conCompositor = true,
    despues
  }: {
    ancho?: number
    alto?: number
    grabado?: GrabadoCongelado
    ejemplo?: number
    conCompositor?: boolean
    despues?: (cuadro: HTMLElement) => void
  } = {}
) =>
  defineFixture({
    width: ancho,
    store: {
      detectedAgentIds: AGENTES,
      ensureDetectedAgents: async () => AGENTES,
      // El compositor lee los proyectos del store, no de los datos de la vista.
      repos: datos.repos.length > 0 ? REPOS_DEL_STORE : []
    },
    interact: async (cuadro) => {
      await esperarGrabados(cuadro)
      despues?.(cuadro)
    },
    render: () => (
      <div className="relative -m-4" style={{ height: alto }}>
        <VistaDelInicio
          datos={datos}
          onElegir={() => undefined}
          mover={async () => ({ ok: true })}
          onReleer={() => undefined}
          compositor={conCompositor ? <LandingStartComposer /> : undefined}
          congelado={{ grabado, ejemplo }}
        />
      </div>
    )
  })

export const perfilNuevo = inicio(PERFIL_NUEVO, { ejemplo: 5_300 })
export const perfilNuevoDibujandose = inicio(PERFIL_NUEVO, {
  ejemplo: 900,
  grabado: { progreso: 0.5, ms: 450 }
})
/** La tarjeta de ejemplo en tres momentos del ciclo. */
export const sinTarjetasIdeas = inicio(CON_PROYECTOS, { ejemplo: 900 })
export const sinTarjetasHaciendo = inicio(CON_PROYECTOS, { ejemplo: 5_400 })
export const sinTarjetasParaRevisar = inicio(CON_PROYECTOS, { ejemplo: 8_600 })
export const conTarjetas = inicio(CON_TARJETAS)
export const conTarjetasCatalejo = inicio(CON_TARJETAS, {
  grabado: { progreso: 1, ms: 2_000, lente: { x: 980, y: 150, radio: 76 } }
})
export const conTarjetas1024 = inicio(CON_TARJETAS, { ancho: 1024, alto: 800 })
/**
 * El área a distintos anchos: una ventana de 1024 con el panel derecho abierto deja unos 700. La ola
 * nunca pasa del 62 % del ancho y la trama se apaga debajo de las cifras.
 */
export const ancho700 = inicio(CON_TARJETAS, { ancho: 700, alto: 800 })
export const ancho900 = inicio(CON_TARJETAS, { ancho: 900, alto: 800 })
export const ancho1100 = inicio(CON_TARJETAS, { ancho: 1100, alto: 800 })
export const ancho1400 = inicio(CON_TARJETAS, { ancho: 1400, alto: 800 })
/** Ventanas de distinto alto: el mundo se queda con lo que sobra, entre 300 px y el 58 %. */
export const ventanaBaja = inicio(CON_TARJETAS, { alto: 700 })
export const ventanaAlta = inicio(CON_TARJETAS, { alto: 1100 })
export const ventanaMuyAlta = inicio(CON_TARJETAS, { alto: 1500 })
export const perfilNuevoAlto = inicio(PERFIL_NUEVO, { ejemplo: 5_300, alto: 1300 })
/** A mitad de un arrastre: «Sumar un buscador» levantada sobre Haciendo, que se marca. */
export const arrastrando = inicio(CON_TARJETAS, {
  despues: (cuadro) => {
    const tarjeta = cuadro.querySelector<HTMLElement>('[data-tarjeta-id="h1"] [data-foco]')
    const caja = tarjeta?.getBoundingClientRect()
    if (!tarjeta || !caja) {
      return
    }
    const desde = { clientX: caja.left + 30, clientY: caja.top + 12, pointerId: 1, bubbles: true }
    tarjeta.dispatchEvent(new PointerEvent('pointerdown', { ...desde, button: 0 }))
    for (const paso of [10, 120, 230, 262]) {
      tarjeta.dispatchEvent(
        new PointerEvent('pointermove', {
          ...desde,
          clientX: desde.clientX + paso,
          clientY: desde.clientY + paso / 4
        })
      )
    }
  }
})
export const cargando = inicio(CARGANDO, { grabado: { progreso: 0.4, ms: 360 } })
export const error = inicio(CON_ERROR)
