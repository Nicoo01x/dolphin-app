import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { openExternalUrl } from '@/lib/external-url'
import { translate } from '@/i18n/i18n'
import { DOLPHIN_DISCORD_URL, DOLPHIN_X_URL } from '../../../../shared/dolphin-brand'

/**
 * Los botones a la comunidad de Dolphin, en su propio archivo.
 *
 * Por qué salieron del diálogo: tenían escritos a mano el invite de Discord y la cuenta de X
 * heredados de la base. Eran dos botones de nuestra app mandando a
 * nuestra gente a la comunidad de otro producto. Ahora salen del panel de marca, y mientras sea
 * null no se muestran, como el resto de lo que todavía no tenemos.
 */
export function SidebarFeedbackCommunityLinks(): React.JSX.Element | null {
  // Alias locales: el `const` del módulo no se estrecha adentro del `onClick`, que es diferido.
  const discord = DOLPHIN_DISCORD_URL
  const equis = DOLPHIN_X_URL
  if (!discord && !equis) {
    return null
  }
  return (
    <>
      {discord ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => openExternalUrl(discord)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-current">
            <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.77-.553 1.116a18.27 18.27 0 0 0-5.098 0A12.64 12.64 0 0 0 9.68 3a19.736 19.736 0 0 0-4.433 1.369C2.444 8.479 1.69 12.488 2.067 16.44a19.912 19.912 0 0 0 5.427 2.744c.438-.598.828-1.23 1.164-1.89a12.95 12.95 0 0 1-1.833-.877c.154-.113.305-.231.45-.352a14.294 14.294 0 0 0 12.45 0c.146.12.296.239.45.352-.585.34-1.2.634-1.835.878.337.659.727 1.29 1.165 1.888a19.84 19.84 0 0 0 5.43-2.744c.442-4.579-.755-8.551-3.932-12.07ZM9.955 14.005c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm4.09 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
          </svg>
          {translate('auto.components.sidebar.SidebarFeedbackDialog.26108d3699', 'Join Discord')}
          <ExternalLink className="size-3.5" />
        </Button>
      ) : null}
      {equis ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => openExternalUrl(equis)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-current">
            <path d="M18.901 1.153h3.68l-8.041 9.19L24 22.847h-7.406l-5.8-7.584-6.64 7.584H.474l8.6-9.83L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.493h2.04L6.486 3.24H4.298l13.313 17.406Z" />
          </svg>
          {translate('auto.components.sidebar.SidebarFeedbackDialog.3460258a54', 'Follow on X')}
          <ExternalLink className="size-3.5" />
        </Button>
      ) : null}
    </>
  )
}
