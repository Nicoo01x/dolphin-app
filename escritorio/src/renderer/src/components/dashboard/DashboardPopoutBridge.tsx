import { useDashboardPopoutBridge } from './useDashboardPopoutBridge'
import { useEscrituraDesdeIsla } from '../dolphin/isla/use-escritura-desde-isla'
import { useEstudioDesdeIsla } from '../dolphin/isla/use-estudio-desde-isla'

export default function DashboardPopoutBridge(): null {
  useDashboardPopoutBridge(true)
  // Dolphin: lo que se le escribe a un agente desde la isla se tipea acá, donde están las terminales.
  useEscrituraDesdeIsla()
  useEstudioDesdeIsla()
  return null
}
