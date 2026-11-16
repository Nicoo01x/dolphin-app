import { useLayoutEffect } from 'react'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { NativeChatComposer } from '../../native-chat/composer/NativeChatComposer'
import { NATIVE_CHAT_APPEARANCE_ROOT_CLASS } from '../../native-chat/appearance/native-chat-appearance-style'
import { FONDO_DEL_CHAT_DE_FABRICA, VELO_MINIMO } from '../../../../../shared/fondo-del-chat'
import { CapaDePaisaje } from './FondoDePaisaje'
import { PreguntaDelChatVacio } from './ChatVacioConPaisaje'
import { fondoIncluido } from './fondos'
import { variablesDelPaisaje } from './use-fondo-del-chat'

/**
 * La ventana sobre el óleo, con la tienda de ejemplo. `pnpm fixtures:shot "dolphin/paisaje/Paisaje:*" --theme both`.
 *
 * La capa va `absoluta` dentro del marco (la de la app es fija a la ventana) y la marca de <html>
 * se pone y se saca con la fixture, como hace la de los fondos de tema.
 */

const SESIONES = [
  { titulo: 'Precios del plan Pro', rama: 'fix/precio-safari', hace: '4 min' },
  { titulo: 'Carrito: envío gratis', rama: 'feat/envio-gratis', hace: '22 min' },
  { titulo: 'Checkout en una página', rama: 'main', hace: '1 h' },
  { titulo: 'Fotos del catálogo en WebP', rama: 'perf/fotos-webp', hace: '3 h' }
]

function MarcaDelPaisaje({ velo }: { velo: number }): null {
  useLayoutEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.dolphinPaisaje = 'vidrio'
    for (const [nombre, valor] of Object.entries(variablesDelPaisaje(velo))) {
      raiz.style.setProperty(nombre, valor)
    }
    return () => {
      delete raiz.dataset.dolphinPaisaje
    }
  }, [velo])
  return null
}

function BarraLateral(): React.JSX.Element {
  return (
    <aside
      data-dolphin-panel="lateral"
      className="flex w-60 shrink-0 flex-col gap-1 p-2 bg-worktree-sidebar"
    >
      <p className="px-2 py-1.5 font-display text-sm font-semibold text-foreground">tienda-web</p>
      {SESIONES.map((sesion, indice) => (
        <div
          key={sesion.titulo}
          className={
            indice === 0
              ? 'flex flex-col gap-0.5 rounded-lg bg-foreground/[0.08] px-2 py-1.5'
              : 'flex flex-col gap-0.5 rounded-lg px-2 py-1.5'
          }
        >
          <div className="flex items-center justify-between gap-2 text-[13px] text-foreground">
            <span className="truncate">{sesion.titulo}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{sesion.hace}</span>
          </div>
          <span className="truncate text-xs text-muted-foreground">{sesion.rama}</span>
        </div>
      ))}
    </aside>
  )
}

function Ventana({
  conversacion,
  fondo = 'merced',
  velo = FONDO_DEL_CHAT_DE_FABRICA.velo
}: {
  conversacion: boolean
  fondo?: string
  velo?: number
}): React.JSX.Element {
  return (
    <div className="relative flex h-[820px] w-full flex-col overflow-hidden">
      <MarcaDelPaisaje velo={velo} />
      <div className="titlebar relative z-10 shrink-0 px-3 text-[13px] text-foreground">
        tienda-web · fix/precio-safari
      </div>
      <div className="relative flex min-h-0 flex-1">
        <CapaDePaisaje url={fondoIncluido(fondo).url} desenfoque={false} absoluta />
        <div className="relative z-10 flex min-h-0 flex-1">
          <BarraLateral />
          <div
            data-native-chat-root="true"
            className={`${NATIVE_CHAT_APPEARANCE_ROOT_CLASS} flex min-h-0 flex-1 flex-col`}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {conversacion ? <Conversacion /> : <PreguntaDelChatVacio proyecto="tienda-web" />}
            </div>
            <NativeChatComposer
              terminalTabId="fixture-paisaje"
              paneKey="fixture-paisaje:1"
              targetPtyId="fixture-paisaje-pty"
              agent="claude"
              canSend
            />
          </div>
        </div>
      </div>
      <div className="relative z-10 h-6 shrink-0 border-t border-border bg-card px-3 text-[11px] leading-6 text-muted-foreground">
        ana-dev · tienda-web
      </div>
    </div>
  )
}

function Conversacion(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-4 px-4 pt-6 text-sm text-chat-foreground">
      <p className="ml-auto rounded-2xl bg-chat-user-surface px-3 py-2">
        El test de precios falla sólo en Safari. ¿Lo mirás?
      </p>
      <p>
        Era la fecha:{' '}
        <strong className="text-chat-foreground-strong">new Date(&apos;2026-11-01&apos;)</strong>{' '}
        Safari la lee como hora local y el mes queda en octubre. Lo armé con <code>Date.UTC</code> y
        el test ahora lee el precio del mes en curso.
      </p>
    </div>
  )
}

export const vacio = defineFixture(
  enCastellano({ width: 1440, render: () => <Ventana conversacion={false} /> })
)
export const conConversacion = defineFixture(
  enCastellano({ width: 1440, render: () => <Ventana conversacion /> })
)
/** El cuadro más claro de los seis con el velo mínimo: el peor caso para el contraste. */
export const vacioDesfiladero = defineFixture(
  enCastellano({
    width: 1440,
    render: () => <Ventana conversacion={false} fondo="desfiladero" velo={VELO_MINIMO} />
  })
)
export const conversacionDesfiladero = defineFixture(
  enCastellano({
    width: 1440,
    render: () => <Ventana conversacion fondo="desfiladero" velo={VELO_MINIMO} />
  })
)
