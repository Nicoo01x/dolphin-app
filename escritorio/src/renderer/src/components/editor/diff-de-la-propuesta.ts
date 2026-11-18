import { editLinesFromContents } from '../../../../shared/native-chat/tools/native-chat-edit-lcs'
import {
  finalizeEditFile,
  type NativeChatEditFile
} from '../../../../shared/native-chat/tools/native-chat-edit-model'

/**
 * El diff de lo que propone Cmd+K, armado con el mismo modelo que pinta los diffs del chat y de
 * «Lo que hizo»: así un reemplazo se ve igual acá que allá, con sus líneas rojas y verdes.
 *
 * Los números de línea son los del archivo: el diff se calcula sobre el fragmento y después se
 * corre a la línea donde empieza la selección, para que «12» quiera decir la línea 12 del editor.
 */
export function diffDeLaPropuesta(args: {
  ruta: string
  antes: string
  despues: string
  /** La línea del archivo donde empieza el fragmento, desde 1. */
  primeraLinea: number
}): NativeChatEditFile {
  const { lines, truncated } = editLinesFromContents(args.antes, args.despues)
  const correr = (numero: number | null): number | null =>
    numero === null ? null : numero + args.primeraLinea - 1
  return finalizeEditFile({
    path: args.ruta,
    oldPath: null,
    changeKind: 'edited',
    lines: lines.map((linea) => ({
      ...linea,
      oldLineNumber: correr(linea.oldLineNumber),
      newLineNumber: correr(linea.newLineNumber)
    })),
    lineNumbersKnown: true,
    truncated
  })
}
