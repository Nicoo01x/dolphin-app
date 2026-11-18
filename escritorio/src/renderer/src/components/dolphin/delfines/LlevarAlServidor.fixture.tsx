import { defineFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { FixtureCodeBackdrop } from '../../../component-fixtures/FixtureCodeBackdrop'
import type { EstadoDePaso, RevisionDelServidor } from '../../../../../shared/delfines-types'
import { PanelDeLlevar, type EstadoDeLlevar } from './PanelDeLlevar'
import { CLASES_DE_VENTANA, CabeceraDeVentana } from './VentanaDeDelfin'

/**
 * «Correr en tu servidor», quieta: la ventana con cada estado, sin la física ni un servidor.
 * `pnpm fixtures:shot "dolphin/delfines/LlevarAlServidor:*" --theme both`.
 */

const NOOP = (): void => undefined
const ACCIONES = {
  onConectar: NOOP,
  onAgente: NOOP,
  onElegirServidor: NOOP,
  onCarpeta: NOOP,
  onLlevar: NOOP,
  onRevisar: NOOP,
  onCerrar: NOOP
}
const SERVIDORES = [{ hostId: 'ssh:vps-ana' as const, nombre: 'vps-ana' }]

const OK: EstadoDePaso[] = [
  { paso: 'sistema', estado: 'ok', detalle: 'Linux' },
  { paso: 'node', estado: 'ok', detalle: '24.22.1' },
  { paso: 'motor', estado: 'ok', detalle: 'claude' },
  { paso: 'systemd', estado: 'ok' },
  { paso: 'linger', estado: 'ok' }
]

function revision(pasos: EstadoDePaso[]): RevisionDelServidor {
  return {
    hostId: 'ssh:vps-ana',
    nombre: 'vps-ana',
    pasos,
    listo: pasos.every((paso) => paso.estado !== 'falta'),
    carpetaSugerida: '/home/ana/tienda'
  }
}

function ventana(estado: EstadoDeLlevar, titulo = 'Correr Vigía en tu servidor') {
  return defineFixture(
    enCastellano({
      width: 760,
      render: () => (
        <div className="relative grid min-h-[620px] place-items-center overflow-hidden bg-background p-6 text-foreground">
          <div className="absolute inset-0 opacity-60">
            <FixtureCodeBackdrop rows={10} />
          </div>
          <div className="absolute inset-0 bg-black/11" />
          <div
            role="dialog"
            aria-label={titulo}
            className={`${CLASES_DE_VENTANA} relative w-[30rem]`}
          >
            <CabeceraDeVentana titulo={titulo} onCerrar={NOOP} etiquetaCerrar="Cerrar" />
            <div className="px-5 pb-5">
              <PanelDeLlevar
                estado={estado}
                motor="claude"
                servidores={SERVIDORES}
                acciones={ACCIONES}
              />
            </div>
          </div>
        </div>
      )
    })
  )
}

/** Sin servidor conectado: conectar uno, o que lo conecte un agente. */
export const sinServidor = ventana({ tipo: 'sin-servidor' })

/** Claude Code está en el servidor pero sin sesión: frena con el comando para iniciarla. */
export const motorSinSesion = ventana({
  tipo: 'revision',
  carpeta: '/home/ana/tienda',
  revision: revision([
    ...OK.slice(0, 2),
    { paso: 'motor', estado: 'falta', detalle: 'sin-sesion', comando: 'claude auth login' },
    { paso: 'systemd', estado: 'ok' },
    { paso: 'linger', estado: 'aviso', comando: 'sudo loginctl enable-linger ana' }
  ])
})

/** Todo en su lugar: elegir la carpeta y llevarlo. */
export const listo = ventana({
  tipo: 'revision',
  carpeta: '/home/ana/tienda',
  revision: revision(OK)
})

/** Mientras se lleva: la pista de etapas. */
export const llevando = ventana({ tipo: 'llevando', etapa: 'instalar' })

/** Ya corre allá, pero sin linger: el comando para que siga sin sesión. */
export const corriendoSinLinger = ventana({
  tipo: 'listo',
  linger: false,
  comandoLinger: 'sudo loginctl enable-linger ana'
})

/** Falló en el medio: en qué etapa y por qué, con el agente a mano. */
export const fallo = ventana({
  tipo: 'fallo',
  etapa: 'verificar',
  detail: 'dolphin-bots.service: Main process exited, code=exited, status=1/FAILURE'
})
