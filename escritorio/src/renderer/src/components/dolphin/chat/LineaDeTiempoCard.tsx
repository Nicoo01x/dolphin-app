import { translate } from '@/i18n/i18n'
import { uiDateTimeFormat } from '@/i18n/ui-intl-formatters'
import { marcaDeModelo } from './insignias'
import type { Hito, LineaDeTiempo } from './linea-de-tiempo'
import './linea-de-tiempo.css'

/**
 * Lo que fue pasando, en el panel de la sesión: una fila por hito, con su punto de color y, cuando
 * la fila dice quién contestó, el logo del motor que habla.
 *
 * El chip del modelo es EL MISMO del texto del agente: `data-insignia="modelo"` + `data-marca`
 * debajo de `native-chat-markdown`, que es de donde cuelgan sus reglas en insignias.css. Why y no
 * un `<img>` con el logo: las nueve marcas y sus archivos ya están en esa hoja, y declararlos otra
 * vez acá es el lugar donde las dos listas se van a separar. Esa clase no trae estilos de texto
 * propios —son reglas de atributo nada más—, así que no le cambia la tipografía a la fila.
 */

// Constante de módulo porque los formateadores de la UI se cachean por identidad de las opciones.
const HORA_CORTA: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

/** La hora, corta, de lo que pasó. Sin marca de tiempo (un scrape) la fila va sin hora. */
function hora(cuando: number | null): string | null {
  if (cuando === null) {
    return null
  }
  return uiDateTimeFormat(HORA_CORTA).format(new Date(cuando))
}

function FilaDeHito({ hito }: { hito: Hito }): React.JSX.Element {
  const cuando = hora(hito.cuando)
  return (
    <li
      data-hito={hito.clase}
      className="flex items-baseline gap-2 rounded-xl px-2 py-1 text-xs"
      // La fila se recorta en pantalla; el texto entero queda para el lector y para el puntero.
      title={hito.texto}
    >
      <span className="flex h-[1.1em] w-2 shrink-0 items-center justify-center">
        <span className="dolphin-hito-punto" aria-hidden="true" />
      </span>
      {hito.modelo ? (
        <span className="native-chat-markdown min-w-0 flex-1 truncate">
          <span data-insignia="modelo" data-marca={marcaDeModelo(hito.modelo)}>
            {hito.texto}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-chat-foreground-strong">{hito.texto}</span>
      )}
      {cuando ? (
        <span className="shrink-0 tabular-nums text-2xs text-chat-foreground-faint">{cuando}</span>
      ) : null}
    </li>
  )
}

export function LineaDeTiempoCard({ model }: { model: LineaDeTiempo }): React.JSX.Element {
  if (model.hitos.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-chat-foreground-faint">
        {translate(
          'components.dolphin.chat.lineaDeTiempo.vacia',
          'Nothing has happened in this chat yet'
        )}
      </p>
    )
  }
  return (
    <div className="space-y-1.5 px-3 pb-3">
      {model.antes > 0 ? (
        <p className="px-1 text-2xs text-chat-foreground-faint">
          {translate(
            'components.dolphin.chat.lineaDeTiempo.antes',
            '{{count}} more things happened before this; they are in the conversation',
            { count: model.antes }
          )}
        </p>
      ) : null}
      <ul className="dolphin-linea-de-tiempo rounded-xl bg-foreground/[0.04] p-1">
        {model.hitos.map((hito) => (
          <FilaDeHito key={hito.clave} hito={hito} />
        ))}
      </ul>
    </div>
  )
}
