import type { AgentType } from './agent-status/contracts/agent-status-types'
import { getAgentSessionOptionCatalog } from './agent-session/options/agent-session-option-catalog'
import type { SessionOptionSelectChoice } from './native-chat/input/native-chat-session-options'

/**
 * Los carteles de función: lo que Dolphin sabe hacer, contado con un video, ahí donde la persona
 * está trabajando.
 *
 * El problema que resuelven: Dolphin puede partir una tarea y repartirla entre varias terminales,
 * y nadie prende lo que no sabe que existe. Estando en el chat de Claude, el cartel lo cuenta con
 * el video de la función trabajando —«Claude, quiero delegar tareas»— y ahí mismo la persona elige
 * con qué modelo quiere que dirija.
 *
 * Son DATOS, no pantalla: los lee el cartel de la app y el mismo catálogo nombra los clips que la
 * web publica (el id del clip es el mismo en los tres lados). Por eso vive en `shared`.
 *
 * Por qué cuelgan del chat del motor y no de los parámetros de Dolphin: los parámetros de Dolphin
 * no tienen pantalla. Las filas de parámetros viven solo en el compositor del chat nativo, y
 * Dolphin no está en `NATIVE_CHAT_SUPPORTED_AGENT_LIST` —no tiene sesión estructurada, y el «+» lo
 * ofrece solo como terminal—, así que un cartel colgado de la opción `lider` no se podía abrir
 * nunca. Donde la función se ofrece es donde la persona ya está: el chat de su motor.
 *
 * Lo que NO hace un cartel: inventar una opción. Lo que ofrece sale del catálogo de Dolphin
 * (`agent-session-option-catalog-dolphin`), que es lo que su CLI toma de verdad, y el comando que
 * aplica la elección lo arma ese mismo catálogo.
 */
export type CartelDeFuncion = {
  /** Identifica el cartel y nombra sus archivos de video. */
  id: string
  /**
   * El chat donde se ofrece, que es además el `--agente` con el que Dolphin abre: delegar desde el
   * chat de Claude es delegar con Claude.
   */
  motor: AgentType
  /** Lo que la persona le pediría al motor, en sus palabras. Se lee después de su nombre. */
  pedido: string
  /** Qué pasa cuando elige, en una línea. */
  que: string
  /** Lo que muestra el clip, para quien no lo puede ver (y para el buscador de la web). */
  queSeVe: string
  /** El id de la `<Composition>` de branding/videos/carteles, y el nombre de sus archivos. */
  clip: string
  /**
   * El mismo clip cortado para un panel casi cuadrado, el del aviso de función.
   *
   * Por qué dos y no uno estirado: el panel mide ~1,28 de ancho por alto y el clip ancho es 16:9.
   * Con `contain` quedaba media tarjeta vacía y con `cover` se recortaban las terminales de los
   * costados, que son justo lo que hay que ver.
   */
  clipDelPanel: string
  /** La opción de Dolphin que se elige adentro del cartel: de ahí salen los botones. */
  opcion: string
}

export const CARTELES_DE_FUNCION: readonly CartelDeFuncion[] = [
  {
    // Por qué solo en el chat de Claude: `/lider` toma nombres de modelos de Claude, y el catálogo
    // de Dolphin cuelga la opción `lider` únicamente del motor `claude`. En el chat de otro motor
    // este cartel ofrecería un modelo que ese motor no tiene.
    id: 'delegacion',
    motor: 'claude',
    pedido: 'quiero delegar tareas',
    que: 'Escribís una tarea, el líder la parte, y cada pedazo abre su terminal.',
    queSeVe:
      'Una tarea escrita en el chat de Dolphin se parte en tres, y tres terminales se abren solas y la hacen a la vez.',
    clip: 'delegacion',
    clipDelPanel: 'delegacion-panel',
    opcion: 'lider'
  },
  {
    // Por qué en el chat de Codex y no en el de Claude: `mode` cuelga de los cuatro motores del
    // catálogo, así que el cartel podía ir en cualquiera. En el de Claude ya está el de delegación
    // y se pisarían; colgado de Codex, la función se cuenta donde hoy no se cuenta nada.
    id: 'permisos',
    motor: 'codex',
    pedido: 'quiero decidir si me pregunta antes de tocar',
    que: 'Elegís si los agentes paran a pedirte permiso o siguen de largo.',
    queSeVe:
      'La misma tarea corrida de los dos modos a la vez: a la izquierda el agente se frena y pregunta antes de editar, y a la derecha termina los cuatro archivos sin preguntar.',
    clip: 'permisos',
    clipDelPanel: 'permisos-panel',
    opcion: 'mode'
  }
]

/** Los carteles que se ofrecen en el chat de ese motor. */
export function cartelesDeFuncionDe(agente: AgentType | undefined): readonly CartelDeFuncion[] {
  return agente ? CARTELES_DE_FUNCION.filter((cartel) => cartel.motor === agente) : []
}

/** La opción de Dolphin que el cartel explica, tal como la declara el catálogo. */
function opcionDelCartel(cartel: CartelDeFuncion) {
  return getAgentSessionOptionCatalog('dolphin')
    ?.models.find((modelo) => modelo.id === cartel.motor)
    ?.options.find((opcion) => opcion.id === cartel.opcion)
}

/** Lo que el cartel ofrece elegir. Vacío si el catálogo dejó de declarar esa opción. */
export function eleccionesDelCartel(cartel: CartelDeFuncion): readonly SessionOptionSelectChoice[] {
  const opcion = opcionDelCartel(cartel)
  return opcion?.kind.type === 'select' ? opcion.kind.choices : []
}

/** El valor que viene marcado cuando el cartel se abre, o null si la opción no declara uno. */
export function eleccionPorDefecto(cartel: CartelDeFuncion): string | null {
  const opcion = opcionDelCartel(cartel)
  return opcion?.kind.type === 'select' ? opcion.kind.defaultValue : null
}

/** Lo que hay que hacer para abrir la función con esa elección. */
export type AperturaDelCartel = {
  /** Las banderas de apertura de Dolphin: el motor con el que escriben sus agentes. */
  agentArgs: readonly string[]
  /** El comando que aplica la elección una vez adentro de la sesión, o null si no hace falta. */
  comando: string | null
}

/**
 * Cómo se abre la función: el catálogo de Dolphin arma las dos partes.
 *
 * Por qué sale del catálogo y no está escrito acá: `--agente` y `/lider` son lo que el CLI toma de
 * verdad, y ya están declarados con su `launchArgs` y su `midSession`. Copiarlos sería tener dos
 * fuentes: el día que el CLI cambie una, el cartel seguiría abriendo con la vieja y la pestaña se
 * moriría con «Unknown option» antes de pintar nada.
 */
export function aperturaDelCartel(
  cartel: CartelDeFuncion,
  valor: string
): AperturaDelCartel | null {
  const catalogo = getAgentSessionOptionCatalog('dolphin')
  const opcion = opcionDelCartel(cartel)
  if (!catalogo || !opcion) {
    return null
  }
  const midSession = opcion.apply.midSession
  return {
    agentArgs: catalogo.modelApply.launchArgs?.(cartel.motor) ?? [],
    comando: midSession?.kind === 'command' ? midSession.build(valor) : null
  }
}

/** El video del clip, relativo a la base de `resources/carteles` (y a `/docs/videos` en la web). */
export function videoDelCartel(cartel: CartelDeFuncion): string {
  return `${cartel.clip}.mp4`
}

/** El cuadro que se ve antes de que el clip arranque, y el único que se ve sin movimiento. */
export function posterDelCartel(cartel: CartelDeFuncion): string {
  return `${cartel.clip}.poster.jpg`
}

/** El video para el panel del aviso de función, con su proporción. */
export function videoDelPanel(cartel: CartelDeFuncion): string {
  return `${cartel.clipDelPanel}.mp4`
}

export function posterDelPanel(cartel: CartelDeFuncion): string {
  return `${cartel.clipDelPanel}.poster.jpg`
}

/** «Claude, quiero delegar tareas»: el pedido dicho por su dueño. */
export function tituloDelCartel(cartel: CartelDeFuncion, nombreDelMotor: string): string {
  return `${nombreDelMotor}, ${cartel.pedido}`
}
