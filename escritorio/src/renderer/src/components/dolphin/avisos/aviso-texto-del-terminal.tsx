import { useId } from 'react'
import { useAppStore } from '@/store'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { Switch } from '@/components/ui/switch'
import { buildFontFamily } from '../../../../../shared/monospace-font-family'
import { DEFAULT_TERMINAL_FONT_WEIGHT } from '../../../../../shared/terminal/appearance/terminal-fonts'
import { WINDOWS_TERMINAL_FONT_WEIGHT } from '../../../../../shared/terminal/appearance/terminal-platform-defaults'
import type { Aviso } from './cola-de-avisos'
import { BotonDeAviso, CuerpoDelAviso } from './PiezasDelAviso'

export const ID_TEXTO_DEL_TERMINAL = 'windows-terminal-font-weight'
const MUESTRA = 'git status --short'

function cambiarGrosor(masFino: boolean): void {
  void useAppStore
    .getState()
    .updateSettings({
      terminalFontWeight: masFino ? WINDOWS_TERMINAL_FONT_WEIGHT : DEFAULT_TERMINAL_FONT_WEIGHT
    })
    .catch(console.error)
}

/** La muestra con la fuente real del terminal, y el interruptor que la cambia en vivo. */
function EleccionDelGrosor(): React.JSX.Element {
  const t = useTranslate()
  const interruptor = useId()
  const grosor = useAppStore((s) => s.settings?.terminalFontWeight ?? WINDOWS_TERMINAL_FONT_WEIGHT)
  const familia = useAppStore((s) => buildFontFamily(s.settings?.terminalFontFamily ?? ''))
  const tamano = useAppStore((s) => s.settings?.terminalFontSize)
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div
        aria-hidden="true"
        className="truncate rounded-xl bg-[color-mix(in_srgb,var(--foreground)_6%,var(--popover))] px-3.5 py-2.5 text-sm text-foreground"
        style={{ fontFamily: familia, fontSize: tamano, fontWeight: grosor }}
      >
        {MUESTRA}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-foreground">
        <label htmlFor={interruptor} className="cursor-pointer">
          {t('terminal.windowsFontWeight.lighterText', 'Lighter terminal text')}
        </label>
        <Switch
          id={interruptor}
          checked={grosor === WINDOWS_TERMINAL_FONT_WEIGHT}
          onCheckedChange={cambiarGrosor}
        />
      </div>
    </div>
  )
}

/**
 * El texto del terminal en Windows pasó a un grosor más fino, y se ofrece volver al de antes. Es
 * una preferencia: espera detrás de lo importante. Cerrarla de cualquier forma la da por vista,
 * como hacía el toast con «Okay» y con la ×; si no le tocó en esta sesión, sigue pendiente.
 */
export function avisoDelTextoDelTerminal({
  alTerminar
}: {
  readonly alTerminar: () => void
}): Aviso {
  const titulo = (t: Translate): string =>
    t('terminal.windowsFontWeight.title', 'Terminal text on Windows is now lighter')
  return {
    id: ID_TEXTO_DEL_TERMINAL,
    importancia: 'preferencia',
    titulo,
    alDescartar: alTerminar,
    contenido: ({ responder, descartar }, t) => (
      <CuerpoDelAviso
        titulo={titulo(t)}
        onAhoraNo={descartar}
        botones={
          <BotonDeAviso principal onClick={() => responder(alTerminar)}>
            {t('terminal.windowsFontWeight.okay', 'Okay')}
          </BotonDeAviso>
        }
      >
        <EleccionDelGrosor />
      </CuerpoDelAviso>
    )
  }
}
