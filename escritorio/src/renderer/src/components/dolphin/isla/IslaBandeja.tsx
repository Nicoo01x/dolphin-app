import { useEffect, useState } from 'react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import type { AsuntoDeIsla } from '../../../../../shared/dolphin-isla-types'
import { AvisoDeIsla } from './isla-piezas'

/** Lo abierto en la bandeja de Dolphin de cada repo: las ideas del scout y los errores del tester. */
export function IslaBandeja(): React.JSX.Element {
  const [asuntos, setAsuntos] = useState<AsuntoDeIsla[] | null>(null)
  useEffect(() => {
    let vigente = true
    void Promise.resolve(window.api.dolphin.bandejaDeIsla?.() ?? [])
      .catch(() => [])
      .then((leidos) => {
        if (vigente) {
          setAsuntos(leidos)
        }
      })
    return () => {
      vigente = false
    }
  }, [])

  if (asuntos === null) {
    return (
      <AvisoDeIsla>
        {translate('auto.components.dolphin.isla.inboxLoading', 'Reading the inbox…')}
      </AvisoDeIsla>
    )
  }
  if (asuntos.length === 0) {
    return (
      <AvisoDeIsla>
        {translate(
          'auto.components.dolphin.isla.inboxEmpty',
          'Nothing open in the inbox. The scout leaves its ideas here, and the tester the errors it finds.'
        )}
      </AvisoDeIsla>
    )
  }
  return (
    <ul className="space-y-0.5">
      {asuntos.map((asunto) => (
        <li
          key={`${asunto.repo}:${asunto.id}`}
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
        >
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
              asunto.tipo === 'error'
                ? 'bg-rose-400/15 text-rose-200'
                : 'bg-sky-400/15 text-sky-200'
            )}
          >
            {asunto.tipo === 'error'
              ? translate('auto.components.dolphin.isla.kindError', 'error')
              : translate('auto.components.dolphin.isla.kindIdea', 'idea')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" title={asunto.titulo}>
              {asunto.titulo}
            </span>
            <span className="block truncate text-xs text-white/50">{asunto.repo}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
