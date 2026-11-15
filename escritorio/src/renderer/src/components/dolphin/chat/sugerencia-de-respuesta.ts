import { translate } from '@/i18n/i18n'

/**
 * Lo que vas a contestar, escrito antes de que lo escribas: una sugerencia tenue en el compositor
 * que se acepta con Tab (Nico, 01/11: «si tocás tab se escribe, o sea dale, arrancalo»).
 *
 * Sale de REGLAS sobre lo último que dijo el agente, no de un modelo: la sugerencia tiene que
 * estar ahí en el momento en que terminás de leer, y una que cuesta plata y tarda dos segundos no
 * sirve para eso. Son las cuatro cosas que uno contesta el 90 % de las veces.
 *
 * Solo aparece cuando el agente **está esperando algo tuyo**. Sugerir siempre sería ruido sobre el
 * campo vacío, y un campo con texto nunca la muestra: lo que estás escribiendo manda.
 */

export type MotivoDeSugerencia =
  /** Preguntó algo, o pidió permiso: las dos cosas se contestan igual. */
  | 'pregunta'
  /** Contó lo que va a hacer y espera la orden. */
  | 'plan'
  /** Terminó y dejó una rama o un cambio para mirar. */
  | 'termino'
  /** Se cortó o falló. */
  | 'fallo'

export type SugerenciaDeRespuesta = {
  /** Lo que se escribe al tocar Tab. */
  readonly texto: string
  readonly motivo: MotivoDeSugerencia
}

/** El final del mensaje es lo que importa: un texto largo pregunta al final, no en el medio. */
const FINAL = 400

/**
 * Un límite de palabra que sirve en castellano.
 *
 * `\b` de JavaScript cuenta letras como `[A-Za-z0-9_]`, así que una palabra con tilde queda
 * partida: en «dejé», la «é» no es letra para el motor y `\bdejé\b` no matchea NUNCA. Con eso,
 * casi todas estas reglas estaban muertas y solo andaban las inglesas. Se arma con `\p{L}` y la
 * bandera `u`, que sí sabe de tildes y de eñes.
 */
const palabra = (alternativas: string) =>
  new RegExp(`(?<!\\p{L})(?:${alternativas})(?!\\p{L})`, 'iu')

const PLAN = palabra(
  "el plan|mi plan|voy a (hacer|empezar|arrancar)|propongo|la propuesta|here'?s the plan|i'?ll start"
)

/**
 * Contó lo que va a hacer. Se exporta porque la propuesta de delegación pregunta lo mismo, pero
 * sobre el mensaje entero: un plan se anuncia arriba y la lista viene abajo. Con dos listas de
 * palabras, una queda vieja.
 */
export function anunciaUnPlan(texto: string): boolean {
  return PLAN.test(texto)
}

/**
 * Las reglas, en orden: la primera que coincide gana, de lo más específico a lo más general.
 */
const REGLAS: readonly { readonly motivo: MotivoDeSugerencia; readonly cuando: RegExp }[] = [
  { motivo: 'plan', cuando: PLAN },
  {
    motivo: 'fallo',
    cuando: palabra("no (pude|salió|funcionó)|falló|se cortó|error|failed|couldn'?t|unable to")
  },
  {
    motivo: 'termino',
    cuando: palabra('list[oa]|termin[éeó]|quedó|dejé|ya está|rama|branch|done|finished|ready')
  },
  {
    motivo: 'pregunta',
    cuando: palabra(
      'te parece|lo (hago|arreglo|cambio|saco|dejo)|sigo|avanzo|continúo|continuo|puedo (seguir|avanzar|hacerlo)|necesito tu (ok|aprobación)|esperando tu (ok|visto)|may i|should i|want me to|shall i'
    )
  }
]

/** Una pregunta de verdad: termina preguntando. */
const PREGUNTA = /[?¿][^?]{0,80}$/

/**
 * Qué conviene contestarle al agente, si conviene contestar algo.
 *
 * `trabajando`: mientras el agente escribe no se sugiere nada. Lo que uno quiere ahí es leer, y
 * una sugerencia que cambia sola bajo el cursor mientras llega texto es un parpadeo, no una ayuda.
 */
export function sugerenciaDeRespuesta(
  ultimoDelAgente: string | null | undefined,
  {
    trabajando = false,
    borrador = ''
  }: { readonly trabajando?: boolean; readonly borrador?: string } = {}
): SugerenciaDeRespuesta | null {
  if (trabajando || borrador.trim() !== '') {
    return null
  }
  const texto = (ultimoDelAgente ?? '').trim()
  if (texto === '') {
    return null
  }
  const final = texto.slice(-FINAL)
  const motivo =
    REGLAS.find((r) => r.cuando.test(final))?.motivo ?? (PREGUNTA.test(final) ? 'pregunta' : null)
  return motivo ? { texto: queSeContesta(motivo), motivo } : null
}

/** Lo que se escribe, en las palabras de la casa. */
function queSeContesta(motivo: MotivoDeSugerencia): string {
  switch (motivo) {
    case 'pregunta':
      return translate('components.dolphin.chat.sugerencia.dale', 'go ahead')
    case 'plan':
      return translate('components.dolphin.chat.sugerencia.arrancalo', 'start it')
    case 'termino':
      return translate('components.dolphin.chat.sugerencia.mostrame', 'show me what you changed')
    case 'fallo':
      return translate('components.dolphin.chat.sugerencia.contame', 'tell me what happened')
  }
}

/** Cómo se lee en el compositor: la sugerencia y con qué se acepta. */
export function comoSeOfrece(sugerencia: SugerenciaDeRespuesta): string {
  return translate('components.dolphin.chat.sugerencia.conTab', '{texto}   ⇥ Tab').replace(
    '{texto}',
    sugerencia.texto
  )
}
