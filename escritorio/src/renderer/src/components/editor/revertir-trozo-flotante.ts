import { translate } from '@/i18n/i18n'
import type { Hunk } from './bordes-de-git'

/**
 * El flotante del borde de git: qué decía git en ese trozo y el botón para devolverlo.
 *
 * DOM a mano y no React por lo mismo que el cuadrito de Cmd+K: vive adentro de Monaco como widget
 * de contenido y Monaco maneja su ciclo de vida. Es una confirmación de algo que pisa texto, así
 * que no se cierra arrastrándolo: se cierra con Escape, con un clic afuera o al seguir escribiendo.
 */

export type FlotanteDelTrozo = {
  readonly nodo: HTMLElement
  /** Lo dibuja para ese trozo; el foco queda en el botón, para revertir con Enter. */
  readonly mostrar: (hunk: Hunk) => void
  readonly enfocar: () => void
}

function tituloDe(hunk: Hunk): string {
  if (hunk.tipo === 'agregado') {
    return translate(
      'editor.gitHunk.addedTitle',
      "These lines are new: git doesn't have them. Reverting removes them."
    )
  }
  return hunk.tipo === 'borrado'
    ? translate('editor.gitHunk.deletedTitle', 'Deleted from here:')
    : translate('editor.gitHunk.changedTitle', 'Before this change:')
}

export function crearFlotanteDelTrozo(acciones: {
  readonly revertir: () => void
  readonly cerrar: () => void
}): FlotanteDelTrozo {
  const nodo = document.createElement('div')
  nodo.className = 'dolphin-trozo'
  nodo.setAttribute('role', 'dialog')
  nodo.setAttribute('aria-label', translate('editor.gitHunk.dialogLabel', 'Git change'))

  const titulo = document.createElement('p')
  titulo.className = 'dolphin-trozo-titulo'
  const original = document.createElement('pre')
  original.className = 'dolphin-trozo-original'

  const boton = document.createElement('button')
  boton.type = 'button'
  boton.className = 'dolphin-trozo-boton'
  boton.textContent = translate('editor.gitHunk.revert', 'Revert this change')
  boton.addEventListener('click', () => acciones.revertir())

  nodo.append(titulo, original, boton)
  nodo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      acciones.cerrar()
    }
  })
  // Que Monaco no tome el clic adentro del flotante como un clic en el texto (lo cerraría).
  nodo.addEventListener('mousedown', (evento) => evento.stopPropagation())

  return {
    nodo,
    mostrar: (hunk) => {
      titulo.textContent = tituloDe(hunk)
      original.textContent = hunk.original.join('\n')
      original.hidden = hunk.original.length === 0
      boton.setAttribute(
        'aria-label',
        translate('editor.gitHunk.revertAria', 'Revert the change at line {{line}}', {
          line: Math.max(1, hunk.desde)
        })
      )
    },
    enfocar: () => boton.focus()
  }
}
