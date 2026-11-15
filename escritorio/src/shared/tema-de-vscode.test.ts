// Traer un tema de VS Code: lo que se mira del JSON, lo que se ignora y lo que gana cuando dos
// reglas hablan del mismo código.

import { describe, expect, it } from 'vitest'
import { paletaDesdeTemaDeVsCode } from './tema-de-vscode'

const DRACULA_RECORTADO = {
  name: 'Dracula',
  type: 'dark',
  colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2' },
  tokenColors: [
    { scope: 'comment', settings: { foreground: '#6272a4', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage.type'], settings: { foreground: '#ff79c6' } },
    { scope: 'entity.name.function', settings: { foreground: '#50fa7b', fontStyle: 'bold' } },
    { scope: 'string', settings: { foreground: '#f1fa8c' } },
    { scope: 'constant.numeric', settings: { foreground: '#bd93f9' } }
  ]
}

describe('un tema de VS Code traído a nuestra paleta', () => {
  it('trae el color y el estilo de cada rol que el tema define', () => {
    const traido = paletaDesdeTemaDeVsCode(DRACULA_RECORTADO)
    expect(traido?.nombre).toBe('Dracula')
    expect(traido?.oscuro).toBe(true)
    expect(traido?.paleta).toMatchObject({
      base: { color: 'f8f8f2' },
      comentario: { color: '6272a4', cursiva: true },
      clave: { color: 'ff79c6' },
      funcion: { color: '50fa7b', negrita: true },
      cadena: { color: 'f1fa8c' },
      numero: { color: 'bd93f9' }
    })
  })

  it('lo que el tema no define no entra: el rol se queda con el valor de fábrica', () => {
    const traido = paletaDesdeTemaDeVsCode({
      tokenColors: [{ scope: 'comment', settings: { foreground: '#888888' } }]
    })
    expect(Object.keys(traido?.paleta ?? {})).toEqual(['comentario'])
  })

  it('entre dos reglas del mismo código gana la que nombra más segmentos', () => {
    const traido = paletaDesdeTemaDeVsCode({
      tokenColors: [
        { scope: 'string', settings: { foreground: '#111111' } },
        { scope: 'string.quoted', settings: { foreground: '#222222' } }
      ]
    })
    expect(traido?.paleta.cadena).toMatchObject({ color: '222222' })
  })

  it('un scope en una sola cadena con comas vale igual que una lista', () => {
    const traido = paletaDesdeTemaDeVsCode({
      tokenColors: [
        { scope: 'invalid, invalid.illegal', settings: { foreground: '#ff0000' } },
        { scope: 'keyword.operator', settings: { foreground: '#00ff00', fontStyle: 'italic bold' } }
      ]
    })
    expect(traido?.paleta.invalido).toMatchObject({ color: 'ff0000' })
    expect(traido?.paleta.operador).toMatchObject({
      color: '00ff00',
      negrita: true,
      cursiva: true
    })
  })

  it('acepta un hex de tres dígitos y le saca el alfa a uno de ocho', () => {
    const traido = paletaDesdeTemaDeVsCode({
      colors: { 'editor.foreground': '#abc' },
      tokenColors: [{ scope: 'comment', settings: { foreground: '#11223344' } }]
    })
    expect(traido?.paleta.base).toMatchObject({ color: 'aabbcc' })
    expect(traido?.paleta.comentario).toMatchObject({ color: '112233' })
  })

  it('sin `type`, el fondo decide si es oscuro o claro', () => {
    const claro = paletaDesdeTemaDeVsCode({
      colors: { 'editor.background': '#ffffff', 'editor.foreground': '#000000' }
    })
    expect(claro?.oscuro).toBe(false)
    const oscuro = paletaDesdeTemaDeVsCode({
      colors: { 'editor.background': '#111111', 'editor.foreground': '#eeeeee' }
    })
    expect(oscuro?.oscuro).toBe(true)
    // El `type` manda por encima del fondo: hay temas claros con un fondo de muestra oscuro.
    const declarado = paletaDesdeTemaDeVsCode({
      type: 'light',
      colors: { 'editor.background': '#111111', 'editor.foreground': '#eeeeee' }
    })
    expect(declarado?.oscuro).toBe(false)
  })

  it('lo que no es un tema no se trae', () => {
    expect(paletaDesdeTemaDeVsCode(null)).toBeNull()
    expect(paletaDesdeTemaDeVsCode('{}')).toBeNull()
    expect(
      paletaDesdeTemaDeVsCode({ name: 'vacío', colors: { 'activityBar.border': '#fff' } })
    ).toBeNull()
    // Reglas sin ningún color: no hay nada que traer, aunque el JSON tenga la forma.
    expect(
      paletaDesdeTemaDeVsCode({ tokenColors: [{ scope: 'comment', settings: {} }] })
    ).toBeNull()
  })
})
