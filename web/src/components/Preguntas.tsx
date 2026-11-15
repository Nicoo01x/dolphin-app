import { Linea } from "./docs/Linea";

/**
 * Las preguntas de siempre, contestadas con lo que hace el código hoy (28/10/2026). La telemetría,
 * en particular, se miró en src/, ui/ y escritorio/src/main/telemetry: si eso cambia, cambia esto.
 */
const PREGUNTAS: readonly { readonly p: string; readonly r: readonly string[] }[] = [
  {
    p: "¿Cuánto gasta?",
    r: [
      "Dolphin no cobra nada: es open source. Lo que gasta es tu agente, con tu suscripción de Claude Code o Codex (cupo) o con tu clave de API (plata).",
      "Antes de arrancar un equipo te muestra lo que va a costar cada tarea y espera tu «dale»; si el peor caso pasa el `tope` del proyecto, no arranca. El portón corre primero lo gratis, Guardian vigila a cero tokens, el latido de un bot no despierta al modelo si su chequeo no vio cambios y la demo no gasta nada.",
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
    p: "¿Manda datos afuera?",
    r: [
      "El núcleo (la terminal, la consola y los bots) no tiene telemetría: no le habla a ningún servicio de Dolphin. Lo que sale de tu máquina es lo que tus CLIs le mandan a su proveedor para trabajar, y Telegram si lo conectás. La consola escucha solo en 127.0.0.1.",
      "La app de escritorio trae un cliente de telemetría que solo transmite si el build lleva una clave puesta al compilar. Los builds de Dolphin no la llevan, y con `DO_NOT_TRACK=1` queda apagado igual.",
    ],
  },
  {
    p: "¿Anda en Windows, macOS y Linux?",
    r: [
      "El núcleo sí: necesita Node 22.12 y git. Los avisos del sistema salen en los tres y los atajos corren con PowerShell en Windows y con sh en el resto.",
      "X-ray es solo de Windows, porque lee la accesibilidad del sistema. La app de escritorio tiene instalador para los tres; todavía no está firmado, así que la primera vez el sistema pregunta antes de abrirlo.",
    ],
  },
  {
    p: "¿Necesito la app de escritorio?",
    r: [
      "No. La terminal, la consola y la CLI son el mismo Dolphin. La app suma el editor, el chat sobre el CLI de cada agente y todos los espacios de trabajo a la vista, cada uno en su rama.",
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
];

export function Preguntas() {
  return (
    <section id="preguntas" className="relative scroll-mt-24 px-6 py-28 md:px-10" aria-labelledby="preguntas-titulo">
      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="preguntas-titulo" className="titulo-seccion">
            Preguntas.
          </h2>
          <p className="bajada mt-5 max-w-sm">
            Lo que conviene saber antes de instalarlo. El resto está en la{" "}
            <a href="/docs" className="text-espuma underline decoration-espuma/25 underline-offset-4 transition-colors hover:decoration-espuma">
              documentación
            </a>
            .
          </p>
          {/* Acá iba una lámina de Haeckel al margen, como el grabado que acompaña una columna de
              texto. Se fue con el rediseño del 01/11: los grabados eran de otra dirección. */}
        </div>
        {/* Cada pregunta es una superficie tonal que se abre y no un renglón entre filetes: con el
            rediseño se fueron las líneas de todo el sitio. */}
        <div className="flex flex-col gap-1.5">
          {PREGUNTAS.map((q) => (
            <details key={q.p} className="group rounded-[var(--radius-caja)] bg-lienzo-2 px-5 transition-colors hover:bg-lienzo-3 open:bg-lienzo-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[17px] text-tinta transition-colors group-open:text-espuma [&::-webkit-details-marker]:hidden">
                {q.p}
                <svg viewBox="0 0 16 16" className="size-4 flex-none text-apagado transition-transform duration-200 group-open:rotate-45" aria-hidden="true">
                  <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </summary>
              <div className="flex max-w-2xl flex-col gap-3 pb-5 text-[15px] leading-relaxed text-tenue">
                {q.r.map((parrafo) => (
                  <p key={parrafo.slice(0, 24)}>
                    <Linea texto={parrafo} />
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
