import { useAppStore } from '@/store'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'

/**
 * El `+N −M` del espacio de trabajo a la derecha de las pestañas, como en la referencia
 * (`docs/reforma/referencias/ventana-traslucida-referencia.png`).
 *
 * No tiene fuente propia: es el mismo total de la rama que muestra el panel de cambios
 * (`branch-line-total-chip.tsx`), con el mismo descarte de un total medido contra un punto de
 * bifurcación viejo. Sin total, o con cero y cero, no se dibuja.
 *
 * Verde y rojo apagados: el color de git mezclado con la tinta atenuada, para que sea un dato al
 * costado y no un acento que compita con las pestañas.
 */
export function ContadorDeCambios({
  worktreeId
}: {
  worktreeId: string | null | undefined
}): React.JSX.Element | null {
  const t = useTranslate()
  const locale = useIntlLocale()
  const total = useAppStore((s) =>
    worktreeId ? (s.gitBranchLineTotalByWorktree?.[worktreeId] ?? null) : null
  )
  const mergeBase = useAppStore((s) =>
    worktreeId ? (s.gitBranchCompareSummaryByWorktree[worktreeId]?.mergeBase ?? null) : null
  )
  if (!total || total.mergeBase !== mergeBase) {
    return null
  }
  const { added, removed } = total
  if (added <= 0 && removed <= 0) {
    return null
  }
  return (
    <span
      role="group"
      data-dolphin-contador-de-cambios=""
      aria-label={t(
        'auto.components.dolphin.pestanas.contadorDeCambios',
        '{{value0}} lines added and {{value1}} deleted in this workspace',
        { value0: added, value1: removed }
      )}
      className="mr-1.5 inline-flex shrink-0 items-center gap-1.5 px-1 text-[11px] font-medium whitespace-nowrap tabular-nums"
    >
      <span
        aria-hidden="true"
        className="text-[color:color-mix(in_srgb,var(--git-decoration-added)_72%,var(--muted-foreground))]"
      >
        +{added.toLocaleString(locale)}
      </span>
      <span
        aria-hidden="true"
        className="text-[color:color-mix(in_srgb,var(--git-decoration-deleted)_72%,var(--muted-foreground))]"
      >
        −{removed.toLocaleString(locale)}
      </span>
    </span>
  )
}
