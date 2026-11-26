import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GitHubIcon } from '@/components/icons/GitHubIcon'
import { useTranslate } from '@/i18n/use-translate'
import type { GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import { leerExtraDeTarjeta } from '../../../../../shared/dolphin-tarjeta-github'
import { CuerpoDeIssue, CuerpoDePr } from './cuerpos-tarjeta'
import { EsqueletoDeTarjeta } from './EsqueletoDeTarjeta'
import { estadoDeTarjeta, type EstadoDeTarjeta } from './modelo-tarjeta'
import { PastillaDeEstado } from './piezas-tarjeta'
import { resumenParaLector } from './resumen-tarjeta'
import '../tira/tira.css'
import './tarjeta-github.css'

export type EstadoDeCarga =
  | { status: 'loading' }
  | { status: 'ready'; value: GitHubWorkItem }
  | { status: 'failed' }

/** El clic en la tarjeta hace lo mismo que el clic en el link: se lo pasa al link que la abrió. */
function abrirComoElLink(): void {
  document
    .querySelector<HTMLAnchorElement>('[data-slot="hover-card-trigger"][data-state="open"] a[href]')
    ?.click()
}

/** El lector de pantalla oye el resumen cuando cambia, no cuando el flotante aparece ya lleno. */
function useAnuncio(texto: string): string {
  const [anuncio, setAnuncio] = useState('')
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => setAnuncio(texto))
    return () => cancelAnimationFrame(cuadro)
  }, [texto])
  return anuncio
}

function Cabecera({
  link,
  estado
}: {
  link: GitHubIssueOrPRLink
  estado: EstadoDeTarjeta | 'cargando' | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
      <GitHubIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        {link.slug.owner}/{link.slug.repo}
      </span>
      <span className="shrink-0 tabular-nums text-foreground/80">#{link.number}</span>
      {estado === 'cargando' ? (
        <span aria-hidden className="dolphin-tg-hueso ml-auto h-5 w-16 shrink-0 rounded-full" />
      ) : estado ? (
        <span className="ml-auto flex shrink-0">
          <PastillaDeEstado estado={estado} />
        </span>
      ) : null}
    </div>
  )
}

function Fallo({ sinConexion, reintentar }: { sinConexion: boolean; reintentar: () => void }) {
  const t = useTranslate()
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs leading-4 text-muted-foreground">
      <span className="min-w-0 flex-1">
        {sinConexion
          ? t(
              'components.dolphin.tarjetaGithub.sinConexion',
              "You're offline. The card fills in when you're back."
            )
          : t(
              'components.dolphin.tarjetaGithub.sinAcceso',
              "GitHub didn't return it: it doesn't exist or your gh session can't see it."
            )}
      </span>
      <Button
        variant="link"
        size="xs"
        className="h-4 shrink-0 px-0"
        onClick={(evento) => {
          evento.stopPropagation()
          reintentar()
        }}
      >
        {t('components.dolphin.tarjetaGithub.reintentar', 'Retry')}
      </Button>
    </div>
  )
}

/** Dice adónde va el clic: a Tareas, adentro de Dolphin. El navegador queda a un modificador. */
function PieEnDolphin() {
  const t = useTranslate()
  const atajo = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'
  return (
    <div className="dolphin-tg-pie flex min-w-0 items-center gap-1.5 text-xs leading-4">
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
      <span className="font-medium text-foreground">
        {t('components.dolphin.tarjetaGithub.abrirEnDolphin', 'Open in Dolphin')}
      </span>
      <span className="ml-auto shrink-0 text-muted-foreground">
        {t('components.dolphin.tarjetaGithub.enElNavegador', '{{atajo}}+click: browser', { atajo })}
      </span>
    </div>
  )
}

/** Lo que se ve, sin saber de dónde vienen los datos: lo usan la tarjeta real, el fixture y los tests. */
export function VistaDeTarjeta({
  link,
  estado,
  sinConexion = false,
  reintentar,
  enDolphin = false
}: {
  link: GitHubIssueOrPRLink
  estado: EstadoDeCarga
  sinConexion?: boolean
  reintentar: () => void
  /** El clic lo abre en Tareas (abrir-en-dolphin.ts); la tarjeta lo anuncia abajo. */
  enDolphin?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const item = estado.status === 'ready' ? estado.value : null
  const extra = item ? leerExtraDeTarjeta(item) : {}
  const anuncio = useAnuncio(
    item
      ? resumenParaLector(t, link, item, extra)
      : estado.status === 'loading'
        ? t('components.dolphin.tarjetaGithub.cargando', 'Loading details from GitHub')
        : ''
  )
  return (
    <div
      className="dolphin-tg flex flex-col gap-2.5 p-3"
      data-clic={item ? '' : undefined}
      // El foco se queda en el link (Enter lo abre); el clic es el atajo del puntero.
      onClick={item ? abrirComoElLink : undefined}
      style={item ? { cursor: 'pointer' } : undefined}
    >
      <Cabecera
        link={link}
        estado={
          item ? estadoDeTarjeta(item, extra) : estado.status === 'loading' ? 'cargando' : null
        }
      />
      {item ? (
        item.type === 'pr' ? (
          <CuerpoDePr item={item} extra={extra} />
        ) : (
          <CuerpoDeIssue item={item} extra={extra} />
        )
      ) : estado.status === 'loading' ? (
        <EsqueletoDeTarjeta tipo={link.type} />
      ) : (
        <Fallo sinConexion={sinConexion} reintentar={reintentar} />
      )}
      {item && enDolphin && <PieEnDolphin />}
      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
    </div>
  )
}
