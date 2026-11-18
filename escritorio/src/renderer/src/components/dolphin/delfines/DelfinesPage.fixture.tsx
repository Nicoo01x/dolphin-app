import type { ReactNode } from 'react'
import type { Delfin } from '../../../../../shared/delfines-types'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { EscenaConPaisaje, esperarEscena } from '../paisaje/escena-con-paisaje'
import { MARCA_DE_PAGINA } from '../paisaje/marca-de-pagina'
import { DelfinesVista } from './DelfinesVista'
import type { EstadoDeLaManada } from './use-manada'

/**
 * La página «Delfines» sobre el vidrio, como la monta `AppWorkspaceShell`.
 * `pnpm fixtures:shot "dolphin/delfines/DelfinesPage:*" --theme both`.
 */

const AHORA = Date.parse('2026-11-17T15:00:00.000Z')
const MIN = 60 * 1000
const NOOP = (): void => undefined
const ACCIONES = { onCrear: NOOP, onHablar: NOOP, onLlevar: NOOP, onReintentar: NOOP }

function delfin(extra: Partial<Delfin> & Pick<Delfin, 'id' | 'nombre'>): Delfin {
  return {
    motor: 'claude',
    permiso: 'preguntar',
    dir: `/home/ana/.dolphin/bots/${extra.id}`,
    carpeta: 'D:/proyectos/tienda',
    corriendo: true,
    gasto: { usd: 0, corridas: 0 },
    telegram: true,
    donde: { tipo: 'aca' },
    ...extra
  }
}

const VIGIA = delfin({
  id: 'vigia',
  nombre: 'Vigía',
  permiso: 'leer',
  proxima: {
    cuando: new Date(AHORA + 12 * MIN).toISOString(),
    tarea: 'Revisá el repo de tu carpeta: git status, últimos commits y tests rotos.',
    latido: true
  },
  gasto: { usd: 1.84, corridas: 41 },
  tope: { usd: 5 },
  ultimo: {
    cuando: new Date(AHORA - 47 * MIN).toISOString(),
    texto:
      'Después del último commit se rompieron 2 tests de la tienda. Es el redondeo del IVA. ¿Lo arreglo?'
  }
})
const PARTE = delfin({
  id: 'parte',
  nombre: 'Parte',
  corriendo: false,
  proxima: {
    cuando: new Date(AHORA + 17 * 60 * MIN).toISOString(),
    tarea: 'Prepará el resumen de lo que pasó ayer en tus repos.',
    latido: false
  },
  gasto: { usd: 0.42, corridas: 16 },
  tope: { corridas: 31 },
  ultimo: {
    cuando: new Date(AHORA - 7 * 60 * MIN).toISOString(),
    texto: 'Ayer: 14 commits en 2 repos, 3 ramas listas para revisar y un test que tarda el doble.'
  }
})
const INVESTIGADOR = delfin({
  id: 'investigador',
  nombre: 'Investigador',
  motor: 'codex',
  gasto: { usd: 5, corridas: 9 },
  tope: { usd: 5 },
  pausa: 'llegó al tope de US$ 5',
  ultimo: {
    cuando: new Date(AHORA - 300 * MIN).toISOString(),
    texto: 'Comparé cinco proveedores de correo con precios de hoy. Gana el segundo.'
  }
})
const ESCRITOR_REMOTO = delfin({
  id: 'escritor',
  nombre: 'Escritor',
  proxima: {
    cuando: new Date(AHORA + 15 * 60 * MIN).toISOString(),
    tarea: 'Escribí una pieza según tu alma.',
    latido: false
  },
  gasto: { usd: 2.1, corridas: 17 },
  tope: { usd: 10 },
  pendiente: 'editar notas/borrador-diciembre.md',
  donde: { tipo: 'servidor', hostId: 'ssh:vps-ana', nombre: 'vps-ana' }
})

function listo(bots: Delfin[]): EstadoDeLaManada {
  return { tipo: 'listo', manada: { ok: true, servicioVivo: true, bots, rotos: [] } }
}

function Pagina({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <EscenaConPaisaje alto={760}>
      <div className="titlebar px-3 text-[13px] text-foreground">Dolphin</div>
      <div className="flex min-h-0 flex-1">
        <aside data-dolphin-panel="lateral" className="w-52 shrink-0 bg-worktree-sidebar p-3">
          <p className="text-sm font-medium text-foreground">tienda-web</p>
        </aside>
        <div {...MARCA_DE_PAGINA} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </EscenaConPaisaje>
  )
}

function pagina(estado: EstadoDeLaManada, ancho = 1180) {
  return defineFixture(
    enCastellano({
      width: ancho,
      interact: async (cuadro) => {
        await esperarEscena(cuadro)
        // Las tarjetas entran con GSAP y las barras se llenan: se espera a que terminen.
        await new Promise((listo) => setTimeout(listo, 1_100))
      },
      render: () => (
        <Pagina>
          <DelfinesVista estado={estado} ahora={AHORA} acciones={ACCIONES} />
        </Pagina>
      )
    })
  )
}

/** Sin bots: las cuatro plantillas listas para tocar. */
export const vacia = pagina(listo([]))

/** Tres de acá con estados distintos (corriendo, parado, en pausa por el tope) y uno en el servidor que espera tu «dale». */
export const conBots = pagina(listo([VIGIA, PARTE, INVESTIGADOR, ESCRITOR_REMOTO]))

const { pendiente: _pendiente, ...ESCRITOR_SIN_PENDIENTE } = ESCRITOR_REMOTO

/** El del servidor cuando el servidor no contesta: lo último que se supo, apagado. */
export const servidorMudo = pagina(
  listo([
    VIGIA,
    {
      ...ESCRITOR_SIN_PENDIENTE,
      corriendo: false,
      donde: { tipo: 'servidor', hostId: 'ssh:vps-ana', nombre: 'vps-ana', sinRespuesta: true }
    }
  ])
)

/** Nombres y textos larguísimos: se cortan, no empujan la tarjeta. */
export const nombresLargos = pagina(
  listo([
    {
      ...VIGIA,
      id: 'vigia-de-la-facturacion',
      nombre: 'Vigía de la facturación electrónica del nuevo esquema de comprobantes 2027',
      proxima: {
        cuando: new Date(AHORA + 3 * MIN).toISOString(),
        tarea:
          'Revisá todos los repos de la carpeta de facturación y avisá si cambió alguno de los esquemas de comprobantes o si se rompió un test de integración con el servicio.',
        latido: true
      }
    },
    {
      ...ESCRITOR_REMOTO,
      donde: {
        tipo: 'servidor',
        hostId: 'ssh:largo',
        nombre: 'servidor-de-produccion-en-buenos-aires-numero-dos'
      }
    }
  ]),
  900
)

export const cargando = pagina({ tipo: 'cargando' })

export const sinNucleo = pagina({
  tipo: 'error',
  code: 'sin-nucleo',
  detail: 'C:\\Program Files\\Dolphin\\resources\\dolphin-app'
})
