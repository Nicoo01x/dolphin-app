import { GitBranch, GitMerge, GitPullRequest, Milestone } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { DolphinExtraDeTarjeta } from '../../../../../shared/dolphin-tarjeta-github'
import { BloqueDeChecks, BloqueDeCambios } from './barras-tarjeta'
import {
  estadoDeRevision,
  etiquetasDe,
  revisoresDe,
  tonoDePr,
  type EstadoDeRevision,
  type EstadoDeRevisor,
  type TonoDeEstado
} from './modelo-tarjeta'
import { AvataresApilados, Etiquetas, Pie, Punto } from './piezas-tarjeta'

type T = ReturnType<typeof useTranslate>

function Titulo({ texto }: { texto: string }) {
  return (
    <p className="dolphin-tg-titulo line-clamp-3 text-[13px] leading-[18px] font-semibold text-foreground">
      {texto}
    </p>
  )
}

function Fila({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs leading-4 text-muted-foreground">
      {children}
    </div>
  )
}

function textoDelCierre(t: T, cierre: NonNullable<DolphinExtraDeTarjeta['cierraCon']>): string {
  if (cierre.estado === 'merged') {
    return t('components.dolphin.tarjetaGithub.cerradoPor', 'Closed by #{{number}}', {
      number: cierre.numero
    })
  }
  if (cierre.estado === 'closed') {
    return t('components.dolphin.tarjetaGithub.vinculadoA', 'Linked to #{{number}}', {
      number: cierre.numero
    })
  }
  return t('components.dolphin.tarjetaGithub.loCierra', '#{{number}} will close it', {
    number: cierre.numero
  })
}

export function CuerpoDeIssue({
  item,
  extra
}: {
  item: GitHubWorkItem
  extra: DolphinExtraDeTarjeta
}): React.JSX.Element {
  const t = useTranslate()
  const asignados = item.assignees ?? []
  const cierre = extra.cierraCon
  const hayMeta = asignados.length > 0 || extra.hito || cierre
  return (
    <>
      <Titulo texto={item.title} />
      <Etiquetas etiquetas={etiquetasDe(item)} />
      {hayMeta ? (
        <Fila>
          {asignados.length > 0 ? (
            <span className="inline-flex shrink-0 items-center">
              <AvataresApilados personas={asignados} maximo={3} />
              <span className="sr-only">
                {t('components.dolphin.tarjetaGithub.asignados', 'Assigned to {{names}}', {
                  names: asignados.map((persona) => persona.login).join(', ')
                })}
              </span>
            </span>
          ) : null}
          {extra.hito ? (
            <span className="inline-flex min-w-0 items-center gap-1" title={extra.hito.titulo}>
              <Milestone className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">
                {t('components.dolphin.tarjetaGithub.hito', 'Milestone')}
              </span>
              <span className="truncate">{extra.hito.titulo}</span>
            </span>
          ) : null}
          {cierre ? (
            <span
              className="ml-auto inline-flex min-w-0 shrink-0 items-center gap-1 text-foreground/80"
              title={cierre.titulo || undefined}
            >
              {cierre.estado === 'merged' ? (
                <GitMerge className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <GitPullRequest className="size-3.5 shrink-0" aria-hidden />
              )}
              <Punto tono={tonoDePr(cierre.estado)} />
              <span className="truncate">{textoDelCierre(t, cierre)}</span>
            </span>
          ) : null}
        </Fila>
      ) : null}
      <Pie item={item} comentarios={item.commentCount} />
    </>
  )
}

export function textoDeRevision(t: T, estado: EstadoDeRevision): string {
  if (estado === 'aprobado') {
    return t('components.dolphin.tarjetaGithub.revision.aprobado', 'Approved')
  }
  return estado === 'cambios'
    ? t('components.dolphin.tarjetaGithub.revision.cambios', 'Changes requested')
    : t('components.dolphin.tarjetaGithub.revision.esperando', 'Review required')
}

const TONO_DE_REVISION: Record<EstadoDeRevision, TonoDeEstado> = {
  aprobado: 'verde',
  cambios: 'rojo',
  esperando: 'ambar'
}

const TONO_DE_REVISOR: Record<EstadoDeRevisor, TonoDeEstado | undefined> = {
  aprobo: 'verde',
  'pidio-cambios': 'rojo',
  comento: 'gris',
  esperando: undefined
}

function tituloDeRevisor(t: T, login: string, estado: EstadoDeRevisor): string {
  switch (estado) {
    case 'aprobo':
      return t('components.dolphin.tarjetaGithub.revisor.aprobo', '{{login}} approved', { login })
    case 'pidio-cambios':
      return t(
        'components.dolphin.tarjetaGithub.revisor.pidioCambios',
        '{{login}} requested changes',
        { login }
      )
    case 'comento':
      return t('components.dolphin.tarjetaGithub.revisor.comento', '{{login}} commented', { login })
    case 'esperando':
      return t('components.dolphin.tarjetaGithub.revisor.esperando', 'Waiting on {{login}}', {
        login
      })
  }
}

export function CuerpoDePr({
  item,
  extra
}: {
  item: GitHubWorkItem
  extra: DolphinExtraDeTarjeta
}): React.JSX.Element {
  const t = useTranslate()
  const revisores = revisoresDe(item, extra)
  const revision = estadoDeRevision(item, extra, revisores)
  const abierto = item.state === 'open' || item.state === 'draft'
  const conflictos = abierto && item.mergeable === 'CONFLICTING'
  const checks = extra.checks
  const hayCambios =
    item.additions !== undefined || item.deletions !== undefined || item.changedFiles !== undefined
  return (
    <>
      <Titulo texto={item.title} />
      {item.branchName && item.baseRefName ? (
        <Fila>
          <GitBranch className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-mono text-[11px] text-foreground/80">
            {item.branchName}
          </span>
          <span aria-hidden className="shrink-0">
            →
          </span>
          <span className="min-w-0 shrink-[2] truncate font-mono text-[11px] text-foreground/80">
            {item.baseRefName}
          </span>
          <span className="sr-only">
            {t('components.dolphin.tarjetaGithub.rama', '{{head}} into {{base}}', {
              head: item.branchName,
              base: item.baseRefName
            })}
          </span>
        </Fila>
      ) : null}
      {hayCambios || checks ? (
        <div className={hayCambios && checks ? 'grid grid-cols-2 gap-1.5' : 'grid gap-1.5'}>
          {hayCambios ? (
            <BloqueDeCambios
              agregadas={item.additions}
              quitadas={item.deletions}
              archivos={item.changedFiles}
            />
          ) : null}
          {checks ? <BloqueDeChecks checks={checks} /> : null}
        </div>
      ) : null}
      {checks?.primeroQueFallo ? (
        <Fila>
          <Punto tono="rojo" />
          <span className="min-w-0 truncate" title={checks.primeroQueFallo}>
            {t('components.dolphin.tarjetaGithub.checks.primeroQueFallo', 'Failed: {{name}}', {
              name: checks.primeroQueFallo
            })}
          </span>
        </Fila>
      ) : null}
      {revision || revisores.length > 0 || conflictos ? (
        <Fila>
          {revision ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-foreground">
              <Punto tono={TONO_DE_REVISION[revision]} />
              {textoDeRevision(t, revision)}
            </span>
          ) : null}
          {conflictos ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
              {revision ? <span aria-hidden>·</span> : null}
              <Punto tono="rojo" />
              <span className="truncate">
                {item.baseRefName
                  ? t('components.dolphin.tarjetaGithub.conflictos', 'Conflicts with {{base}}', {
                      base: item.baseRefName
                    })
                  : t('components.dolphin.tarjetaGithub.conflictosSinBase', 'Has merge conflicts')}
              </span>
            </span>
          ) : null}
          {revisores.length > 0 ? (
            <span className="ml-auto inline-flex shrink-0 items-center">
              <AvataresApilados
                personas={revisores.map((revisor) => ({
                  login: revisor.login,
                  avatarUrl: revisor.avatarUrl,
                  tono: TONO_DE_REVISOR[revisor.estado],
                  titulo: tituloDeRevisor(t, revisor.login, revisor.estado)
                }))}
              />
              <span className="sr-only">
                {revisores.map((r) => tituloDeRevisor(t, r.login, r.estado)).join(', ')}
              </span>
            </span>
          ) : null}
        </Fila>
      ) : null}
      <Etiquetas etiquetas={etiquetasDe(item)} />
      <Pie item={item} comentarios={extra.comentarios} />
    </>
  )
}
