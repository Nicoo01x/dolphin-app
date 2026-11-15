// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { DashboardCard, DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'
import type { Aviso } from './avisos-isla'
import { useAvisosDeIsla } from './use-avisos-isla'

const tarjeta = (paneKey: string, bucket: DashboardCard['bucket'], unseen = true): DashboardCard =>
  ({ paneKey, bucket, unseen, worktreeName: paneKey }) as DashboardCard

let generado = 1
const tablero = (...cards: DashboardCard[]): DashboardSnapshot =>
  ({ generatedAt: generado++, cards }) as unknown as DashboardSnapshot
const VACIO = { generatedAt: 0, cards: [] } as unknown as DashboardSnapshot

const paneKeyDelAviso = (aviso: Aviso | null): string | null =>
  aviso && 'card' in aviso ? aviso.card.paneKey : null

type Props = { snapshot: DashboardSnapshot | null; encima?: boolean }
const montar = (snapshot: DashboardSnapshot) =>
  renderHook(
    ({ snapshot: actual, encima = false }: Props) =>
      useAvisosDeIsla({ snapshot: actual, activos: true, abierta: false, encima }),
    { initialProps: { snapshot } as Props }
  )

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('la cola de avisos de la isla', () => {
  it('el tablero vacío de relleno no cuenta como primera mirada: lo que ya esperaba no avisa', () => {
    const { result, rerender } = montar(VACIO)
    rerender({ snapshot: tablero(tarjeta('a', 'attention'), tarjeta('b', 'attention')) })
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.aviso).toBeNull()
  })

  it('un agente que termina sin que lo veas avisa después de confirmarse', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    rerender({ snapshot: tablero(tarjeta('a', 'done')) })
    expect(result.current.aviso).toBeNull()
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.aviso?.tipo).toBe('termino')
  })

  it('si el tablero completo dice que lo viste antes de confirmarse, no avisa', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    // El parche en vivo lo marca como no visto; el tablero de la ventana principal lo corrige.
    rerender({ snapshot: tablero(tarjeta('a', 'done')) })
    act(() => vi.advanceTimersByTime(250))
    rerender({ snapshot: tablero(tarjeta('a', 'idle', false)) })
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.aviso).toBeNull()
  })

  it('un aviso a la vista se va si lo contestaste en la app', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    rerender({ snapshot: tablero(tarjeta('a', 'attention')) })
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.aviso?.tipo).toBe('te-necesita')
    rerender({ snapshot: tablero(tarjeta('a', 'working')) })
    expect(result.current.aviso).toBeNull()
    // La capa lo sigue dibujando mientras se va.
    expect(result.current.enCapa?.tipo).toBe('te-necesita')
  })

  it('se va solo a los 6 s, y con el puntero encima espera', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    let snapshot = tablero(tarjeta('a', 'done'))
    rerender({ snapshot })
    act(() => vi.advanceTimersByTime(700))
    rerender({ snapshot, encima: true })
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.aviso).not.toBeNull()
    // Un tablero nuevo con lo mismo no reinicia la cuenta ni lo saca.
    snapshot = tablero(tarjeta('a', 'done'))
    rerender({ snapshot, encima: false })
    act(() => vi.advanceTimersByTime(6_000))
    expect(result.current.aviso).toBeNull()
  })

  it('lo que nunca se mostró (lo estabas mirando) no le quita el aviso siguiente', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    // Pide permiso con su pestaña a la vista: el tablero completo lo da por visto y no sale.
    rerender({ snapshot: tablero(tarjeta('a', 'attention')) })
    act(() => vi.advanceTimersByTime(250))
    rerender({ snapshot: tablero(tarjeta('a', 'attention', false)) })
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.aviso).toBeNull()
    // Aprobaste, te fuiste a otra pestaña y a los 10 s vuelve a pedir: ahora sí avisa.
    rerender({ snapshot: tablero(tarjeta('a', 'working')) })
    act(() => vi.advanceTimersByTime(10_000))
    rerender({ snapshot: tablero(tarjeta('a', 'attention')) })
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.aviso?.tipo).toBe('te-necesita')
  })

  it('un agente que va y viene no muestra lo mismo dos veces en el enfriamiento', () => {
    const { result, rerender } = montar(tablero(tarjeta('a', 'working')))
    rerender({ snapshot: tablero(tarjeta('a', 'attention')) })
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.aviso?.tipo).toBe('te-necesita')
    act(() => result.current.descartar())
    rerender({ snapshot: tablero(tarjeta('a', 'working')) })
    rerender({ snapshot: tablero(tarjeta('a', 'attention')) })
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.aviso).toBeNull()
  })

  it('con más de cuatro, el que está a la vista no se descarta', () => {
    const nombres = ['a', 'b', 'c', 'd', 'e', 'f']
    const { result, rerender } = montar(tablero(...nombres.map((n) => tarjeta(n, 'working'))))
    rerender({
      snapshot: tablero(tarjeta('a', 'done'), ...nombres.slice(1).map((n) => tarjeta(n, 'working')))
    })
    act(() => vi.advanceTimersByTime(700))
    expect(paneKeyDelAviso(result.current.aviso)).toBe('a')
    rerender({
      snapshot: tablero(...nombres.map((n) => tarjeta(n, 'done'))),
      encima: true
    })
    act(() => vi.advanceTimersByTime(700))
    expect(paneKeyDelAviso(result.current.aviso)).toBe('a')
    expect(result.current.enEspera).toBe(3)
  })
})
