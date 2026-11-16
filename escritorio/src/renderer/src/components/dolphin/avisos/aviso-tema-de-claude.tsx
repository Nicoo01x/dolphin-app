import type { Translate } from '@/i18n/use-translate'
import type { Aviso } from './cola-de-avisos'
import { BotonDeAviso, CuerpoDelAviso } from './PiezasDelAviso'

export const ID_TEMA_DE_CLAUDE = 'claude-theme-sync-offer'

/**
 * Ofrecer que Claude Code use el tema de Dolphin. Es una preferencia: espera su turno detrás de
 * todo lo demás, y si en esta sesión no le toca, vuelve la próxima vez que Claude arranque en un
 * terminal de Dolphin (el ajuste se marca resuelto recién al mostrarse, en `alMostrar`).
 */
export function avisoDelTemaDeClaude({
  alMostrar,
  alAceptar
}: {
  readonly alMostrar: () => void
  readonly alAceptar: () => void
}): Aviso {
  const titulo = (t: Translate): string =>
    t('terminal.claudeThemeSyncOffer.title', 'Match Claude Code to your Dolphin theme?')
  return {
    id: ID_TEMA_DE_CLAUDE,
    importancia: 'preferencia',
    titulo,
    alMostrar,
    contenido: ({ responder, descartar }, t) => (
      <CuerpoDelAviso
        titulo={titulo(t)}
        onAhoraNo={descartar}
        botones={
          <>
            <BotonDeAviso onClick={() => responder()}>
              {t('terminal.claudeThemeSyncOffer.decline', 'No thanks')}
            </BotonDeAviso>
            <BotonDeAviso principal onClick={() => responder(alAceptar)}>
              {t('terminal.claudeThemeSyncOffer.accept', 'Match theme')}
            </BotonDeAviso>
          </>
        }
      >
        {t(
          'terminal.claudeThemeSyncOffer.description',
          'Claude Code on this computer would use your terminal colors and follow theme changes, including outside Dolphin. You can change this in Settings.'
        )}
      </CuerpoDelAviso>
    )
  }
}
