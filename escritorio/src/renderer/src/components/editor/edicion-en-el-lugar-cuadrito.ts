import { translate } from '@/i18n/i18n'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { EstadoEdicion } from './edicion-en-el-lugar-estado'

/**
 * El cuadrito de Cmd+K: lo único de esta función que la persona ve.
 *
 * Se arma con DOM a mano y no con React porque vive adentro de Monaco, como un widget de
 * contenido anclado a una línea. Un árbol de React montado ahí pelea con el ciclo de vida del
 * editor —Monaco mueve y descarta sus widgets por su cuenta— y ya hay un precedente en este repo
 * de un panel que se veía perfecto y no respondía a ningún botón por eso mismo.
 *
 * No se arrastra para cerrarse. La regla de las ventanas que se descartan arrastrándolas es para
 * superficies que flotan sobre la pantalla; esto está clavado a una línea de código y moverlo de
 * ahí no querría decir nada. Se cierra con Escape, que es lo que el editor ya enseñó a usar.
 */

export type AccionesDelCuadrito = {
  enviar: (instruccion: string) => void
  aceptar: () => void
  descartar: () => void
  reintentar: (instruccion: string) => void
}

export type Cuadrito = {
  nodo: HTMLElement
  /** Vuelve a dibujar para este estado y devuelve si el cuadrito tiene que estar a la vista. */
  dibujar: (estado: EstadoEdicion) => boolean
  /** Le pasa el foco al campo y devuelve si lo tomó (un nodo que Monaco todavía no mostró, no). */
  enfocar: () => boolean
}

function textos() {
  return {
    marcador: translate(
      'editor.inlineEdit.placeholder',
      'Describe the edit…  (Enter to send, Esc to cancel)'
    ),
    esperando: translate('editor.inlineEdit.working', 'Working…'),
    aceptar: translate('editor.inlineEdit.accept', 'Accept'),
    descartar: translate('editor.inlineEdit.discard', 'Discard'),
    reintentar: translate('editor.inlineEdit.tryAgain', 'Try again')
  }
}

function boton(etiqueta: string, alHacerClic: () => void): HTMLButtonElement {
  const elemento = document.createElement('button')
  elemento.type = 'button'
  elemento.className = 'dolphin-cmdk-boton'
  elemento.textContent = etiqueta
  elemento.addEventListener('click', alHacerClic)
  return elemento
}

export function crearCuadrito(acciones: AccionesDelCuadrito): Cuadrito {
  const TEXTO = textos()
  const nodo = document.createElement('div')
  nodo.className = 'dolphin-cmdk'

  const entrada = document.createElement('input')
  entrada.type = 'text'
  entrada.className = 'dolphin-cmdk-entrada'
  entrada.placeholder = TEXTO.marcador
  entrada.setAttribute('aria-label', TEXTO.marcador)
  nodo.appendChild(entrada)

  const estadoTexto = document.createElement('p')
  estadoTexto.className = 'dolphin-cmdk-estado'
  estadoTexto.setAttribute('role', 'status')
  nodo.appendChild(estadoTexto)

  const previa = document.createElement('pre')
  previa.className = 'dolphin-cmdk-previa'
  nodo.appendChild(previa)

  const barra = document.createElement('div')
  barra.className = 'dolphin-cmdk-barra'
  const aceptar = boton(TEXTO.aceptar, () => acciones.aceptar())
  const descartar = boton(TEXTO.descartar, () => acciones.descartar())
  const reintentar = boton(TEXTO.reintentar, () => acciones.reintentar(entrada.value))
  barra.append(aceptar, descartar, reintentar)
  nodo.appendChild(barra)

  // El teclado se maneja acá y no con comandos de Monaco: mientras el cuadrito tiene el foco, el
  // editor no está recibiendo estas teclas.
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      // El Enter que confirma un candidato de un IME chino, japonés o coreano llega como un
      // keydown más. Mandarlo ahí es mandar el pedido a medio convertir.
      if (isImeOwnedKeyboardEvent(evento)) {
        return
      }
      evento.preventDefault()
      acciones.enviar(entrada.value)
      return
    }
    if (evento.key === 'Escape') {
      evento.preventDefault()
      acciones.descartar()
    }
  })

  const dibujar = (estado: EstadoEdicion): boolean => {
    const esperando = estado.fase === 'esperando'
    const propuesta = estado.fase === 'propuesta'
    const fallo = estado.fase === 'fallo'
    entrada.disabled = esperando
    estadoTexto.textContent = esperando ? TEXTO.esperando : fallo ? estado.motivo : ''
    estadoTexto.classList.toggle('es-falla', fallo)
    estadoTexto.hidden = !esperando && !fallo
    previa.textContent = propuesta ? estado.codigo : ''
    previa.hidden = !propuesta
    aceptar.hidden = !propuesta
    descartar.hidden = !propuesta
    reintentar.hidden = !fallo
    barra.hidden = !propuesta && !fallo
    if (estado.fase === 'cerrado') {
      entrada.value = ''
    }
    return estado.fase !== 'cerrado'
  }

  dibujar({ fase: 'cerrado' })

  const enfocar = (): boolean => {
    entrada.focus()
    return entrada.ownerDocument.activeElement === entrada
  }

  return { nodo, dibujar, enfocar }
}
