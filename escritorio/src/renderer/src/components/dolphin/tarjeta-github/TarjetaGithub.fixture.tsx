import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import {
  issueAbierto,
  issueCompletado,
  issueNoPlaneado,
  linkDeIssue,
  linkDePr,
  prAbierto,
  prBorradorConConflictos,
  prCerrado,
  prDatosParciales,
  prMergeado
} from './datos-de-ejemplo.test-fixture'
import { VistaDeTarjeta, type EstadoDeCarga } from './VistaDeTarjeta'

/**
 * La tarjeta fuera del hover: el mismo flotante (data-slot de hover card, así toma radio, sombra y
 * superficie de la piel) con cada estado a la vista. `pnpm fixtures:shot "dolphin/tarjeta-github/*"`.
 */
function Flotante({
  link,
  estado,
  sinConexion
}: {
  link: GitHubIssueOrPRLink
  estado: EstadoDeCarga
  sinConexion?: boolean
}) {
  return (
    <div
      data-slot="hover-card-content"
      className="rounded-md border bg-popover text-popover-foreground shadow-floating"
    >
      <VistaDeTarjeta link={link} estado={estado} sinConexion={sinConexion} reintentar={() => {}} />
    </div>
  )
}

const listo = (value: EstadoDeCarga & { status: 'ready' }) => value

const CASOS: { nombre: string; link: GitHubIssueOrPRLink; estado: EstadoDeCarga; red?: boolean }[] =
  [
    { nombre: 'PR abierto', link: linkDePr, estado: listo({ status: 'ready', value: prAbierto }) },
    {
      nombre: 'Issue abierto',
      link: linkDeIssue,
      estado: listo({ status: 'ready', value: issueAbierto })
    },
    {
      nombre: 'PR borrador con conflictos',
      link: linkDePr,
      estado: listo({ status: 'ready', value: prBorradorConConflictos })
    },
    {
      nombre: 'Issue completado',
      link: linkDeIssue,
      estado: listo({ status: 'ready', value: issueCompletado })
    },
    {
      nombre: 'PR mergeado',
      link: linkDePr,
      estado: listo({ status: 'ready', value: prMergeado })
    },
    {
      nombre: 'Issue no planeado',
      link: linkDeIssue,
      estado: listo({ status: 'ready', value: issueNoPlaneado })
    },
    { nombre: 'PR cerrado', link: linkDePr, estado: listo({ status: 'ready', value: prCerrado }) },
    {
      nombre: 'Datos parciales',
      link: { ...linkDePr, number: 53 },
      estado: listo({ status: 'ready', value: prDatosParciales })
    },
    { nombre: 'Cargando PR', link: linkDePr, estado: { status: 'loading' } },
    { nombre: 'Cargando issue', link: linkDeIssue, estado: { status: 'loading' } },
    { nombre: 'Sin acceso', link: linkDeIssue, estado: { status: 'failed' } },
    { nombre: 'Sin conexión', link: linkDePr, estado: { status: 'failed' }, red: true }
  ]

export const galeria = defineFixture({
  width: 860,
  render: () => (
    <div className="grid grid-cols-2 items-start gap-6 p-6">
      {CASOS.map((caso) => (
        <div key={caso.nombre} className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground">{caso.nombre}</span>
          <Flotante link={caso.link} estado={caso.estado} sinConexion={caso.red} />
        </div>
      ))}
    </div>
  )
})

const uno = (indice: number) =>
  defineFixture({
    width: 440,
    render: () => {
      const caso = CASOS[indice]!
      return (
        <div className="p-6">
          <Flotante link={caso.link} estado={caso.estado} sinConexion={caso.red} />
        </div>
      )
    }
  })

export const prAbiertoSolo = uno(0)
export const issueAbiertoSolo = uno(1)
export const cargandoPr = uno(8)
export const sinAcceso = uno(10)
