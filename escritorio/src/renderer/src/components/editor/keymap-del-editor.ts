import type * as monaco from 'monaco-editor'

/**
 * El teclado del editor: el de VS Code, el de Vim o el de Emacs.
 *
 * Quien escribe en Vim escribe en Vim en todos lados, y un editor que lo ignora es un editor que
 * no va a usar. Es lo más pedido del editor río arriba y no lo tenía ninguno de los dos lados.
 *
 * Why los dos modos se cargan recién cuando se eligen: son dos paquetes que nadie que use el
 * teclado de siempre —la enorme mayoría— tiene por qué pagar en el arranque. Con `import()`
 * literal, Vite los deja en su propio trozo y el que elige «vscode» no baja ni un byte.
 *
 * Lo que decide qué cargar está separado de lo que lo monta a propósito: elegir se prueba sin
 * editor y sin paquetes, y es donde están las trampas (un ajuste viejo con un valor que ya no
 * existe, o uno escrito a mano).
 */

export const KEYMAPS = ['vscode', 'vim', 'emacs'] as const
export type Keymap = (typeof KEYMAPS)[number]

/** El teclado de siempre: el que Monaco trae puesto. */
export const KEYMAP_POR_DEFECTO: Keymap = 'vscode'

/**
 * El keymap que corresponde a lo que haya guardado en los ajustes.
 *
 * Nunca falla: un perfil viejo no tiene el ajuste, y uno editado a mano puede tener cualquier
 * cosa. En los dos casos se usa el de siempre, que es lo que esa persona venía teniendo.
 */
export function keymapDe(valor: unknown): Keymap {
  return KEYMAPS.includes(valor as Keymap) ? (valor as Keymap) : KEYMAP_POR_DEFECTO
}

/** Si hace falta cargar algo. El de VS Code ya está adentro de Monaco. */
export function necesitaCarga(keymap: Keymap): boolean {
  return keymap !== 'vscode'
}

/** Lo que hay que hacer para sacar un keymap. No hacer nada también es una forma válida. */
export type Soltar = () => void

const NADA: Soltar = () => {}

/**
 * Lo que un modo tiene que saber hacer, para poder probar el montaje sin los paquetes de verdad.
 * `montar` devuelve cómo desmontarlo.
 */
export type Modo = {
  montar: (editor: monaco.editor.IStandaloneCodeEditor, barra: HTMLElement | null) => Soltar
}

/** Carga el modo elegido. Devuelve null para el teclado de siempre, que no carga nada. */
export async function cargarModo(keymap: Keymap): Promise<Modo | null> {
  if (keymap === 'vim') {
    // Why el import literal y no una variable: Vite sólo arma el trozo aparte si ve el nombre.
    const { initVimMode } = await import('monaco-vim')
    return {
      montar: (editor, barra) => {
        const modo = initVimMode(editor, barra ?? undefined)
        return () => modo.dispose()
      }
    }
  }
  if (keymap === 'emacs') {
    const { EmacsExtension } = await import('monaco-emacs')
    return {
      montar: (editor) => {
        const extension = new EmacsExtension(editor)
        extension.start()
        return () => extension.dispose()
      }
    }
  }
  return null
}

/**
 * Pone el keymap sobre un editor y devuelve cómo sacarlo.
 *
 * Why el guardia de `vigente`: cambiar de modo dos veces rápido —o cerrar el archivo mientras el
 * paquete todavía se baja— dejaba el modo viejo montado encima del nuevo, con dos teclados
 * peleándose por la misma tecla. Si cuando termina la carga ya nadie lo quiere, se desmonta solo
 * sin haber llegado a tocar el editor.
 */
export async function montarKeymap(args: {
  readonly editor: monaco.editor.IStandaloneCodeEditor
  readonly keymap: Keymap
  /** Dónde escribe Vim su línea de estado (`-- INSERT --`). Sin ella, no la muestra. */
  readonly barra: HTMLElement | null
  readonly vigente: () => boolean
  /** Sólo para los tests: de dónde sale el modo. */
  readonly cargar?: (keymap: Keymap) => Promise<Modo | null>
}): Promise<Soltar> {
  const cargar = args.cargar ?? cargarModo
  let modo: Modo | null = null
  try {
    modo = await cargar(args.keymap)
  } catch {
    // Un paquete que no carga no puede dejar sin editor a nadie: se sigue con el teclado de
    // siempre, que es lo que había un segundo antes.
    return NADA
  }
  if (!modo || !args.vigente()) {
    return NADA
  }
  const soltar = modo.montar(args.editor, args.barra)
  let soltado = false
  return () => {
    if (soltado) {
      return
    }
    soltado = true
    soltar()
  }
}
