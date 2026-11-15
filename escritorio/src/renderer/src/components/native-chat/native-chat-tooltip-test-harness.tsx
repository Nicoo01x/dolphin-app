import { render as renderDeTestingLibrary, type RenderOptions } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * `render` con el `TooltipProvider` puesto, para las pruebas del chat que dibujan un tooltip.
 *
 * Why existe: Radix pide ese contexto y tira `Tooltip must be used within TooltipProvider` sin
 * él. En producción lo pone `App` una sola vez, así que una prueba que monta un pedazo del chat
 * es el único lugar donde falta. Un harness evita que cada archivo se arme su propio envoltorio
 * —y que el próximo componente del chat con tooltip rompa diez pruebas a la vez—.
 */
export function render(
  ui: React.ReactNode,
  opciones?: Omit<RenderOptions, 'wrapper'>
): ReturnType<typeof renderDeTestingLibrary> {
  return renderDeTestingLibrary(ui, { ...opciones, wrapper: TooltipProvider })
}

/**
 * Why se nombran uno por uno en vez de un `export *`: testing-library no publica sus nombres de
 * una forma que el análisis estático pueda leer, así que el `export *` quedaba vacío para las
 * herramientas aunque funcionara en runtime. Agregar uno más acá cuesta una línea.
 */
export { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
