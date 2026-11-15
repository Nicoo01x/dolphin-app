// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cartelesDeFuncionDe } from '../../../../shared/carteles-de-funcion'
import { CartelDeFuncion } from './CartelDeFuncion'

const CARTEL = cartelesDeFuncionDe('claude')[0]!

beforeEach(() => {
  vi.stubGlobal('window', window)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { app: { getCartelAssetBaseUrl: () => Promise.resolve('file:///app/carteles/') } }
  })
  // happy-dom no trae matchMedia, y el cartel pregunta por prefers-reduced-motion.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function dibujar(onElegir = vi.fn()): { onElegir: ReturnType<typeof vi.fn> } {
  render(
    <TooltipProvider>
      <CartelDeFuncion
        cartel={CARTEL}
        nombreDelMotor="Claude"
        deshabilitado={false}
        onElegir={onElegir}
      />
    </TooltipProvider>
  )
  return { onElegir }
}

it('el título lo dice la persona, en nombre del motor del chat', async () => {
  dibujar()
  await userEvent.click(screen.getByRole('button', { name: /see what it does/i }))
  expect(await screen.findByText('Claude, quiero delegar tareas')).toBeTruthy()
})

// El clip no viaja con el bundle: sale de resources/carteles por la base que da el main.
it('busca el clip en la base que le da la app, y no antes de abrirse', async () => {
  const { container } = render(
    <TooltipProvider>
      <CartelDeFuncion
        cartel={CARTEL}
        nombreDelMotor="Claude"
        deshabilitado={false}
        onElegir={vi.fn()}
      />
    </TooltipProvider>
  )
  expect(container.querySelector('video')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: /see what it does/i }))
  await waitFor(() => {
    expect(document.querySelector('video')?.getAttribute('src')).toBe(
      'file:///app/carteles/delegacion.mp4'
    )
  })
})

it('elegir adentro del cartel pide la apertura con ese valor', async () => {
  const { onElegir } = dibujar()
  await userEvent.click(screen.getByRole('button', { name: /see what it does/i }))
  await userEvent.click(await screen.findByRole('button', { name: 'Sonnet' }))
  expect(onElegir).toHaveBeenCalledWith('sonnet')
})

/**
 * Sin el puente —una ventana cuya preload se compiló antes de que existiera el handler— la llamada
 * tira sincrónicamente adentro del efecto, el `.catch()` no corre y el error se lleva puesto el
 * árbol de React: el chat entero deja de pintar por un video.
 */
it('sin el puente de los clips, el cartel se abre igual y solo pierde el video', async () => {
  Object.defineProperty(window, 'api', { configurable: true, value: { app: {} } })
  dibujar()
  await userEvent.click(screen.getByRole('button', { name: /see what it does/i }))
  expect(await screen.findByText('Claude, quiero delegar tareas')).toBeTruthy()
  expect(document.querySelector('video')?.getAttribute('src')).toBeFalsy()
})
