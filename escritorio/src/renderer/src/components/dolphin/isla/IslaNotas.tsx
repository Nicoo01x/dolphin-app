import { translate } from '@/i18n/i18n'
import { LARGO_MAXIMO_NOTAS } from '../../../../../shared/dolphin-isla-types'
import type { EstadoDePreferencias } from './use-preferencias-isla'

/** Una nota a mano, para lo que se te ocurre mientras miran los agentes. Queda en esta compu. */
export function IslaNotas({
  notas,
  estado,
  onCambiar
}: {
  notas: string
  estado: EstadoDePreferencias
  onCambiar: (notas: string) => void
}): React.JSX.Element {
  return (
    <div className="px-1 pb-1">
      <textarea
        value={notas}
        // Se guarda en cada cambio: la isla se cierra sola al perder el foco y no hay «guardar».
        onChange={(event) => onCambiar(event.target.value)}
        readOnly={estado !== 'listas'}
        maxLength={LARGO_MAXIMO_NOTAS}
        rows={6}
        placeholder={translate(
          'auto.components.dolphin.isla.notesPlaceholder',
          'Jot something down… it stays on this computer'
        )}
        aria-label={translate('auto.components.dolphin.isla.sectionNotes', 'Notes')}
        className="scrollbar-sleek block w-full resize-none rounded-2xl bg-white/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-white outline-none transition-colors duration-150 ease-out placeholder:text-white/40 focus:bg-white/[0.09]"
      />
      {estado === 'ilegibles' ? (
        <p role="status" className="px-3 pt-1.5 text-xs text-white/55">
          {translate(
            'auto.components.dolphin.isla.notesUnreadable',
            "The saved note couldn't be read right now. So as not to overwrite it, it stays read-only until you open the island again."
          )}
        </p>
      ) : null}
    </div>
  )
}
