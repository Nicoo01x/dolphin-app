/**
 * Qué edición viene después de la que acabás de hacer.
 *
 * Es el cerebro del Tab predictivo, y a propósito no tiene modelo adentro. Lo que se siente como
 * magia en Cursor casi siempre es una sola cosa: cambiaste un nombre en un lado y faltan los otros
 * seis. Eso no hay que adivinarlo — se lee de la edición que la persona acaba de hacer, y la
 * respuesta sale en microsegundos en vez de en medio segundo, y nunca inventa.
 *
 * Lo que un modelo sí hace falta para resolver (cambiar la forma de una función y reescribir cada
 * llamada distinto, traducir un patrón a otro) queda afuera: esto reconoce renombres y nada más,
 * para no proponer basura con cara de certeza.
 */

/** Un cambio de texto tal como lo entrega el editor: qué tramo se reemplazó y por qué. */
export type CambioDeTexto = {
  /** Desplazamiento en caracteres donde arranca lo reemplazado. */
  desde: number
  /** Lo que había. */
  quitado: string
  /** Lo que quedó. */
  puesto: string
}

/** Un renombre reconocido: de esto salen los lugares que faltan tocar. */
export type Renombre = { viejo: string; nuevo: string }

/** Las letras que forman parte de un nombre en los lenguajes que nos importan. */
const LETRA_DE_NOMBRE = /[A-Za-z0-9_$]/

function esNombre(texto: string): boolean {
  return texto.length > 0 && [...texto].every((letra) => LETRA_DE_NOMBRE.test(letra))
}

/** Si el carácter que toca el borde del tramo es parte de un nombre, el tramo no era el nombre entero. */
function bordeLimpio(texto: string, desde: number, hasta: number): boolean {
  const antes = desde > 0 ? texto[desde - 1]! : ''
  const despues = hasta < texto.length ? texto[hasta]! : ''
  return !LETRA_DE_NOMBRE.test(antes) && !LETRA_DE_NOMBRE.test(despues)
}

/**
 * El renombre que describe este cambio, o null.
 *
 * Pide que las dos puntas sean nombres completos: reemplazar `usuario` por `cliente` es un
 * renombre; reemplazar `uar` adentro de `usuario` no lo es, aunque el texto coincida. Sin ese
 * recaudo, borrar dos letras en el medio de una palabra proponía cambios en todo el archivo.
 *
 * `textoPrevio` es el documento ANTES del cambio: hace falta para mirar qué hay pegado al tramo.
 */
export function renombreDelCambio(cambio: CambioDeTexto, textoPrevio: string): Renombre | null {
  const { desde, quitado, puesto } = cambio
  if (!esNombre(quitado) || !esNombre(puesto) || quitado === puesto) {
    return null
  }
  // Un nombre no empieza con un dígito; sin esto, cambiar `2` por `x` pasaba por renombre.
  if (/^[0-9]/.test(quitado) || /^[0-9]/.test(puesto)) {
    return null
  }
  return bordeLimpio(textoPrevio, desde, desde + quitado.length)
    ? { viejo: quitado, nuevo: puesto }
    : null
}

/** Un lugar que todavía dice el nombre viejo. */
export type SitioPendiente = { desde: number; hasta: number }

/**
 * Dónde más aparece el nombre viejo, como nombre entero.
 *
 * Mira texto plano a propósito: sin servidor de lenguaje no hay forma de saber si dos `usuario`
 * son el mismo símbolo, y pedirle al editor que lo resuelva costaría más de lo que vale. El precio
 * es que también encuentra el que está adentro de un comentario o de una cadena — y eso está bien,
 * porque la sugerencia se acepta de a una: la persona ve cada lugar antes de que cambie.
 */
export function sitiosDelNombre(
  texto: string,
  nombre: string,
  excluir?: SitioPendiente
): SitioPendiente[] {
  if (!esNombre(nombre)) {
    return []
  }
  const sitios: SitioPendiente[] = []
  let desde = texto.indexOf(nombre)
  while (desde !== -1) {
    const hasta = desde + nombre.length
    const propio = excluir && excluir.desde === desde && excluir.hasta === hasta
    if (!propio && bordeLimpio(texto, desde, hasta)) {
      sitios.push({ desde, hasta })
    }
    desde = texto.indexOf(nombre, desde + 1)
  }
  return sitios
}

/**
 * La cadena de ediciones que Tab va a ofrecer, en el orden en que se recorre.
 *
 * Desde donde está el cursor hacia abajo y después se da la vuelta: es el orden en que se lee un
 * archivo, y es el que hace que apretar Tab varias veces se sienta como ir bajando.
 */
export function proximasEdiciones(
  texto: string,
  renombre: Renombre,
  cursor: number
): SitioPendiente[] {
  const sitios = sitiosDelNombre(texto, renombre.viejo)
  const abajo = sitios.filter((sitio) => sitio.desde >= cursor)
  const arriba = sitios.filter((sitio) => sitio.desde < cursor)
  return [...abajo, ...arriba]
}
