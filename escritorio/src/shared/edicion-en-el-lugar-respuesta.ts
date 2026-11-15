/**
 * Leer lo que contestó el modelo cuando se edita con IA en el lugar (Cmd+K).
 *
 * Está en `shared` porque lo necesitan los dos lados: el proceso principal, que es el que recibe
 * la salida cruda del agente, y el editor, que es el que la escribe adentro del archivo.
 *
 * Es la pieza frágil de la función. Un modelo contesta lo que se le canta —a veces el código
 * pelado, a veces en una cerca con el nombre del lenguaje, a veces con «Acá tenés:» adelante y una
 * explicación atrás— y si uno escribe eso tal cual adentro del archivo, le mete texto en prosa en
 * medio del código.
 */

/** La cerca de un bloque de código: tres o más comillas invertidas, o tres o más virgulillas. */
const CERCA = /^([`~]{3,})[^\n`]*$/

/**
 * El código que trae una respuesta del modelo.
 *
 * Si hay bloques cercados, devuelve el de más líneas, y entre empatados el último: con «acá está
 * el cambio» + bloque + «¿querés que lo aplique?» el bloque es la respuesta, y cuando hay varios
 * los chicos suelen ser nombres de archivo o comandos sueltos, de una línea.
 *
 * Por líneas y no por caracteres: elegir el más largo en caracteres hacía ganar a `src/a.ts` —ocho
 * letras— contra dos líneas de código de siete. El último entre empatados porque el modelo pone la
 * explicación antes y el código al final.
 *
 * Si no hay ninguno, devuelve el texto entero recortado: un modelo que contesta sólo el código es
 * el caso bueno y no hay que castigarlo.
 *
 * La cerca de cierre tiene que ser al menos tan larga como la de apertura y del mismo carácter,
 * que es la regla de Markdown. Sin eso, un bloque que adentro tiene ``` (código que habla de
 * markdown, que en este repo es la mitad) se cortaba al medio.
 */
export function codigoDeLaRespuesta(respuesta: string): string {
  const lineas = respuesta.split('\n')
  const bloques: string[] = []
  let abierta: { marca: string; desde: number } | null = null
  for (const [indice, linea] of lineas.entries()) {
    const corte = CERCA.exec(linea.trim())
    if (!abierta) {
      if (corte) {
        abierta = { marca: corte[1]!, desde: indice + 1 }
      }
      continue
    }
    const cierre = linea.trim()
    const mismaMarca = cierre[0] === abierta.marca[0]
    if (
      corte &&
      mismaMarca &&
      cierre.length >= abierta.marca.length &&
      cierre === cierre[0]!.repeat(cierre.length)
    ) {
      bloques.push(lineas.slice(abierta.desde, indice).join('\n'))
      abierta = null
    }
  }
  if (bloques.length === 0) {
    return respuesta.trim()
  }
  const lineasDe = (bloque: string): number => bloque.split('\n').length
  return bloques.reduce((mayor, bloque) => (lineasDe(bloque) >= lineasDe(mayor) ? bloque : mayor))
}
