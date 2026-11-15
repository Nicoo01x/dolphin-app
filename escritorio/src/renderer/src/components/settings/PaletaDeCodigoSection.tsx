import { useMemo } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  NOMBRE_DEL_ROL,
  PALETA_CLARA,
  PALETA_OSCURA,
  PRESETS_OSCUROS,
  ROLES_DE_CODIGO,
  paletaConPersonal,
  type PaletaParcial,
  type RolDeCodigo
} from '../../../../shared/paleta-de-codigo'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { Label } from '../ui/label'

/**
 * Los colores del código, uno por uno.
 *
 * Doce roles y nada escondido: lo que no está acá no tiene color propio. Se edita el tema que
 * está puesto ahora (claro u oscuro, según el del sistema) porque editar a ciegas el que no se ve
 * es la forma más rápida de dejar un tema roto sin enterarse.
 *
 * El cambio se ve al instante en los editores abiertos: `usePaletaDeCodigo` redefine el tema de
 * Monaco cuando cambia el ajuste. No hay botón de «aplicar» a propósito — con vista previa en
 * vivo, un botón más es un paso más entre probar y ver.
 */

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

const TITULO = translate('auto.components.settings.PaletaDeCodigoSection.titulo', 'Code colors')

export function PaletaDeCodigoSection({ settings, updateSettings }: Props): React.JSX.Element {
  const oscuro = useDocumentDarkTheme()
  const personal = oscuro ? settings.paletaDeCodigoOscura : settings.paletaDeCodigoClara
  const base = oscuro ? PALETA_OSCURA : PALETA_CLARA
  const paleta = useMemo(() => paletaConPersonal(base, personal), [base, personal])

  const guardar = (siguiente: PaletaParcial): void => {
    updateSettings(
      oscuro ? { paletaDeCodigoOscura: siguiente } : { paletaDeCodigoClara: siguiente }
    )
  }

  const cambiar = (
    rol: RolDeCodigo,
    cambio: Partial<{ color: string; negrita: boolean; cursiva: boolean }>
  ): void => {
    guardar({ ...personal, [rol]: { ...paleta[rol], ...personal?.[rol], ...cambio } })
  }

  return (
    <SearchableSetting
      title={TITULO}
      description={translate(
        'auto.components.settings.PaletaDeCodigoSection.descripcion',
        'Every colour the editor paints, one by one. The chrome around the code stays monochrome on purpose: the colour lives inside the file, which is what you look at.'
      )}
      keywords={[
        'theme',
        'colors',
        'colours',
        'syntax',
        'highlight',
        'palette',
        'tema',
        'colores',
        'paleta',
        'sintaxis'
      ]}
      className="space-y-3 py-2"
    >
      <div className="space-y-0.5">
        <Label>{TITULO}</Label>
        <p className="text-xs text-muted-foreground">
          {oscuro
            ? translate(
                'auto.components.settings.PaletaDeCodigoSection.editandoOscuro',
                'Editing the dark theme, which is the one in use.'
              )
            : translate(
                'auto.components.settings.PaletaDeCodigoSection.editandoClaro',
                'Editing the light theme, which is the one in use.'
              )}
        </p>
      </div>

      {oscuro ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(PRESETS_OSCUROS).map((nombre) => (
            <button
              key={nombre}
              type="button"
              onClick={() => guardar(PRESETS_OSCUROS[nombre] ?? {})}
              className="h-7 rounded-full bg-foreground/[0.07] px-3 text-xs capitalize transition-colors hover:bg-foreground/[0.11]"
            >
              {nombre}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {ROLES_DE_CODIGO.map((rol) => {
          const tinta = paleta[rol]
          return (
            <div
              key={rol}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.035]"
            >
              {/* El input de color nativo es el que ya conoce el sistema operativo: un selector
                  propio sería otro widget que mantener y uno peor. */}
              <input
                type="color"
                aria-label={NOMBRE_DEL_ROL[rol]}
                value={`#${tinta.color}`}
                onChange={(e) => cambiar(rol, { color: e.target.value.replace('#', '') })}
                className="size-6 shrink-0 cursor-pointer rounded-md bg-transparent p-0"
              />
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{
                  color: `#${tinta.color}`,
                  fontWeight: tinta.negrita ? 700 : 300,
                  fontStyle: tinta.cursiva ? 'italic' : 'normal'
                }}
                title={NOMBRE_DEL_ROL[rol]}
              >
                {NOMBRE_DEL_ROL[rol]}
              </span>
              <button
                type="button"
                aria-pressed={tinta.negrita === true}
                onClick={() => cambiar(rol, { negrita: !tinta.negrita })}
                className="size-6 shrink-0 rounded-md text-xs font-bold transition-colors aria-pressed:bg-foreground aria-pressed:text-background hover:bg-foreground/10"
              >
                B
              </button>
              <button
                type="button"
                aria-pressed={tinta.cursiva === true}
                onClick={() => cambiar(rol, { cursiva: !tinta.cursiva })}
                className="size-6 shrink-0 rounded-md font-serif text-xs italic transition-colors aria-pressed:bg-foreground aria-pressed:text-background hover:bg-foreground/10"
              >
                i
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => guardar({})}
        className="h-7 rounded-full bg-foreground/[0.07] px-3 text-xs transition-colors hover:bg-foreground/[0.11]"
      >
        {translate('auto.components.settings.PaletaDeCodigoSection.volver', 'Back to defaults')}
      </button>
    </SearchableSetting>
  )
}
