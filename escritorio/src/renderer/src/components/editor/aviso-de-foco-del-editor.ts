/**
 * Junta el foco de todos los editores de código abiertos en un solo «¿hay alguno enfocado?» para
 * el proceso principal, que con eso decide si Ctrl+K es de Monaco o de la paleta de worktrees.
 *
 * No alcanza con mandar lo que dice cada editor: Monaco avisa que un editor perdió el foco un
 * tick después de que el otro lo ganó, así que pasar de un split al otro llegaría como «sí» y
 * después «no», y el proceso principal se quedaría con el «no» teniendo un editor enfocado.
 */
export function crearAvisoDeFoco(enviar: (hayEditorEnfocado: boolean) => void): {
  marcar: (idDelEditor: string, enfocado: boolean) => void
} {
  const enfocados = new Set<string>()
  let ultimoEnviado: boolean | null = null
  return {
    marcar: (idDelEditor, enfocado) => {
      if (enfocado) {
        enfocados.add(idDelEditor)
      } else {
        enfocados.delete(idDelEditor)
      }
      const hay = enfocados.size > 0
      if (hay !== ultimoEnviado) {
        ultimoEnviado = hay
        enviar(hay)
      }
    }
  }
}

/** El de la app: uno solo para todos los editores de esta ventana. */
export const avisoDeFocoDelEditor = crearAvisoDeFoco((hay) =>
  window.api?.editor?.avisarFocoDelEditorDeCodigo?.(hay)
)
