import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoQueCorrio } from './LoQueCorrio'
import type { ComandoCorrido } from '@/lib/api'

const comando = (x: Partial<ComandoCorrido>): ComandoCorrido => ({
  cuando: '2026-10-31T12:00:00.000Z',
  cmd: 'npm',
  args: ['test'],
  codigo: 0,
  ms: 1234,
  salida: '',
  ...x
})

describe('lo que corrió sobre una rama', () => {
  it('resume cuántos comandos y cuántos no pasaron', () => {
    const html = renderToStaticMarkup(
      <LoQueCorrio
        corrido={[
          comando({ args: ['run', 'typecheck'], fase: 'typecheck' }),
          comando({ codigo: 1, ms: 42_000, salida: '1 failed', fase: 'test' })
        ]}
      />
    )
    expect(html).toContain('Ver lo que corrió')
    expect(html).toContain('2 comandos')
    expect(html).toContain('1 sin pasar')
  })

  it('una rama sin registro lo dice, en vez de mostrar una lista vacía', () => {
    const html = renderToStaticMarkup(<LoQueCorrio corrido={[]} />)
    expect(html).toContain('no quedó registro de comandos')
    expect(html).not.toContain('Ver lo que corrió')
  })

  it('un comando cortado por el tope no dice que salió bien', () => {
    // Sin código de salida no pasó ni falló: no terminó, y eso es ámbar, no verde.
    const html = renderToStaticMarkup(<LoQueCorrio corrido={[comando({ codigo: null })]} />)
    expect(html).toContain('1 comando')
    expect(html).toContain('1 sin pasar')
  })

  it('el tiempo se lee sin ceros de más', () => {
    const uno = renderToStaticMarkup(<LoQueCorrio corrido={[comando({ ms: 340 })]} />)
    expect(uno).toContain('340 ms')
    const dos = renderToStaticMarkup(<LoQueCorrio corrido={[comando({ ms: 1234 })]} />)
    expect(dos).toContain('1,2 s')
    const tres = renderToStaticMarkup(<LoQueCorrio corrido={[comando({ ms: 185_000 })]} />)
    expect(tres).toContain('3 min 5 s')
  })
})
