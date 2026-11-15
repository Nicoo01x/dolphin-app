import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { MapaDeActividad } from '../../landing/MapaDeActividad'
import { mapaDeActividad } from '../../landing/actividad-por-dia'
import type { EspacioConEstado } from './estado-del-inicio'
import { SeccionDeEspacios } from './FilasDeEspacios'

/** Cuántas filas de «Hoy» se ven: es un vistazo, la lista entera está en la barra. */
const FILAS_DE_HOY = 4

/** Las semanas del mapa compacto: medio año, lo que entra al lado de la lista sin apretarla. */
const SEMANAS_DEL_MAPA = 26

/**
 * Lo que se movió hoy, sin caja: un encabezado como el del tablero y debajo filas sueltas sobre el
 * lienzo. A la derecha, el mapa de actividad, pero sólo si tiene algo que mostrar: un mapa con todas
 * las celdas apagadas y «0 en total» es otra caja vacía. Sin nada de hoy, no hay sección.
 */
export function FranjaDeHoy({
  hoy,
  ahora,
  cuandoTrabajaste,
  conMapa
}: {
  hoy: readonly EspacioConEstado[]
  ahora: number
  cuandoTrabajaste: readonly number[]
  conMapa: boolean
}): React.JSX.Element | null {
  // El mismo cálculo que hace el mapa para su «N en total»: si da cero, el mapa no se dibuja.
  const total = useMemo(
    () =>
      conMapa
        ? mapaDeActividad(cuandoTrabajaste, { hasta: ahora, semanas: SEMANAS_DEL_MAPA }).total
        : 0,
    [conMapa, cuandoTrabajaste, ahora]
  )
  if (hoy.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-8 @3xl:flex-row @3xl:items-start @3xl:gap-12">
      <SeccionDeEspacios
        id="dolphin-inicio-hoy"
        titulo={translate('auto.components.dolphin.inicio.today', 'Today')}
        items={hoy}
        ahora={ahora}
        filas={FILAS_DE_HOY}
        className="min-w-0 flex-1"
      />
      {total > 0 ? (
        <div className="max-w-full overflow-hidden @3xl:shrink-0">
          <MapaDeActividad
            compacto
            cuando={cuandoTrabajaste}
            ahora={ahora}
            titulo={translate('auto.components.dolphin.inicio.activity', 'Activity')}
            semanas={SEMANAS_DEL_MAPA}
          />
        </div>
      ) : null}
    </div>
  )
}
