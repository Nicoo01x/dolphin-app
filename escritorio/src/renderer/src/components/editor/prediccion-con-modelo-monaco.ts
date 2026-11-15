import type { IDisposable, editor } from 'monaco-editor'
import {
  CONTEXTO_DE_PREDICCION,
  promptDePrediccion,
  sugerenciaDeLaRespuesta,
  valeLaPenaPreguntar
} from '../../../../shared/prediccion-con-modelo'

/**
 * Cuándo preguntarle al modelo por la próxima edición, y cómo no preguntar dos veces lo mismo.
 *
 * El escalón `con-modelo` gasta cuota y tarda segundos: la diferencia entre que sirva y que sea un
 * grifo abierto está entera acá. Las reglas:
 *
 * - **Sólo después de escribir.** Mover el cursor no pide nada: lo que cambia la respuesta es el
 *   texto, no dónde estás parado.
 * - **Una sola consulta viva.** La que estaba en vuelo se da por perdida apenas el documento cambia;
 *   su respuesta se descarta por revisión, no se cancela a medias (el agente ya corrió y ya gastó,
 *   mentirle al contador no lo hace más barato).
 * - **Nada de volver a preguntar lo mismo.** La respuesta se guarda contra el prefijo exacto que la
 *   pidió; borrar una letra y volver a escribirla no vale una segunda llamada.
 * - **El local manda.** Si el camino sin modelo ya tiene algo para ofrecer, no se pregunta: es
 *   instantáneo, es gratis y nunca inventa.
 */

/** Cuánto silencio de teclado antes de preguntar. Abajo de esto se pregunta por cada tecla. */
const ESPERA_MS = 600

/** Cuántas respuestas se recuerdan. Son unos kilobytes y evitan la mayoría de las repreguntas. */
const RECORDADAS = 24

export type Prediccion = { readonly prefijo: string; readonly texto: string }

export type PrediccionConModelo = IDisposable & {
  /** Lo que el modelo contestó para la posición de ahora, si sirve. */
  readonly sugerenciaPara: (prefijo: string) => string | undefined
  /** Que el editor avise que hay algo nuevo para mostrar. */
  readonly alLlegar: (escuchar: () => void) => IDisposable
}

export function instalarPrediccionConModelo(args: {
  editor: editor.IStandaloneCodeEditor
  rutaDelArchivo: string
  leerWorktreePath: () => string | null
  /** Se consulta en cada uso, no al instalar: apagar el ajuste tiene que apagarlo en el momento. */
  activa: () => boolean
  /** Para poder probarlo sin IPC. */
  preguntar?: (prompt: string, worktreePath: string) => Promise<string | undefined>
  /** Para poder probarlo sin esperar de verdad. */
  esperar?: (ms: number) => Promise<void>
}): PrediccionConModelo {
  const { editor: editorInstance, rutaDelArchivo, leerWorktreePath, activa } = args
  const esperar =
    args.esperar ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)))
  const preguntar = args.preguntar ?? preguntarPorIpc

  const recordadas = new Map<string, string>()
  const escuchas = new Set<() => void>()
  const descartables: IDisposable[] = []
  let enVuelo = false
  let ultimoPrefijo = ''
  let desechado = false
  /** Cada tecla invalida la espera anterior sin cancelarla: sólo la última corrida consulta. */
  let turno = 0

  const avisar = (): void => {
    // Una copia: un escucha puede darse de baja a sí mismo al correr.
    for (const escucha of Array.from(escuchas)) {
      escucha()
    }
  }

  const prefijoDeAhora = (): string | undefined => {
    const model = editorInstance.getModel()
    const pos = editorInstance.getPosition()
    if (!model || !pos) {
      return undefined
    }
    const hasta = model.getOffsetAt(pos)
    return model.getValue().slice(Math.max(0, hasta - CONTEXTO_DE_PREDICCION), hasta)
  }

  const consultar = async (): Promise<void> => {
    const model = editorInstance.getModel()
    const pos = editorInstance.getPosition()
    const worktreePath = leerWorktreePath()
    if (!model || !pos || !worktreePath || !activa() || enVuelo) {
      return
    }
    const linea = model.getLineContent(pos.lineNumber)
    const lineaHastaElCursor = linea.slice(0, pos.column - 1)
    const prefijo = prefijoDeAhora()
    if (prefijo === undefined || recordadas.has(prefijo)) {
      return
    }
    if (
      !valeLaPenaPreguntar({
        lineaHastaElCursor,
        alFinalDeLaLinea: pos.column > linea.length,
        caracteresDesdeLaUltima: Math.abs(prefijo.length - ultimoPrefijo.length)
      })
    ) {
      return
    }

    const todo = model.getValue()
    const hasta = model.getOffsetAt(pos)
    const despues = todo.slice(hasta, hasta + CONTEXTO_DE_PREDICCION)
    const laRevision = model.getVersionId()

    enVuelo = true
    ultimoPrefijo = prefijo
    try {
      const crudo = await preguntar(
        promptDePrediccion({ antes: prefijo, despues, rutaDelArchivo }),
        worktreePath
      )
      // El documento cambió mientras tanto: lo que volvió es para otro texto. No se tira a la
      // caché con el prefijo nuevo —sería una respuesta pegada a una pregunta que no se hizo—.
      if (
        desechado ||
        crudo === undefined ||
        editorInstance.getModel()?.getVersionId() !== laRevision
      ) {
        return
      }
      const sugerencia = sugerenciaDeLaRespuesta(crudo, { antes: prefijo, despues })
      // También se recuerda el «no hay nada»: si no, cada pausa vuelve a pagar por el mismo no.
      recordadas.set(prefijo, sugerencia ?? '')
      while (recordadas.size > RECORDADAS) {
        const masVieja = recordadas.keys().next().value
        if (masVieja === undefined) {
          break
        }
        recordadas.delete(masVieja)
      }
      if (sugerencia) {
        avisar()
      }
    } catch {
      // Que el modelo falle no es un error del editor: se escribe igual, sin fantasma.
    } finally {
      enVuelo = false
    }
  }

  const programar = (): void => {
    if (!activa()) {
      return
    }
    const mio = ++turno
    void esperar(ESPERA_MS).then(() => {
      // Mientras esperábamos siguió escribiendo: ésta ya no es la última pausa.
      if (desechado || mio !== turno) {
        return
      }
      return consultar()
    })
  }

  descartables.push(
    editorInstance.onDidChangeModelContent(() => {
      // La consulta en vuelo quedó vieja: su revisión ya no es la del documento y la guardia de
      // arriba la va a descartar sola cuando vuelva.
      programar()
    })
  )
  descartables.push(
    editorInstance.onDidChangeModel(() => {
      recordadas.clear()
      ultimoPrefijo = ''
    })
  )

  return {
    sugerenciaPara: (prefijo: string) => {
      const guardada = recordadas.get(prefijo)
      return guardada ? guardada : undefined
    },
    alLlegar: (escuchar: () => void) => {
      escuchas.add(escuchar)
      return { dispose: () => void escuchas.delete(escuchar) }
    },
    dispose: () => {
      desechado = true
      turno += 1
      escuchas.clear()
      recordadas.clear()
      for (const d of descartables) {
        d.dispose()
      }
      descartables.length = 0
    }
  }
}

/**
 * El camino de verdad: el mismo canal que Cmd+K.
 *
 * No se abre un IPC nuevo a propósito. Es la misma operación —pedirle texto a un agente y
 * esperar— con la misma cola, los mismos límites y el mismo manejo de fallas; un segundo canal
 * sería un segundo lugar donde arreglar el mismo bug.
 */
async function preguntarPorIpc(prompt: string, worktreePath: string): Promise<string | undefined> {
  const respuesta = await window.api.editor.generateInlineEdit({ worktreePath, prompt })
  return respuesta.success ? respuesta.codigo : undefined
}
