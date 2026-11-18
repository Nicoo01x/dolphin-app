import type { AjustesDelProyecto } from '../../shared/editorconfig'

/** Lo que el editor le pide al proceso principal: editar con IA (Cmd+K) y la sangría del proyecto. */
export type EditorApi = {
  editor: {
    /**
     * Lo que el proyecto declara en su `.editorconfig` para ese archivo.
     *
     * Lo resuelve el proceso principal porque hay que recorrer carpetas hacia arriba, y el
     * renderer no tiene disco. Devuelve `{}` cuando el proyecto no dice nada: ahí el editor usa
     * lo suyo, en vez de un default escondido en dos lugares.
     */
    resolveEditorConfig: (args: {
      worktreePath: string
      filePath: string
    }) => Promise<AjustesDelProyecto>
    /**
     * Le avisa al proceso principal si el foco está en el editor de código, para que con el foco
     * ahí Ctrl+K sea la edición en el lugar y no un atajo global. Opcional: el cliente web no
     * tiene proceso principal que se quede con teclas.
     */
    avisarFocoDelEditorDeCodigo?: (enfocado: boolean) => void
    /**
     * Pide el reemplazo de un fragmento. `prompt` ya viene armado por el editor, que es el único
     * que sabe qué hay alrededor de la selección.
     */
    generateInlineEdit: (args: {
      worktreePath: string
      prompt: string
      worktreeId?: string
      repoId?: string
      connectionId?: string
      sourceControlAiResolvedParams?: unknown
      sourceControlAi?: unknown
      agentCmdOverrides?: Record<string, string>
    }) => Promise<
      | ({ success: true; agentLabel?: string; agentId?: string } & (
          | { tipo: 'edicion'; codigo: string }
          | { tipo: 'respuesta'; texto: string }
        ))
      | { success: false; error: string }
    >
  }
}
