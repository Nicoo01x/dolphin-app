import { useEffect, type ReactNode } from 'react'
import { createGlobalSettingsFixture } from '../../../../../shared/global-settings-test-fixture'
import type { AvisoDeMemoriaBaja } from '../../../../../shared/modo-poca-ram'
import type { Repo } from '../../../../../shared/repo-types'
import type { SshConnectionState } from '../../../../../shared/ssh-types'
import { defineFixture, type ComponentFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { FixtureCodeBackdrop } from '../../../component-fixtures/FixtureCodeBackdrop'
import { encolarAviso, vaciarColaDeAvisos } from '../avisos/avisos-store'
import { ColaDeAvisos } from '../avisos/ColaDeAvisos'
import { avisoDeMemoriaBaja } from './aviso-de-memoria-baja'

const GB = 1024 ** 3
const REPO = { id: 'repo-app', path: 'C:/code/app', displayName: 'app', connectionId: null } as Repo

function aviso(nombre: string): AvisoDeMemoriaBaja {
  return {
    disponible: 1.1 * GB,
    total: 16 * GB,
    dolphin: 5.4 * GB,
    motivo: 'umbral',
    masPesado: {
      tipo: 'espacio',
      worktreeId: 'wt-1',
      nombre,
      repoId: REPO.id,
      repoNombre: 'app',
      bytes: 3.2 * GB
    }
  }
}

function servidor(id: string, nombre: string): ComponentFixture['store'] {
  const estado = { targetId: id, status: 'connected', error: null, reconnectAttempt: 0 }
  return {
    sshTargetLabels: new Map([[id, nombre]]),
    sshConnectionStates: new Map([[id, estado as SshConnectionState]])
  }
}

function Sembrar({ datos }: { datos: AvisoDeMemoriaBaja }): ReactNode {
  useEffect(() => encolarAviso(avisoDeMemoriaBaja(datos)), [datos])
  return null
}

function cola(
  datos: AvisoDeMemoriaBaja,
  ancho: number,
  extra: ComponentFixture['store'] = {}
): ComponentFixture {
  return enCastellano({
    width: ancho,
    store: {
      settings: createGlobalSettingsFixture({ agentDefaultSurface: 'terminal' }),
      repos: [REPO],
      activeRepoId: REPO.id,
      ...extra
    },
    setup: vaciarColaDeAvisos,
    // La ventana y la barra entran con GSAP: se espera a que terminen antes de la captura.
    interact: () => new Promise((listo) => setTimeout(listo, 1_100)),
    render: () => (
      <div
        className="relative flex overflow-hidden bg-background text-foreground"
        style={{ width: ancho, height: 700, transform: 'translateZ(0)' }}
      >
        <div className="w-56 shrink-0 bg-foreground/[0.04]" />
        <div className="min-w-0 flex-1 overflow-hidden">
          <FixtureCodeBackdrop rows={6} />
        </div>
        <Sembrar datos={datos} />
        <ColaDeAvisos enElLugar />
      </div>
    )
  })
}

/** Con un VPS conectado: el botón corre el espacio más pesado ahí. */
export const conServidor = defineFixture(
  cola(aviso('arreglar-login'), 1024, servidor('vps-ana', 'vps-ana'))
)

/** Sin servidor: el botón lleva a conectar uno, y un agente puede hacerlo. */
export const sinServidor = defineFixture(cola(aviso('arreglar-login'), 1024))

/** Nombres larguísimos: el del espacio y el del servidor se cortan, no empujan la ventana. */
export const nombresLargos = defineFixture(
  cola(
    aviso('migrar-toda-la-facturacion-electronica-al-nuevo-esquema-de-comprobantes-2027'),
    1024,
    servidor('vps-largo', 'servidor-de-produccion-en-buenos-aires-numero-dos')
  )
)

/** Sin un espacio para nombrar: habla de Dolphin entero y no ofrece dormir nada. */
export const dolphinEntero = defineFixture(
  cola(
    { ...aviso(''), masPesado: { tipo: 'dolphin', bytes: 2.1 * GB }, dolphin: 2.1 * GB },
    1024,
    servidor('vps-ana', 'vps-ana')
  )
)
