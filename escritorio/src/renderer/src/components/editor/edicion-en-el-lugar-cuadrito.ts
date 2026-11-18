import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { translate } from '@/i18n/i18n'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { EstadoEdicion } from './edicion-en-el-lugar-estado'
import type { Tramo } from './edicion-en-el-lugar'
import { CuerpoDelCuadrito, type VistaDelCuadrito } from './CuerpoDelCuadrito'
import { diffDeLaPropuesta } from './diff-de-la-propuesta'
import { dejarQueElCuadritoScrollee } from './rueda-del-cuadrito'
import './cuadrito-de-edicion.css'

/**
 * El cuadrito de Cmd+K: lo único de esta función que la persona ve.
 *
 * El campo se arma con DOM a mano y no con React porque vive adentro de Monaco, como un widget de
 * contenido anclado a una línea, y el foco de ese campo tiene reglas de tiempo con el editor (ver
 * `enfocarElCuadrito` en el cableado) que conviene no esconder detrás de un render. Lo de abajo —la
 * respuesta en markdown, el diff, los botones— sí es React (`CuerpoDelCuadrito`), montado en un
 * nodo propio. Se dibuja cuando React quiera y no a la fuerza: `dibujar` se llama también desde
 * eventos del editor que caen en medio de un render, y ahí forzarlo falla. Que el cuadrito cambie
 * de alto después lo atiende el cableado, que le avisa a Monaco cada vez que el nodo cambia de
 * tamaño.
 *
 * No se arrastra para cerrarse. La regla de las ventanas que se descartan arrastrándolas es para
 * superficies que flotan sobre la pantalla; esto está clavado a una línea de código y moverlo de
 * ahí no querría decir nada. Se cierra con Escape, que es lo que el editor ya enseñó a usar.
 */

export type AccionesDelCuadrito = {
  enviar: (instruccion: string) => void
  aceptar: () => void
  descartar: () => void
  reintentar: () => void
}

/** Lo que el cuadrito necesita del documento para mostrar el cambio tal como va a quedar. */
export type DocumentoDelCuadrito = {
  ruta: string
  /** El fragmento de ahora, el que quedaría, y la línea del archivo donde empieza. */
  vistaPrevia: (
    tramo: Tramo,
    codigo: string
  ) => {
    antes: string
    despues: string
    primeraLinea: number
  }
}

export type Cuadrito = {
  nodo: HTMLElement
  /** Vuelve a dibujar para este estado y devuelve si el cuadrito tiene que estar a la vista. */
  dibujar: (estado: EstadoEdicion) => boolean
  /** Le pasa el foco al campo y devuelve si lo tomó (un nodo que Monaco todavía no mostró, no). */
  enfocar: () => boolean
  /** Desmonta lo de React. El nodo deja de servir. */
  desmontar: () => void
}

const ES_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

function textos() {
  return {
    marcador: translate(
      'editor.inlineEdit.placeholder',
      'Ask for an edit or a question…  (Enter to send, Esc to close)'
    ),
    seguir: translate('editor.inlineEdit.followUpPlaceholder', 'Keep asking, or ask for an edit…'),
    esperando: translate('editor.inlineEdit.working', 'Working…')
  }
}

function vistaDe(
  estado: EstadoEdicion,
  documento: DocumentoDelCuadrito,
  desde: number
): VistaDelCuadrito {
  switch (estado.fase) {
    case 'esperando':
      return { fase: 'esperando', desde }
    case 'respuesta':
      return {
        fase: 'respuesta',
        pedido: estado.instruccion,
        texto: estado.texto,
        agente: estado.agente
      }
    case 'propuesta':
      return {
        fase: 'propuesta',
        pedido: estado.instruccion,
        agente: estado.agente,
        diff: diffDeLaPropuesta({
          ruta: documento.ruta,
          ...documento.vistaPrevia(estado.tramo, estado.codigo)
        })
      }
    case 'fallo':
      return { fase: 'fallo', motivo: estado.motivo }
    default:
      return { fase: estado.fase }
  }
}

export function crearCuadrito(
  acciones: AccionesDelCuadrito,
  documento: DocumentoDelCuadrito
): Cuadrito {
  const TEXTO = textos()
  const nodo = document.createElement('div')
  nodo.className = 'dolphin-cmdk'
  nodo.setAttribute('role', 'dialog')
  nodo.setAttribute('aria-label', TEXTO.marcador)

  const entrada = document.createElement('input')
  entrada.type = 'text'
  entrada.className = 'dolphin-cmdk-entrada'
  entrada.placeholder = TEXTO.marcador
  entrada.setAttribute('aria-label', TEXTO.marcador)
  nodo.appendChild(entrada)

  // Para el lector de pantalla: «trabajando» mientras se espera. Lo que se ve lo pone el cuerpo.
  const anuncio = document.createElement('p')
  anuncio.className = 'sr-only'
  anuncio.setAttribute('role', 'status')
  nodo.appendChild(anuncio)

  const cuerpo = document.createElement('div')
  cuerpo.className = 'dolphin-cmdk-cuerpo'
  nodo.appendChild(cuerpo)
  const raiz = createRoot(cuerpo)
  let fase: EstadoEdicion['fase'] = 'cerrado'
  let desde = Date.now()
  let ultimoPedido = ''

  const accionesDelCuerpo = {
    aceptar: () => acciones.aceptar(),
    cerrar: () => acciones.descartar(),
    reintentar: () => acciones.reintentar()
  }

  // El teclado se maneja acá y no con comandos de Monaco: mientras el cuadrito tiene el foco, el
  // editor no está recibiendo estas teclas. Escape y Ctrl+Enter valen desde cualquier lugar del
  // cuadrito —el campo, un botón, la respuesta— y no siguen viaje: son del cuadrito, no del código.
  nodo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      evento.stopPropagation()
      acciones.descartar()
      return
    }
    if (evento.key === 'Enter' && (ES_MAC ? evento.metaKey : evento.ctrlKey)) {
      evento.preventDefault()
      evento.stopPropagation()
      acciones.aceptar()
    }
  })
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' || evento.ctrlKey || evento.metaKey) {
      return
    }
    // El Enter que confirma un candidato de un IME chino, japonés o coreano llega como un keydown
    // más. Mandarlo ahí es mandar el pedido a medio convertir.
    if (isImeOwnedKeyboardEvent(evento)) {
      return
    }
    evento.preventDefault()
    ultimoPedido = entrada.value
    acciones.enviar(entrada.value)
  })
  dejarQueElCuadritoScrollee(nodo)

  const dibujar = (estado: EstadoEdicion): boolean => {
    const venia = fase
    fase = estado.fase
    if (fase === 'esperando' && venia !== 'esperando') {
      desde = Date.now()
    }
    const esperando = fase === 'esperando'
    const conversando = fase === 'respuesta' || fase === 'propuesta'
    entrada.disabled = esperando
    entrada.placeholder = conversando ? TEXTO.seguir : TEXTO.marcador
    anuncio.textContent = esperando ? TEXTO.esperando : ''
    nodo.dataset.fase = fase
    // Llegó algo: el campo queda vacío para seguir preguntando, y lo que se pidió pasa al
    // encabezado de la respuesta. En una falla se conserva, para corregirlo y volver a mandarlo.
    if (conversando && venia === 'esperando' && entrada.value === ultimoPedido) {
      entrada.value = ''
    }
    if (fase === 'cerrado') {
      entrada.value = ''
    }
    raiz.render(
      createElement(CuerpoDelCuadrito, {
        vista: vistaDe(estado, documento, desde),
        acciones: accionesDelCuerpo
      })
    )
    // Mientras se esperaba el campo estuvo deshabilitado y el foco se cayó: vuelve al campo, que
    // es desde donde se sigue (escribir, Ctrl+Enter, Escape).
    if (venia === 'esperando' && !esperando && fase !== 'cerrado') {
      entrada.focus()
    }
    return fase !== 'cerrado'
  }

  dibujar({ fase: 'cerrado' })

  const enfocar = (): boolean => {
    entrada.focus()
    return entrada.ownerDocument.activeElement === entrada
  }

  // Desmontar mientras React está dibujando (el editor se cierra adentro de un render) avisa y no
  // desmonta: se deja para el próximo turno.
  const desmontar = (): void => {
    queueMicrotask(() => raiz.unmount())
  }

  return { nodo, dibujar, enfocar, desmontar }
}
