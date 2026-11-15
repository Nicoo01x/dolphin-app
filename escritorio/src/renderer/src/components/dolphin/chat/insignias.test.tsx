import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { marcaDeModelo, partirEnInsignias, type Trozo } from './insignias'
import { EXTENSION_INSIGNIAS } from './insignias-extension'

const insignias = (texto: string): string[] =>
  partirEnInsignias(texto)
    .filter((trozo): trozo is Extract<Trozo, { tipo: 'insignia' }> => trozo.tipo === 'insignia')
    .map((trozo) => `${trozo.clase}:${trozo.valor}`)

describe('las insignias del texto del agente', () => {
  it('cada dato sale con su clase: porcentaje, plata, tiempo y cantidad', () => {
    expect(insignias('Bajó al 40,6 % y costó US$ 0,29 en 12 s, con 3 ramas y 16 KB.')).toEqual([
      'porcentaje:40,6 %',
      'plata:US$ 0,29',
      'tiempo:12 s',
      'cantidad:3 ramas',
      'cantidad:16 KB'
    ])
  })

  it('el otro lado de una comparación lleva la misma insignia aunque no traiga unidad', () => {
    expect(insignias('US$ 0,29 contra 0,52')).toEqual(['plata:US$ 0,29', 'plata:0,52'])
  })

  it('un rango va entero y no se lee como un número negativo', () => {
    expect(insignias('Tarda 5-10 min y pesa 2–3 MB')).toEqual([
      'tiempo:5-10 min',
      'cantidad:2–3 MB'
    ])
    // Suelto, el signo es del número; pegado a «v2», el guion no es un signo.
    expect(insignias('bajó -3 % y v2-10 s')).toEqual(['porcentaje:-3 %', 'tiempo:10 s'])
  })

  it('un número suelto no es insignia: sin unidad no dice qué mide', () => {
    expect(insignias('Hay entre 5 a 8 opciones')).toEqual([])
  })

  it('el tamaño de un commit sale en dos insignias: lo que entró y lo que salió', () => {
    expect(insignias('Commit hecho (23 archivos, +809/−255).')).toEqual([
      'cantidad:23 archivos',
      'agregado:+809',
      'quitado:−255'
    ])
  })

  it('el par vale con el guion del teclado y con espacios alrededor de la barra', () => {
    expect(insignias('quedó en +12 / -3 líneas')).toEqual(['agregado:+12', 'quitado:-3'])
  })

  it('un número con espacio de miles va entero, no partido', () => {
    expect(insignias('pesa 16,1 KB (16 442 bytes)')).toEqual([
      'cantidad:16,1 KB',
      'cantidad:16 442 bytes'
    ])
  })

  it('los modelos van enteros, con su versión, y las citas sin sus comillas', () => {
    expect(insignias('Lo hizo Claude Opus 5.5, después Sonnet y lo revisó «el portón».')).toEqual([
      'modelo:Claude Opus 5.5',
      'modelo:Sonnet',
      'cita:el portón'
    ])
  })

  it('cada modelo nombrado sabe de qué marca es, para que el chat le ponga el logo', () => {
    const marcas = (texto: string) =>
      partirEnInsignias(texto)
        .filter(
          (trozo): trozo is Extract<Trozo, { tipo: 'insignia' }> =>
            trozo.tipo === 'insignia' && trozo.clase === 'modelo'
        )
        .map((trozo) => marcaDeModelo(trozo.valor))

    expect(marcas('Claude Opus 5.5 y Haiku')).toEqual(['claude', 'claude'])
    expect(marcas('lo corrió Codex, no GPT-5')).toEqual(['openai', 'openai'])
    expect(marcas('Gemini, DeepSeek, Qwen, Mistral, Grok, Llama y Copilot')).toEqual([
      'gemini',
      'deepseek',
      'qwen',
      'mistral',
      'grok',
      'ollama',
      'copilot'
    ])
  })

  it('un hexadecimal es un color, en sus cuatro formas', () => {
    expect(insignias('La paleta es #CFFF2E sobre #121212, con #003D1B y #fff')).toEqual([
      'color:#CFFF2E',
      'color:#121212',
      'color:#003D1B',
      'color:#fff'
    ])
    // Con alfa va entero: partido daría el color equivocado más un «FF» suelto.
    expect(insignias('el overlay es #003D1BFF')).toEqual(['color:#003D1BFF'])
  })

  it('pegados de nuevo, los trozos son el texto de antes (salvo las comillas de una cita)', () => {
    const texto = 'Pasaron 3 tests en 2 min, el 100 % de lo pedido.'
    expect(
      partirEnInsignias(texto)
        .map((trozo) => trozo.valor)
        .join('')
    ).toBe(texto)
  })
})

describe('el markdown con insignias', () => {
  it('pinta los datos como span con su clase y no toca el código ni los enlaces', () => {
    const html = renderToStaticMarkup(
      <CommentMarkdown
        content="Tardó 12 s y pasó el 100 %. `npm test 3 veces` y [ver 2 archivos](https://example.com)."
        extension={EXTENSION_INSIGNIAS}
      />
    )

    expect(html).toContain('<span data-insignia="tiempo">12 s</span>')
    expect(html).toContain('<span data-insignia="porcentaje">100 %</span>')
    expect(html).toContain('npm test 3 veces')
    expect(html).not.toContain('data-insignia="cantidad">3 veces')
    expect(html).not.toContain('data-insignia="cantidad">2 archivos')
  })

  it('un modelo nombrado sale con su marca, que es lo que el CSS usa para el logo', () => {
    const html = renderToStaticMarkup(
      <CommentMarkdown
        content="Lo escribió Claude y lo revisó Gemini."
        extension={EXTENSION_INSIGNIAS}
      />
    )

    // Sin `data-marca` en el sanitizador, el atributo se perdía y el logo no aparecía.
    expect(html).toContain('<span data-insignia="modelo" data-marca="claude">Claude</span>')
    expect(html).toContain('<span data-insignia="modelo" data-marca="gemini">Gemini</span>')
  })

  it('un color lleva su muestra pintada adelante', () => {
    const html = renderToStaticMarkup(
      <CommentMarkdown content="El fondo es #121212." extension={EXTENSION_INSIGNIAS} />
    )

    expect(html).toContain('class="insignia-muestra"')
    expect(html).toContain('background:#121212')
    expect(html).toContain('#121212</span>')
  })
})
