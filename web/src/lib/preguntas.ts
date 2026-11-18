/**
 * Las preguntas frecuentes, contestadas con lo que hace el código hoy (18/11/2026). La home muestra
 * las que tienen `enInicio`; /preguntas las muestra todas y las publica como FAQPage para los
 * buscadores. Si algo de esto deja de ser cierto en el código, se cambia acá.
 *
 * Formato de cada párrafo: `así` es código y [esto](/ruta) es un link (lo dibuja docs/Linea.tsx).
 */

export interface Pregunta {
  readonly p: string;
  readonly r: readonly string[];
  readonly enInicio?: boolean;
}

export const PREGUNTAS: readonly Pregunta[] = [
  {
    p: "¿Cuánto cuesta?",
    enInicio: true,
    r: [
      "Dolphin no cobra nada: es open source, con licencia MIT. Lo que gasta es tu agente, con tu suscripción de Claude Code o Codex (cupo) o con tu clave de API (plata).",
      "Antes de arrancar un equipo te muestra lo que va a costar cada tarea y espera tu «dale»; si el peor caso pasa el `tope` del proyecto, no arranca. El portón corre primero lo gratis y el latido de un bot no despierta al modelo si su chequeo no vio cambios.",
    ],
  },
  {
    p: "¿Cómo lo instalo?",
    enInicio: true,
    r: [
      "La app de escritorio tiene instalador para Windows, macOS (Apple Silicon e Intel) y Linux (AppImage, .deb y .rpm): están en [Descargar](/descargar), con lo que hay que tocar la primera vez porque todavía no están firmados.",
      "La terminal y la CLI se instalan desde el código: `git clone https://github.com/Nicoo01x/dolphin-app.git`, `npm install` y `npm link`, que deja el comando `dolphin` en el PATH. Hace falta Node 22.12 o más nuevo y git.",
    ],
  },
  {
    p: "¿Con qué cuentas corre?",
    r: [
      "Con las tuyas. Usa el CLI de Claude Code, Codex o Antigravity que ya tenés, con tu sesión iniciada: no hay cuenta de Dolphin. Si tenés varias cuentas de Claude y una se queda sin cupo, pasa sola a la siguiente.",
      "Los bots piensan con el mismo CLI de Claude Code o de Codex. No hace falta una clave de API aparte.",
    ],
  },
  {
    p: "¿Cómo reparto el trabajo entre varios agentes?",
    enInicio: true,
    r: [
      "Pedíselo en el chat: «delegá las tareas», «pasale esto a Codex», «hacelo en paralelo». La skill `dolphin-delegar` viene instalada con la app y le enseña al agente a repartir el trabajo en agentes de Dolphin —Claude, Codex u otro— en vez de en subagentes que no se ven.",
      "Cada uno trabaja en su propio espacio y en su rama, y lo ves trabajar dentro de Dolphin: su terminal, lo que va haciendo y lo que entrega.",
    ],
  },
  {
    p: "¿Puedo hacerlo trabajar en mi propio servidor?",
    enInicio: true,
    r: [
      "Sí, en cualquier VPS Linux al que llegues por SSH. Desde la app es «Conectar una máquina»; desde la terminal, `dolphin host add`, `dolphin host connect` y `dolphin host doctor`, que prueba la conexión y te dice qué falta.",
      "Si algo no conecta, abrí un chat de Claude en Dolphin y pedile «necesito tener esto trabajando en mi VPS»: trae la guía para diagnosticarlo y arreglarlo, y lo que sólo podés hacer vos (iniciar una sesión, dar un permiso) te lo deja escrito con el comando para copiar.",
    ],
  },
  {
    p: "¿Qué son los Delfines?",
    r: [
      "Tus bots, dentro de la app: agentes con una rutina (revisar el repo cada mañana, resumir lo que pasó, escribir un borrador) y un tope de gasto por mes. Ves cuál corre, cuándo le toca, cuánto gastó y qué dijo la última vez, y les podés hablar.",
      "«Correr en tu servidor» lo lleva a tu VPS como un servicio que sigue andando con tu compu apagada. Antes de tocar nada revisa que el servidor tenga lo necesario y, si falta algo, te lo dice.",
    ],
  },
  {
    p: "¿Manda datos afuera?",
    enInicio: true,
    r: [
      "Lo que sale de tu máquina para trabajar es lo que tus CLIs le mandan a su proveedor (Anthropic, OpenAI…), y Telegram si conectás un bot. La consola escucha sólo en 127.0.0.1 y el núcleo no tiene telemetría.",
      "La app de escritorio, si se cierra de golpe, te ofrece mandar un reporte del crash: sale sólo si aceptás, va al servidor de Dolphin y no a un tercero. Lo mismo con «Enviar comentarios» del menú de Ayuda. Qué lleva cada uno está en [Privacidad](/privacidad).",
    ],
  },
  {
    p: "¿Se actualiza solo?",
    r: [
      "En Windows y Linux sí: cuando sale una versión nueva, la app la baja y te avisa para reiniciar. En macOS te avisa y te lleva a descargarla, porque macOS sólo deja actualizarse solas a las apps firmadas.",
      "Lo que cambió en cada versión está en [Novedades](/novedades).",
    ],
  },
  {
    p: "¿Qué pasa si a mi compu le queda poca memoria?",
    r: [
      "La app lo nota antes de que se cuelgue: te avisa con cuánta RAM libre queda y te ofrece mandar el espacio de trabajo más pesado a tu servidor. Mientras está en modo poca RAM, los chats quietos se duermen antes.",
      "Se maneja en Ajustes → General → Memoria: automático, siempre prendido o apagado, y desde cuántos GB libres avisa.",
    ],
  },
  {
    p: "¿Anda en Windows, macOS y Linux?",
    r: [
      "Sí. El núcleo necesita Node 22.12 y git. Los avisos del sistema salen en los tres y los atajos corren con PowerShell en Windows y con sh en el resto.",
      "X-ray es sólo de Windows, porque lee la accesibilidad del sistema. La app de escritorio tiene instalador para los tres.",
    ],
  },
  {
    p: "¿Necesito la app de escritorio?",
    r: [
      "No. La terminal, la consola y la CLI son el mismo Dolphin. La app suma el editor, el chat sobre el CLI de cada agente, los Delfines y todos los espacios de trabajo a la vista, cada uno en su rama.",
      "Lo que Dolphin agrega después de que el agente escribe está en los dos lados: el portón que prueba cada rama, la memoria que se vuelve chequeos, el líder que parte y estima, el turno de noche y los bots.",
    ],
  },
  {
    p: "¿Con qué lenguajes trabaja?",
    r: [
      "Con cualquiera que tu agente sepa escribir. La primera vez en un repo detecta Node, Python, Go o Rust y propone cómo se instala y cómo se prueba. Los scripts de npm entran solos al portón; pytest, go test o cargo test se suman en `porton.comandos`.",
    ],
  },
  {
    p: "¿Puede romperme algo?",
    r: [
      "Nada se escribe en tu rama directo: cada agente trabaja en su propio worktree y vos decidís qué entra. Lo que corre solo no deploya, no toca migraciones ni empuja nada, y si una rama toca lo que el repo ejecuta solo (`.claude/`, `.mcp.json`, hooks) se corta en la primera fase.",
      "Si algo se cortó a mitad de camino, `dolphin doctor` encuentra lo que quedó colgado y lo limpia.",
    ],
  },
  {
    p: "¿En qué se diferencia de usar Claude Code o Codex solos?",
    r: [
      "Dolphin no reemplaza a tu agente: lo usa. Lo que suma es lo de alrededor: varios agentes a la vez sin pisarse (cada uno en su worktree), un portón que prueba cada rama antes de que toque la tuya, la memoria que convierte lo que les corregís en chequeos, y una app donde los ves trabajar a todos.",
    ],
  },
];

/** Una respuesta sin el marcado de Linea, para el JSON-LD: los buscadores leen texto plano. */
export function respuestaEnTexto(pregunta: Pregunta): string {
  return pregunta.r
    .map((parrafo) => parrafo.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1"))
    .join("\n\n");
}
