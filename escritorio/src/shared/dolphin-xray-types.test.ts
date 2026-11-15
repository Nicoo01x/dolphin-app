import { describe, expect, it } from 'vitest'
import { etiquetaXray, leerEventoXray, promptDeXray } from './dolphin-xray-types'

const pick = JSON.stringify({
  type: 'pick',
  point: { x: 120, y: 48 },
  element: {
    name: 'Guardar',
    role: 'Button',
    localizedRole: 'botón',
    automationId: 'SaveButton',
    className: 'Button',
    helpText: '',
    value: '',
    enabled: true,
    rect: { x: 100, y: 40, width: 80, height: 24 },
    path: ['Sin título - Bloc de notas', 'Barra de herramientas']
  },
  app: { pid: 4242, process: 'notepad', window: 'Sin título - Bloc de notas', own: false },
  crop: 'C:\\Temp\\dolphin-xray\\xray-1.png'
})

describe('Dolphin X-ray', () => {
  it('lee un clic del ayudante con el control, la app y el recorte', () => {
    const evento = leerEventoXray(pick)
    expect(evento).toMatchObject({
      type: 'pick',
      element: { name: 'Guardar', role: 'Button', rect: { x: 100, y: 40, width: 80, height: 24 } },
      app: { process: 'notepad', own: false },
      crop: 'C:\\Temp\\dolphin-xray\\xray-1.png'
    })
  })

  it('no se rompe con líneas que no son eventos', () => {
    expect(leerEventoXray('PowerShell banner')).toBeNull()
    expect(leerEventoXray('{"type":"otra-cosa"}')).toBeNull()
    expect(leerEventoXray('{"type":"ready"}')).toEqual({ type: 'ready' })
    expect(leerEventoXray('{"type":"hover","element":null}')).toMatchObject({
      type: 'hover',
      element: null,
      app: null,
      point: { x: 0, y: 0 }
    })
  })

  it('arma la etiqueta con el tipo en el idioma de Windows y el nombre', () => {
    const evento = leerEventoXray(pick)
    expect(evento && evento.type === 'pick' ? etiquetaXray(evento) : '').toBe('botón · Guardar')
  })

  it('le dice al agente qué control es, dónde está y lo que pediste', () => {
    const evento = leerEventoXray(pick)
    if (!evento || evento.type !== 'pick') {
      throw new Error('esperaba un pick')
    }
    const prompt = promptDeXray(evento, '  Que este botón diga «Guardar como»  ')
    expect(prompt).toContain('- App: notepad — ventana «Sin título - Bloc de notas»')
    expect(prompt).toContain('- Control: botón «Guardar» (Button)')
    expect(prompt).toContain('- Identificación: AutomationId SaveButton, clase Button')
    expect(prompt).toContain('- Dónde: Sin título - Bloc de notas › Barra de herramientas')
    expect(prompt).toContain('- Posición en pantalla: x=100, y=40, 80×24 px')
    expect(prompt).toContain('- Recorte de pantalla: C:\\Temp\\dolphin-xray\\xray-1.png')
    expect(prompt.endsWith('\n\nQue este botón diga «Guardar como»')).toBe(true)
  })

  it('sin accesibilidad igual manda el punto y el recorte', () => {
    const prompt = promptDeXray(
      { point: { x: 5, y: 6 }, element: null, app: null, crop: 'c.png' },
      ''
    )
    expect(prompt).toContain('Sin datos de accesibilidad: el punto x=5, y=6')
    expect(prompt).toContain('Recorte de pantalla: c.png')
  })
})
