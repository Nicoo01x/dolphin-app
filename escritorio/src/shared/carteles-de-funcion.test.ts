import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isNativeChatSupportedAgent } from './native-chat/native-chat-agent-support'
import {
  CARTELES_DE_FUNCION,
  aperturaDelCartel,
  cartelesDeFuncionDe,
  eleccionPorDefecto,
  eleccionesDelCartel,
  posterDelCartel,
  posterDelPanel,
  tituloDelCartel,
  videoDelCartel,
  videoDelPanel
} from './carteles-de-funcion'

const RAIZ = join(__dirname, '..', '..')

describe('carteles de función', () => {
  it('habla en nombre del motor del chat donde sale', () => {
    const [cartel] = cartelesDeFuncionDe('claude')
    expect(cartel).toBeDefined()
    expect(tituloDelCartel(cartel!, 'Claude')).toBe('Claude, quiero delegar tareas')
  })

  it('se ofrece solo en el chat de su motor', () => {
    // Uno por chat, a propósito: `mode` cuelga de los cuatro motores, así que el de permisos podía
    // ir en cualquiera y se colgó de Codex para no pisar al de delegación en el de Claude.
    expect(cartelesDeFuncionDe('claude').map((cartel) => cartel.id)).toEqual(['delegacion'])
    expect(cartelesDeFuncionDe('codex').map((cartel) => cartel.id)).toEqual(['permisos'])
    expect(cartelesDeFuncionDe(undefined)).toEqual([])
  })

  /**
   * La que faltaba, y por eso el primer cartel no se pudo abrir nunca: colgaba del motor `dolphin`,
   * que no tiene chat —no está en `NATIVE_CHAT_SUPPORTED_AGENT_LIST`, no tiene sesión estructurada
   * y el «+» lo ofrece solo como terminal—, así que el compositor donde vive el cartel no se pinta
   * jamás con ese motor. Un cartel en un chat que no existe es una función que nadie puede ver.
   */
  it('cada cartel sale en un chat que la app abre de verdad', () => {
    for (const cartel of CARTELES_DE_FUNCION) {
      expect(
        isNativeChatSupportedAgent(cartel.motor),
        `${cartel.motor} no tiene chat nativo: el cartel «${cartel.id}» no se podría abrir nunca`
      ).toBe(true)
    }
  })

  // Un cartel ofrece una opción que el CLI toma de verdad: si nombra una que Dolphin no declara
  // para ese motor, el cartel se abre sin ningún botón.
  it('cada cartel ofrece una opción que Dolphin declara para ese motor', () => {
    for (const cartel of CARTELES_DE_FUNCION) {
      expect(
        eleccionesDelCartel(cartel).length,
        `Dolphin no ofrece «${cartel.opcion}» con el motor ${cartel.motor}`
      ).toBeGreaterThan(0)
      expect(eleccionPorDefecto(cartel)).not.toBeNull()
    }
  })

  // La apertura la arma el catálogo de Dolphin, no este módulo: el motor va en una bandera que el
  // CLI declara y la elección en su comando con barra, que es donde la acepta.
  it('la apertura es la que el CLI de Dolphin toma', () => {
    const [cartel] = cartelesDeFuncionDe('claude')
    expect(aperturaDelCartel(cartel!, 'opus')).toEqual({
      agentArgs: ['--agente', 'claude'],
      comando: '/lider opus'
    })
    expect(aperturaDelCartel(cartel!, 'haiku')?.comando).toBe('/lider haiku')
  })

  // Lo que el cartel ofrece es lo que el catálogo declara, sin una lista escrita al lado.
  it('los botones son los valores del catálogo, no otros', () => {
    const [cartel] = cartelesDeFuncionDe('claude')
    expect(eleccionesDelCartel(cartel!).map((eleccion) => eleccion.value)).toEqual([
      'opus',
      'sonnet',
      'haiku'
    ])
  })

  // El clip se renderiza aparte (branding/videos/carteles) y se copia acá con `npm run publicar`.
  // Un cartel declarado sin su clip es una tarjeta con un hueco negro.
  it('cada clip declarado está publicado en resources/carteles', () => {
    for (const cartel of CARTELES_DE_FUNCION) {
      for (const archivo of [
        videoDelCartel(cartel),
        posterDelCartel(cartel),
        videoDelPanel(cartel),
        posterDelPanel(cartel)
      ]) {
        expect(
          existsSync(join(RAIZ, 'resources', 'carteles', archivo)),
          `falta resources/carteles/${archivo}: corré \`npm run render && npm run publicar\` en branding/videos/carteles`
        ).toBe(true)
      }
    }
  })
})
