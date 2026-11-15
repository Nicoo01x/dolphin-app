import { useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  fondoDelChat,
  VELO_MAXIMO,
  VELO_MINIMO,
  type FondoDelChat,
  type FuenteDelFondo
} from '../../../../shared/fondo-del-chat'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { Slider } from '../ui/slider'
import { SettingsSwitchRow } from './form-controls/SettingsFormControls'
import { SearchableSetting } from './section-layout/SearchableSetting'
import { getFondoDelChatEntries } from './appearance-fondo-del-chat-search'
import { FONDOS_INCLUIDOS } from '../dolphin/paisaje/fondos'
import { useUrlDelFondo, variablesDelPaisaje } from '../dolphin/paisaje/use-fondo-del-chat'

/**
 * Ajustes → Apariencia → «Fondo del chat».
 *
 * Se elige mirando: cada opción es la miniatura del cuadro, y la ventana entera de atrás es la vista
 * previa —cambia apenas se toca, sin botón de aplicar—. El deslizador mueve el velo en vivo mientras
 * se arrastra y se guarda al soltar, para no escribir el perfil sesenta veces por segundo.
 *
 * Se guarda en el perfil, como el resto de sus ajustes: cada perfil tiene su fondo.
 */

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisiblePrimary?: boolean
}

function mismaFuente(a: FuenteDelFondo, b: FuenteDelFondo): boolean {
  if (a.tipo !== b.tipo) {
    return false
  }
  if (a.tipo === 'incluido' && b.tipo === 'incluido') {
    return a.id === b.id
  }
  if (a.tipo === 'propio' && b.tipo === 'propio') {
    return a.nombre === b.nombre
  }
  return true
}

/** Una opción de la grilla: la miniatura del cuadro con su nombre debajo. */
function Miniatura({
  elegida,
  titulo,
  nombre,
  url,
  onElegir,
  children
}: {
  elegida: boolean
  titulo?: string
  nombre: string
  url: string | null
  onElegir: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      title={titulo}
      onClick={onElegir}
      className="group flex w-32 flex-col gap-1.5 rounded-xl p-1 text-left transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
    >
      <span
        className={cn(
          'relative block h-[72px] w-full overflow-hidden rounded-lg bg-foreground/[0.06]',
          elegida && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
        )}
      >
        {url ? (
          <img src={url} alt="" decoding="async" className="size-full object-cover" />
        ) : (
          children
        )}
        {elegida ? (
          <span className="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="size-3" aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className="truncate px-0.5 text-xs text-muted-foreground group-aria-checked:text-foreground">
        {nombre}
      </span>
    </button>
  )
}

function MiniaturaPropia({
  fuente,
  elegida,
  onElegir
}: {
  fuente: Extract<FuenteDelFondo, { tipo: 'propio' }>
  elegida: boolean
  onElegir: () => void
}): React.JSX.Element {
  const url = useUrlDelFondo(fuente)
  return (
    <Miniatura
      elegida={elegida}
      nombre={translate('settings.appearance.fondoDelChat.propio', 'Your image')}
      url={url}
      onElegir={onElegir}
    />
  )
}

/** Lo que pasó al elegir una imagen, dicho en una línea; null si salió bien o se canceló. */
function avisoDeEleccion(motivo: 'cancelado' | 'formato' | 'pesada' | 'ilegible'): string | null {
  switch (motivo) {
    case 'cancelado':
      return null
    case 'formato':
      return translate(
        'settings.appearance.fondoDelChat.formato',
        'Use a WebP, PNG, JPG or AVIF image.'
      )
    case 'pesada':
      return translate(
        'settings.appearance.fondoDelChat.pesada',
        'That image is over 25 MB. Pick a smaller one.'
      )
    case 'ilegible':
      return translate(
        'settings.appearance.fondoDelChat.ilegible',
        'That image could not be read. Try another one.'
      )
  }
}

export function FondoDelChatSection({
  settings,
  updateSettings,
  forceVisiblePrimary
}: Props): React.JSX.Element {
  const entrada = getFondoDelChatEntries()[0]
  const fondo = fondoDelChat(settings.fondoDelChat)
  const [velo, setVelo] = useState({ guardado: fondo.velo, valor: fondo.velo })
  const [aviso, setAviso] = useState<string | null>(null)
  if (velo.guardado !== fondo.velo) {
    setVelo({ guardado: fondo.velo, valor: fondo.velo })
  }
  // El objeto entero: la escritura de ajustes es superficial y un campo suelto pisaría los otros.
  const guardar = (cambio: Partial<FondoDelChat>): void => {
    updateSettings({ fondoDelChat: { ...fondo, ...cambio } })
  }
  const elegirFuente = (fuente: FuenteDelFondo): void => {
    setAviso(null)
    guardar({ fuente })
  }
  const elegirImagen = async (): Promise<void> => {
    const elegir = window.api?.dolphin?.elegirFondoDelChat
    if (!elegir) {
      return
    }
    const resultado = await elegir()
    if (resultado.ok) {
      elegirFuente({ tipo: 'propio', nombre: resultado.nombre })
      return
    }
    setAviso(avisoDeEleccion(resultado.motivo))
  }
  const ninguno = fondo.fuente.tipo === 'ninguno'

  return (
    <SearchableSetting id={entrada.targetSectionId} {...entrada} forceVisible={forceVisiblePrimary}>
      <div className="space-y-4 py-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">{entrada.title}</h3>
          <p className="text-xs text-muted-foreground">{entrada.description}</p>
        </div>

        <div role="radiogroup" aria-label={entrada.title} className="flex flex-wrap gap-1">
          <Miniatura
            elegida={ninguno}
            nombre={translate('settings.appearance.fondoDelChat.ninguno', 'None')}
            url={null}
            onElegir={() => elegirFuente({ tipo: 'ninguno' })}
          />
          {FONDOS_INCLUIDOS.map((incluido) => (
            <Miniatura
              key={incluido.id}
              elegida={mismaFuente(fondo.fuente, { tipo: 'incluido', id: incluido.id })}
              titulo={`${incluido.artista}, ${incluido.anio}`}
              nombre={incluido.obra}
              url={incluido.url}
              onElegir={() => elegirFuente({ tipo: 'incluido', id: incluido.id })}
            />
          ))}
          {fondo.fuente.tipo === 'propio' ? (
            <MiniaturaPropia fuente={fondo.fuente} elegida onElegir={() => undefined} />
          ) : null}
          <Miniatura
            elegida={false}
            nombre={translate('settings.appearance.fondoDelChat.elegir', 'Choose an image…')}
            url={null}
            onElegir={() => void elegirImagen()}
          >
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <ImagePlus className="size-5" aria-hidden="true" />
            </span>
          </Miniatura>
        </div>
        {aviso ? (
          <p role="status" className="text-xs text-[var(--murio,#e5776d)]">
            {aviso}
          </p>
        ) : null}

        <div
          className={cn('space-y-3', ninguno && 'pointer-events-none opacity-50')}
          aria-disabled={ninguno}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm">
                {translate('settings.appearance.fondoDelChat.velo', 'Veil')}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'settings.appearance.fondoDelChat.veloAyuda',
                  'How much the painting darkens. The panels always add what the text needs.'
                )}
              </p>
            </div>
            <div className="flex w-52 shrink-0 items-center gap-2">
              <Slider
                disabled={ninguno}
                min={VELO_MINIMO * 100}
                max={VELO_MAXIMO * 100}
                step={1}
                value={[Math.round(velo.valor * 100)]}
                thumbLabels={[translate('settings.appearance.fondoDelChat.velo', 'Veil')]}
                onValueChange={([valor]) => {
                  const siguiente = (valor ?? velo.valor * 100) / 100
                  setVelo({ guardado: fondo.velo, valor: siguiente })
                  // Vista previa en vivo: la ventana de atrás cambia mientras se arrastra.
                  for (const [nombre, css] of Object.entries(variablesDelPaisaje(siguiente))) {
                    document.documentElement.style.setProperty(nombre, css)
                  }
                }}
                onValueCommit={([valor]) => guardar({ velo: (valor ?? velo.valor * 100) / 100 })}
              />
              <span className="w-10 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                {Math.round(velo.valor * 100)} %
              </span>
            </div>
          </div>
          <SettingsSwitchRow
            label={translate('settings.appearance.fondoDelChat.desenfoque', 'Blur the painting')}
            description={translate(
              'settings.appearance.fondoDelChat.desenfoqueAyuda',
              'A light blur. The texture of the canvas still shows.'
            )}
            checked={fondo.desenfoque}
            disabled={ninguno}
            onChange={() => guardar({ desenfoque: !fondo.desenfoque })}
          />
        </div>
      </div>
    </SearchableSetting>
  )
}
