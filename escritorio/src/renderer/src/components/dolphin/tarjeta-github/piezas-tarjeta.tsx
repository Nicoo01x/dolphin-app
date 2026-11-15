import { MessageSquare } from 'lucide-react'
import { GitHubUserAvatar } from '@/components/github/github-user-avatar'
import { cn } from '@/lib/class-names'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import {
  tiempoRelativo,
  type ClaveDeEstado,
  type EstadoDeTarjeta,
  type Etiqueta,
  type TonoDeEstado
} from './modelo-tarjeta'

type T = ReturnType<typeof useTranslate>

export function textoDeEstado(t: T, clave: ClaveDeEstado): string {
  switch (clave) {
    case 'abierto':
      return t('components.dolphin.tarjetaGithub.estado.abierto', 'Open')
    case 'borrador':
      return t('components.dolphin.tarjetaGithub.estado.borrador', 'Draft')
    case 'mergeado':
      return t('components.dolphin.tarjetaGithub.estado.mergeado', 'Merged')
    case 'cerrado':
      return t('components.dolphin.tarjetaGithub.estado.cerrado', 'Closed')
    case 'completado':
      return t('components.dolphin.tarjetaGithub.estado.completado', 'Completed')
    case 'no-planeado':
      return t('components.dolphin.tarjetaGithub.estado.noPlaneado', 'Not planned')
    case 'duplicado':
      return t('components.dolphin.tarjetaGithub.estado.duplicado', 'Duplicate')
  }
}

export function Punto({ tono, className }: { tono: TonoDeEstado; className?: string }) {
  return <span aria-hidden data-tono={tono} className={cn('dolphin-tg-punto', className)} />
}

export function PastillaDeEstado({ estado }: { estado: EstadoDeTarjeta }): React.JSX.Element {
  const t = useTranslate()
  return (
    <span
      data-tono={estado.tono}
      className="dolphin-tg-pastilla inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium text-foreground"
    >
      <span className="dolphin-tg-punto" aria-hidden />
      {textoDeEstado(t, estado.clave)}
    </span>
  )
}

type Persona = { login: string; avatarUrl?: string | null; tono?: TonoDeEstado; titulo?: string }

/** Hasta `maximo` caras encimadas y un «+N» con el resto. */
export function AvataresApilados({
  personas,
  maximo = 4,
  tamano = 'size-5'
}: {
  personas: readonly Persona[]
  maximo?: number
  tamano?: string
}): React.JSX.Element | null {
  if (personas.length === 0) {
    return null
  }
  const visibles = personas.slice(0, maximo)
  const resto = personas.length - visibles.length
  return (
    <span className="dolphin-tg-pila flex shrink-0 items-center" aria-hidden>
      {visibles.map((persona) => (
        <span key={persona.login} className="relative inline-flex rounded-full">
          <GitHubUserAvatar
            login={persona.login}
            avatarUrl={persona.avatarUrl}
            title={persona.titulo ?? persona.login}
            className={tamano}
          />
          {persona.tono ? <span data-tono={persona.tono} className="dolphin-tg-muesca" /> : null}
        </span>
      ))}
      {resto > 0 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground',
            tamano
          )}
        >
          +{resto}
        </span>
      ) : null}
    </span>
  )
}

const ETIQUETAS_VISIBLES = 4

export function Etiquetas({ etiquetas }: { etiquetas: readonly Etiqueta[] }) {
  const t = useTranslate()
  if (etiquetas.length === 0) {
    return null
  }
  const resto = etiquetas.length - ETIQUETAS_VISIBLES
  return (
    <ul className="flex min-w-0 flex-wrap gap-1">
      {etiquetas.slice(0, ETIQUETAS_VISIBLES).map((etiqueta) => (
        <li
          key={etiqueta.nombre}
          title={etiqueta.nombre}
          className="dolphin-tg-box inline-flex h-5 max-w-[10rem] items-center gap-1.5 rounded-full px-2 text-[11px] text-muted-foreground"
        >
          <span
            aria-hidden
            className="dolphin-tg-punto"
            style={etiqueta.color ? { background: etiqueta.color } : undefined}
          />
          <span className="truncate">{etiqueta.nombre}</span>
        </li>
      ))}
      {resto > 0 ? (
        <li
          className="inline-flex h-5 items-center px-1 text-[11px] tabular-nums text-muted-foreground"
          aria-label={t('components.dolphin.tarjetaGithub.masEtiquetas', '{{count}} more labels', {
            count: resto
          })}
        >
          +{resto}
        </li>
      ) : null}
    </ul>
  )
}

export function textoDeComentarios(t: T, cantidad: number): string {
  return cantidad === 1
    ? t('components.dolphin.tarjetaGithub.unComentario', '1 comment')
    : t('components.dolphin.tarjetaGithub.comentarios', '{{count}} comments', { count: cantidad })
}

/** Autor, cuándo se tocó por última vez y cuántos comentarios: lo que la base ya mostraba, localizado. */
export function Pie({
  item,
  comentarios
}: {
  item: GitHubWorkItem
  comentarios: number | undefined
}): React.JSX.Element | null {
  const t = useTranslate()
  const locale = useIntlLocale()
  const cuando = tiempoRelativo(item.updatedAt, locale)
  if (!item.author && !cuando && comentarios === undefined) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
      {item.author ? (
        <>
          <GitHubUserAvatar
            login={item.author}
            avatarUrl={item.authorAvatarUrl}
            className="size-4"
          />
          <span className="min-w-0 truncate text-foreground/80">{item.author}</span>
        </>
      ) : null}
      {cuando ? (
        <>
          {item.author ? <span aria-hidden>·</span> : null}
          <time dateTime={item.updatedAt} className="shrink-0">
            {t('components.dolphin.tarjetaGithub.actualizado', 'Updated {{time}}', {
              time: cuando
            })}
          </time>
        </>
      ) : null}
      {comentarios !== undefined && comentarios > 0 ? (
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums"
          title={textoDeComentarios(t, comentarios)}
        >
          <MessageSquare className="size-3" aria-hidden />
          <span aria-hidden>{comentarios}</span>
          <span className="sr-only">{textoDeComentarios(t, comentarios)}</span>
        </span>
      ) : null}
    </div>
  )
}
