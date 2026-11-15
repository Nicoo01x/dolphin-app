import type { editor } from 'monaco-editor'
import { hunkEnLaLinea, hunksDe, revertirHunk, type Hunk } from './bordes-de-git'

/**
 * El borde de git, puesto sobre un editor de Monaco.
 *
 * Lo que decide qué cambió y cómo se revierte está en `bordes-de-git.ts`, probado sin editor.
 * Acá sólo se pinta y se escucha.
 *
 * Dos decisiones de ritmo, las dos para que escribir no se ponga pesado:
 * - El recálculo va con espera: cada tecla dispararía un diff del archivo entero, y en uno de
 *   3.000 líneas eso se siente mientras escribís.
 * - La base se lee UNA vez al instalar y cuando quien llama lo pida (un commit, un `git add`).
 *   Preguntarle a git en cada tecla es un proceso nuevo por tecla.
 */

/** Las clases de las rayitas. Viven en tema-dolphin.css, junto al resto del tema del editor. */
const CLASE: Record<Hunk['tipo'], string> = {
  agregado: 'borde-git-agregado',
  cambiado: 'borde-git-cambiado',
  borrado: 'borde-git-borrado'
}

/** Lo justo de Monaco que se usa, para poder probar el armado sin un editor de verdad. */
type EditorConBorde = Pick<
  editor.IStandaloneCodeEditor,
  'getValue' | 'onDidChangeModelContent' | 'createDecorationsCollection' | 'executeEdits'
> & {
  getModel: () => { getLineCount: () => number } | null
}

export type BordeDeGit = {
  /** Vuelve a leer la base (después de un commit o un `git add`) y repinta. */
  refrescar: (baseNueva?: string) => void
  /** El pedazo que toca esa línea, o null. Lo usa el menú del borde. */
  hunkEn: (linea: number) => Hunk | null
  /** Todos los pedazos pintados ahora, en orden. Lo usa «ir al próximo cambio» desde el teclado. */
  hunks: () => readonly Hunk[]
  /** Devuelve ese pedazo a como estaba, conservando el deshacer del editor. */
  revertir: (hunk: Hunk) => void
  dispose: () => void
}

/** Lo que tarda en repintar después de dejar de teclear. Debajo de esto se siente nervioso. */
export const ESPERA_DEL_BORDE_MS = 250

export function instalarBordeDeGit(args: {
  readonly editor: EditorConBorde
  /** El texto de la base. Vacío con `hayBase: false` significa «no sé», y no se pinta nada. */
  readonly base: string
  readonly hayBase: boolean
  readonly esperaMs?: number
}): BordeDeGit {
  const coleccion = args.editor.createDecorationsCollection([])
  let base = args.base
  let hayBase = args.hayBase
  let hunks: Hunk[] = []
  let reloj: ReturnType<typeof setTimeout> | null = null
  let vivo = true

  const pintar = (): void => {
    if (!vivo) {
      return
    }
    // Sin base no se pinta NADA. Tratar «no sé» como «archivo vacío» marcaría el archivo entero
    // como agregado, que es la forma más ruidosa posible de equivocarse.
    hunks = hayBase ? hunksDe(base, args.editor.getValue()) : []
    coleccion.set(hunks.map(decoracionDe))
  }

  const programarPintado = (): void => {
    if (reloj) {
      clearTimeout(reloj)
    }
    reloj = setTimeout(pintar, args.esperaMs ?? ESPERA_DEL_BORDE_MS)
  }

  pintar()
  const escucha = args.editor.onDidChangeModelContent(programarPintado)

  return {
    refrescar: (baseNueva?: string) => {
      if (baseNueva !== undefined) {
        base = baseNueva
        hayBase = true
      }
      pintar()
    },
    hunkEn: (linea) => hunkEnLaLinea(hunks, linea),
    hunks: () => hunks,
    revertir: (hunk) => {
      const modelo = args.editor.getModel()
      if (!modelo) {
        return
      }
      // Con la base: si el pedazo llega al final del archivo, el salto final vuelve a ser el de
      // HEAD. El fin de línea lo pone el documento (`getValue` lo da en el del modelo).
      const texto = revertirHunk(args.editor.getValue(), hunk, hayBase ? base : undefined)
      // Why executeEdits y no setValue: setValue borra el historial de deshacer, así que un
      // «revertí este pedazo» por error se vuelve imposible de deshacer.
      args.editor.executeEdits('borde-de-git', [
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: modelo.getLineCount() + 1,
            endColumn: 1
          },
          text: texto,
          forceMoveMarkers: true
        }
      ])
      pintar()
    },
    dispose: () => {
      vivo = false
      if (reloj) {
        clearTimeout(reloj)
      }
      escucha.dispose()
      coleccion.clear()
    }
  }
}

function decoracionDe(hunk: Hunk): editor.IModelDeltaDecoration {
  // Un borrado no tiene líneas propias: se marca sobre la de arriba del corte, o sobre la
  // primera del archivo cuando lo borrado estaba al principio.
  const linea = hunk.tipo === 'borrado' ? Math.max(1, hunk.desde - 1) : hunk.desde
  const hasta = hunk.tipo === 'borrado' ? linea : hunk.hasta
  return {
    range: { startLineNumber: linea, startColumn: 1, endLineNumber: hasta, endColumn: 1 },
    options: {
      isWholeLine: false,
      linesDecorationsClassName: CLASE[hunk.tipo],
      // Para que el pedazo siga a la línea cuando se escribe arriba, en vez de quedarse fijo.
      stickiness: 1
    }
  }
}
