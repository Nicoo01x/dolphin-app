import { useEffect, type ReactNode } from 'react'
import { createGlobalSettingsFixture } from '../../../../../shared/global-settings-test-fixture'
import { defineFixture, type ComponentFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { FixtureCodeBackdrop } from '../../../component-fixtures/FixtureCodeBackdrop'
import { AvisoDeLaInterfazDeChat } from './AvisoDeLaInterfazDeChat'
import { avisoDeSkills } from './aviso-de-skills'
import { avisoDelTemaDeClaude } from './aviso-tema-de-claude'
import { avisoDelTextoDelTerminal } from './aviso-texto-del-terminal'
import { encolarAviso, vaciarColaDeAvisos } from './avisos-store'
import { ColaDeAvisos } from './ColaDeAvisos'

type Cual = 'chat' | 'skills' | 'tema' | 'texto'

const nada = (): void => {}

function encolarDeMentira(cual: Exclude<Cual, 'chat'>): void {
  if (cual === 'skills') {
    encolarAviso(
      avisoDeSkills({
        id: 'skills',
        cuantas: 2,
        nombres: 'dolphin-cli, orchestration',
        alActualizar: nada,
        alDescartar: nada
      })
    )
    return
  }
  encolarAviso(
    cual === 'tema'
      ? avisoDelTemaDeClaude({ alMostrar: nada, alAceptar: nada })
      : avisoDelTextoDelTerminal({ alTerminar: nada })
  )
}

/**
 * Los avisos se encolan recién montado el castellano: sus títulos se traducen al encolarlos, y
 * encolados en `setup` saldrían en inglés.
 */
function Sembrar({ cuales }: { cuales: readonly Cual[] }): ReactNode {
  useEffect(() => {
    for (const cual of cuales) {
      if (cual !== 'chat') {
        encolarDeMentira(cual)
      }
    }
  }, [cuales])
  return cuales.includes('chat') ? <AvisoDeLaInterfazDeChat abierto onCerrar={nada} /> : null
}

/** Una ventana de la app de mentira, con código detrás para ver cuánto tapa el velo. */
function VentanaDeLaApp({
  ancho,
  alto,
  children
}: {
  ancho: number
  alto: number
  children: ReactNode
}): React.JSX.Element {
  return (
    // El `transform` hace de esta caja el marco de lo `fixed`: la cola se centra acá adentro.
    <div
      className="relative flex overflow-hidden bg-background text-foreground"
      style={{ width: ancho, height: alto, transform: 'translateZ(0)' }}
    >
      <div className="w-56 shrink-0 bg-foreground/[0.04]" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <FixtureCodeBackdrop rows={6} />
      </div>
      <div className="w-64 shrink-0 bg-foreground/[0.03]" />
      {children}
    </div>
  )
}

function cola(cuales: readonly Cual[], ancho: number, alto: number): ComponentFixture {
  return enCastellano({
    width: ancho,
    store: { settings: createGlobalSettingsFixture({ agentDefaultSurface: 'terminal' }) },
    setup: vaciarColaDeAvisos,
    // La entrada es de GSAP, no de CSS: se espera a que termine antes de la captura.
    interact: () => new Promise((listo) => setTimeout(listo, 900)),
    render: () => (
      <VentanaDeLaApp ancho={ancho} alto={alto}>
        <Sembrar cuales={cuales} />
        <ColaDeAvisos enElLugar />
      </VentanaDeLaApp>
    )
  })
}

const TODOS: readonly Cual[] = ['texto', 'tema', 'skills', 'chat']

/** Los cuatro de una instalación nueva, encolados a la vez: sale uno solo, el del chat. */
export const cuatroAvisos = defineFixture(cola(TODOS, 1280, 900))
export const cuatroAvisosChico = defineFixture(cola(TODOS, 1024, 700))
export const skills = defineFixture(cola(['skills'], 1024, 700))
export const temaDeClaude = defineFixture(cola(['tema'], 1024, 700))
export const textoDelTerminal = defineFixture(cola(['texto'], 1024, 700))
