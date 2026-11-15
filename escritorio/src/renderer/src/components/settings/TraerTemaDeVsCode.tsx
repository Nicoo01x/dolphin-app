import { useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { paletaDesdeTemaDeVsCode } from '../../../../shared/tema-de-vscode'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

/**
 * Traer un tema de VS Code: se pega su JSON y sus colores quedan puestos.
 *
 * Why pegar el JSON y no instalar la extensión: un tema de VS Code es un solo archivo de datos
 * —`tokenColors` y `colors`—, y leerlo no necesita nada del host de extensiones. Lo que se trae son
 * los colores del código; el cromo de Dolphin sigue monocromo a propósito
 * (`shared/tema-de-vscode.ts` explica qué se mira y qué se ignora).
 *
 * Why va a la paleta que el tema declara y no a la que está a la vista: un tema oscuro aplicado
 * sobre el claro se vería ilegible la próxima vez que cambie el sistema. Si el tema no es del lado
 * que se está viendo, se dice en qué lado quedó en vez de aplicarlo donde se ve.
 */
export function TraerTemaDeVsCode({
  updateSettings
}: {
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const viendoOscuro = useDocumentDarkTheme()

  const traer = (): void => {
    let crudo: unknown
    try {
      crudo = JSON.parse(texto)
    } catch {
      setAviso({
        ok: false,
        texto: translate(
          'auto.components.settings.TraerTemaDeVsCode.noEsJson',
          "That isn't valid JSON. Paste the whole contents of the theme file."
        )
      })
      return
    }
    const traido = paletaDesdeTemaDeVsCode(crudo)
    if (!traido) {
      setAviso({
        ok: false,
        texto: translate(
          'auto.components.settings.TraerTemaDeVsCode.sinColores',
          'That JSON carries no code colors: a theme needs tokenColors or an editor foreground.'
        )
      })
      return
    }
    updateSettings(
      traido.oscuro
        ? { paletaDeCodigoOscura: traido.paleta }
        : { paletaDeCodigoClara: traido.paleta }
    )
    const nombre =
      traido.nombre ??
      translate('auto.components.settings.TraerTemaDeVsCode.sinNombre', 'the theme')
    setAviso({
      ok: true,
      texto:
        traido.oscuro === viendoOscuro
          ? translate('auto.components.settings.TraerTemaDeVsCode.puesto', '{{value0}} is on.', {
              value0: nombre
            })
          : traido.oscuro
            ? translate(
                'auto.components.settings.TraerTemaDeVsCode.quedoOscuro',
                '{{value0}} is a dark theme: it went to your dark colors and shows when you switch.',
                { value0: nombre }
              )
            : translate(
                'auto.components.settings.TraerTemaDeVsCode.quedoClaro',
                '{{value0}} is a light theme: it went to your light colors and shows when you switch.',
                { value0: nombre }
              )
    })
    setTexto('')
  }

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.TraerTemaDeVsCode.titulo',
        'Bring a VS Code theme'
      )}
      description={translate(
        'auto.components.settings.TraerTemaDeVsCode.descripcion',
        'Paste a theme file and its code colors become yours. Only the code is coloured: the panels around it stay monochrome.'
      )}
      keywords={['theme', 'vscode', 'colors', 'tema', 'colores', 'import', 'traer']}
    >
      <div className="flex flex-col gap-2">
        <Textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          spellCheck={false}
          rows={4}
          className="font-mono text-xs"
          placeholder='{ "name": "…", "tokenColors": [ … ] }'
          aria-label={translate(
            'auto.components.settings.TraerTemaDeVsCode.campo',
            'VS Code theme JSON'
          )}
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" disabled={texto.trim().length === 0} onClick={traer}>
            {translate('auto.components.settings.TraerTemaDeVsCode.boton', 'Bring it')}
          </Button>
          {aviso ? (
            <span
              className={aviso.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
            >
              {aviso.texto}
            </span>
          ) : null}
        </div>
      </div>
    </SearchableSetting>
  )
}
