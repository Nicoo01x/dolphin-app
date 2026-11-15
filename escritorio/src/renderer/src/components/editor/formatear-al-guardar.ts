/**
 * Formatear al guardar.
 *
 * El formateador lo pone el servidor de lenguaje (`textDocument/formatting`, registrado en
 * `lsp-en-monaco.ts`), así que acá no hay ninguna regla de estilo: sólo la decisión de cuándo
 * correrlo y, sobre todo, qué hacer cuando sale mal.
 *
 * Tres reglas, y las tres existen porque la alternativa es perder trabajo:
 *
 * 1. **Guardar siempre.** Si el formateador no existe, tira, o tarda, se guarda igual. Un Ctrl+S
 *    que no escribe el archivo porque un proceso auxiliar se colgó es el peor error posible en un
 *    editor: la persona cree que guardó.
 * 2. **Con tope de tiempo.** Un servidor de lenguaje recién arrancado está indexando y puede
 *    tardar segundos en contestar. Pasado el tope se guarda lo que hay.
 * 3. **Apagado por defecto.** Formatear sin que nadie lo pida reescribe el archivo entero de
 *    alguien que quizás sólo quería cambiar una línea, y el diff que ve después no es el suyo.
 *    VS Code también lo trae apagado.
 */

/** Lo poco que se le pide a Monaco. Así esto se prueba sin un editor de verdad. */
export type EditorQueFormatea = {
  getValue: () => string
  getAction: (id: string) => AccionDeFormato | null
}

export type AccionDeFormato = {
  /** Monaco contesta false cuando ningún proveedor registró formato para este lenguaje. */
  isSupported: () => boolean
  run: () => Promise<unknown>
}

/** Qué pasó, para poder afirmarlo en un test y para la traza. */
export type ResultadoDeFormato = 'apagado' | 'sin-formateador' | 'formateado' | 'falló' | 'tardó'

/** Lo que tarda un prettier sobre un archivo grande, con aire. Más que esto es que algo se colgó. */
export const TOPE_DE_FORMATO_MS = 2_000

const ACCION = 'editor.action.formatDocument'

export async function guardarConFormato(args: {
  readonly editor: EditorQueFormatea
  readonly formatearPrimero: boolean
  readonly guardar: (texto: string) => void
  readonly topeMs?: number
  /** Para el test: por defecto, el reloj. */
  readonly esperar?: (ms: number) => Promise<void>
}): Promise<ResultadoDeFormato> {
  const resultado = await intentarFormatear(args)
  // Fuera del try a propósito: pase lo que pase con el formateador, el archivo se guarda, y se
  // guarda con lo que el editor tiene AHORA —después de las ediciones del formateador, si llegaron.
  args.guardar(args.editor.getValue())
  return resultado
}

async function intentarFormatear(args: {
  readonly editor: EditorQueFormatea
  readonly formatearPrimero: boolean
  readonly topeMs?: number
  readonly esperar?: (ms: number) => Promise<void>
}): Promise<ResultadoDeFormato> {
  if (!args.formatearPrimero) {
    return 'apagado'
  }
  const accion = args.editor.getAction(ACCION)
  if (!accion || !accion.isSupported()) {
    return 'sin-formateador'
  }
  const topeMs = args.topeMs ?? TOPE_DE_FORMATO_MS
  const esperar =
    args.esperar ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)))
  try {
    const cual = await Promise.race([
      accion.run().then(() => 'formateado' as const),
      esperar(topeMs).then(() => 'tardó' as const)
    ])
    return cual
  } catch {
    // El motivo no se muestra: quien guarda quiere guardar, no leer por qué el formateador falló.
    return 'falló'
  }
}
