import { FileText } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { NativeChatHighlightedCode } from '../../native-chat/markdown/code/NativeChatHighlightedCode'
import { detectLanguage } from '../../../../../shared/editor-language/editor-language-detect'
import {
  unifiedLineNumber,
  type NativeChatEditFile,
  type NativeChatEditLine
} from '../../../../../shared/native-chat/tools/native-chat-edit-model'
import { rutaCorta } from './pasos'

/**
 * El diff de un paso, incrustado debajo de su frase: el archivo, sus líneas con número, y las que
 * cambiaron con fondo rojo o verde muy oscuro y la barra de color en el canto (la referencia).
 *
 * Los colores salen del tema de código (`tema-noche.css` pinta `--diff-*` con Dolphin Noche); el
 * resaltado de cada línea es el mismo del chat (shiki), así el código se ve igual acá que allá.
 */

/** Las líneas que entran sin que la tarjeta se vuelva un visor de diffs: el cambio y su contexto. */
const LINEAS_MAXIMAS = 12

export function recorte(lineas: readonly NativeChatEditLine[]): NativeChatEditLine[] {
  const primera = lineas.findIndex((linea) => linea.kind === 'add' || linea.kind === 'del')
  if (lineas.length <= LINEAS_MAXIMAS || primera === -1) {
    return lineas.slice(0, LINEAS_MAXIMAS)
  }
  const desde = Math.max(0, primera - 2)
  return lineas.slice(desde, desde + LINEAS_MAXIMAS)
}

function Fila({
  linea,
  lenguaje
}: {
  linea: NativeChatEditLine
  lenguaje: string
}): React.JSX.Element {
  if (linea.kind === 'gap') {
    return <div className="px-4 text-center text-muted-foreground select-none">⋯</div>
  }
  const agregada = linea.kind === 'add'
  const quitada = linea.kind === 'del'
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4',
        agregada &&
          'bg-[var(--diff-added-background)] shadow-[inset_3px_0_0_var(--chat-diff-added)]',
        quitada &&
          'bg-[var(--diff-removed-background)] shadow-[inset_3px_0_0_var(--chat-diff-removed)]'
      )}
    >
      <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground select-none">
        {unifiedLineNumber(linea) ?? ''}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'w-2 shrink-0 select-none',
          agregada && 'text-[var(--chat-diff-added)]',
          quitada && 'text-[var(--chat-diff-removed)]'
        )}
      >
        {agregada ? '+' : quitada ? '-' : ' '}
      </span>
      <span className="min-w-0 whitespace-pre text-foreground">
        <NativeChatHighlightedCode code={linea.text} language={lenguaje} />
      </span>
    </div>
  )
}

export function DiffIncrustado({ archivo }: { archivo: NativeChatEditFile }): React.JSX.Element {
  const lenguaje = detectLanguage(archivo.path)
  return (
    <figure className="lo-que-hizo-codigo overflow-hidden rounded-xl">
      <figcaption className="flex items-center gap-2 px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{rutaCorta(archivo.path)}</span>
        <span className="shrink-0 tabular-nums">
          <span className="text-[var(--chat-diff-added)]">+{archivo.added}</span>{' '}
          <span className="text-[var(--chat-diff-removed)]">{`−${archivo.removed}`}</span>
        </span>
      </figcaption>
      <div className="overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.75] scrollbar-sleek">
        {recorte(archivo.lines).map((linea, indice) => (
          <Fila
            key={`${indice}:${linea.kind}:${linea.oldLineNumber}:${linea.newLineNumber}`}
            linea={linea}
            lenguaje={lenguaje}
          />
        ))}
      </div>
    </figure>
  )
}
