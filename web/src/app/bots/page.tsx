import type { Metadata } from "next";
import { canonicalDe, SITIO_PUBLICADO } from "@/lib/contenido";
import { CarpetaDeBot } from "@/components/bots/CarpetaDeBot";
import { Diagrama } from "@/components/docs/Diagramas";
import { Codigo } from "@/components/docs/Bloques";
import { Linea } from "@/components/docs/Linea";
import { Escena } from "@/components/Escena";
import { LaminaDeArchivo } from "@/components/LaminaDeArchivo";
import { Logo } from "@/components/Logo";

const DESCRIPCION =
  "Agentes personales siempre prendidos, en tu máquina. Cada uno es una carpeta con su alma, su memoria, sus habilidades y sus rutinas, y te escribe por Telegram.";

export const metadata: Metadata = {
  title: "Dolphin bots",
  description: DESCRIPCION,
  openGraph: { title: "Dolphin bots", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/bots" } : {}) },
    ...canonicalDe("/bots"),
};

/** Las cuatro plantillas de src/bots/plantillas.ts, con su alma tal cual y cuándo corren. */
const PLANTILLAS = [
  {
    id: "vigia",
    nombre: "Vigía",
    alma: "Sos el vigía de los repos de tu carpeta. Mirás con calma su estado: cambios, commits recientes y tests rotos si hay un comando para correrlos. Avisás solo cuando algo pide atención; si no, no interrumpís.",
    cuando: "latido cada 30 minutos",
    permiso: "leer, con chequeo previo sin modelo",
    horas: Array.from({ length: 48 }, (_, i) => i / 2),
    latido: true,
  },
  {
    id: "escritor",
    nombre: "Escritor",
    alma: "Escribís piezas claras y con personalidad según el tema y el tono que te den, cuidando los datos, y dejás el resultado en tu carpeta.",
    cuando: "todos los días, 06:00",
    permiso: "preguntar",
    horas: [6],
    latido: false,
  },
  {
    id: "parte",
    nombre: "Parte",
    alma: "Preparás el parte diario. Resumís, concreto y honesto, qué pasó ayer en los repos que conocés y qué merece atención hoy.",
    cuando: "todos los días, 08:00",
    permiso: "preguntar",
    horas: [8],
    latido: false,
  },
  {
    id: "investigador",
    nombre: "Investigador",
    alma: "Sos un investigador cuidadoso. Cuando te piden averiguar algo, buscás fuentes confiables, separás hechos de inferencias y devolvés un informe con las fuentes enlazadas.",
    cuando: "cuando le pedís",
    permiso: "preguntar, con búsqueda web",
    horas: [],
    latido: false,
  },
] as const;

/**
 * Frente a otros agentes personales, sin inventar: lo de ellos sale de sus repos y su documentación
 * pública (openclaw/openclaw y NousResearch/hermes-agent, leídos el 28/10/2026). Donde no hay un
 * dato público, dice «sin dato».
 */
const OTROS = ["Dolphin bots", "OpenClaw", "Hermes Agent", "Grok en Telegram"] as const;
const COMPARACION: readonly (readonly [string, string, string, string, string])[] = [
  ["Dónde corre", "tu máquina", "tu máquina o tu servidor", "tu máquina, un VPS o serverless", "la nube de xAI"],
  ["Código abierto", "sí, MIT", "sí, MIT", "sí, MIT", "no"],
  ["Con qué piensa", "Claude Code o Codex, con la sesión que ya tenés", "cualquier modelo, en la nube o local", "cualquier modelo: OpenRouter, OpenAI, endpoints propios", "Grok"],
  ["Por dónde te habla", "Telegram", "más de 20 canales: WhatsApp, Telegram, Slack, Discord, iMessage…", "Telegram, Discord, Slack, WhatsApp, Signal, correo…", "Telegram y las apps de xAI"],
  ["Memoria", "memoria.md de hasta 2.200 caracteres, que el bot consolida, y búsqueda por palabras en la charla y los partes", "en tu máquina", "entre sesiones, con búsqueda y un modelo de quién sos", "sin dato"],
  ["Habilidades", "las escribe solo, en habilidades/", "skills y plugins, con un hub (ClawHub)", "las crea solo y las mejora con el uso; tiene un hub", "sin dato"],
  ["Tareas solas", "rutinas diarias o cada N minutos, con su zona horaria, y latidos", "sí", "cron en lenguaje natural", "sin dato"],
  ["Siempre prendido", "un servicio del sistema: dolphin bots instalar", "sí, como daemon (onboard --install-daemon)", "sin dato", "en la nube de xAI"],
  ["Antes de gastar un turno", "un chequeo sin modelo decide si despertarlo (el del Vigía mira git)", "sin dato", "sin dato", "sin dato"],
  ["Si se acaba el cupo", "reintenta una vez con el motor de respaldo", "sin dato", "sin dato", "sin dato"],
  ["Apps", "terminal, consola web y app de escritorio", "iOS, Android y macOS, con voz", "CLI, TUI y app de escritorio", "las de xAI"],
];

const ELLOS = [
  "Muchos canales. Los bots de Dolphin hablan solo por Telegram.",
  "Cualquier modelo, incluso uno local. Los de Dolphin piensan con Claude Code o con Codex.",
  "App en el celular y voz (OpenClaw). Dolphin no tiene app móvil.",
  "Correr en un VPS o en serverless con varios backends de terminal (Hermes). Los bots de Dolphin corren en tu máquina.",
  "Búsqueda de texto completo entre sesiones con resumen por modelo, y un modelo de quién sos (Hermes). La de Dolphin busca por palabras en la charla y los partes del bot.",
  "Un hub de habilidades de la comunidad (ClawHub, el Skills Hub de Hermes).",
];

const DOLPHIN = [
  "Usa la suscripción de Claude Code o Codex que ya pagás: no hace falta una clave de API.",
  "Cada bot es una carpeta de texto. La abrís, la leés y la cambiás con cualquier editor.",
  "Un permiso por bot: solo lee, pregunta antes de tocar, edita su carpeta con una foto para deshacer, o es libre.",
  "Un chequeo sin modelo antes de cada latido: si en el repo no cambió nada, no se gasta un token.",
  "Un latido no te escribe si no hay novedad, y una rutina que falla no se relanza en loop.",
  "Se instala como servicio del sistema en Windows, macOS y Linux, y si un motor se queda sin cupo pasa al de respaldo.",
  "Viven en la misma app que tu flota de agentes de código: la terminal, la consola y Telegram son el mismo Dolphin.",
];

function Titulo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 titulo-seccion">
      {children}
    </h2>
  );
}

/** El rótulo de una sección o de una pieza: mayúsculas con tracking, como el nav. */
function Etiqueta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[14px] text-apagado ${className}`}>{children}</p>;
}

/** Un día de 24 horas y cuándo se despierta cada plantilla. */
function Reloj() {
  return (
    <div role="img" aria-label="Un día: el Vigía late cada 30 minutos, el Escritor corre a las 6, el Parte a las 8 y el Investigador solo cuando le pedís.">
      <div className="grid gap-px bg-espuma/10">
        {PLANTILLAS.map((p) => (
          <div key={p.id} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 bg-lienzo py-3 md:grid-cols-[130px_minmax(0,1fr)]">
            <span className="text-[15px] text-espuma">{p.nombre}</span>
            <div className="relative h-8 rounded bg-lienzo-2">
              {p.horas.map((h) => (
                <span
                  key={h}
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${p.latido ? "h-3 w-[2px] bg-espuma/55" : "size-3 rounded-full bg-espuma"}`}
                  style={{ left: `${(h / 24) * 100}%` }}
                />
              ))}
              {p.horas.length === 0 && <span className="absolute inset-y-0 left-4 flex items-center text-[13px] text-tinta/60">cuando le pedís</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-4 md:grid-cols-[130px_minmax(0,1fr)]">
        <span />
        <div className="relative h-5 text-[11px] tabular-nums text-tinta/55">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Una charla por Telegram: la del Parte de la demo, con la memoria que le quedó. */
function Charla() {
  const mensajes = [
    { de: "bot", texto: "Ayer: 14 commits en 2 repos, 3 ramas listas para revisar y un test que tarda el doble que la semana pasada." },
    { de: "vos", texto: "¿cuál test?" },
    { de: "bot", texto: "cobros.test.ts: de 4 a 9 segundos desde el cambio de la base de prueba." },
    { de: "vos", texto: "/memoria" },
    { de: "bot", texto: "2026-10-28 Prefiere el parte en tres renglones, con lo urgente primero." },
  ] as const;
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="flex items-center gap-3 border-b border-espuma/10 pb-4">
        <span className="grid size-9 place-items-center rounded-full bg-espuma text-lienzo">
          <Logo className="h-[15px] w-auto" />
        </span>
        <span>
          <span className="block text-[15px] font-medium text-espuma">Parte</span>
          <span className="block text-[12px] text-tinta/55">bot · por Telegram</span>
        </span>
      </div>
      <ol className="mt-5 flex flex-col gap-2">
        {mensajes.map((m, i) => (
          <li
            key={i}
            className={`max-w-[85%] rounded px-4 py-2.5 text-[15px] leading-snug ${
              m.de === "vos" ? "self-end bg-espuma text-lienzo" : "self-start bg-lienzo-2 text-tinta"
            } ${m.texto.startsWith("/") ? "font-codigo text-[14px]" : ""}`}
          >
            {m.texto}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Bots() {
  return (
    <Escena>
      <section className="px-6 pt-10 pb-16 md:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <Etiqueta className="text-[13px]">Dolphin bots</Etiqueta>
            <h1 className="mt-6 titulo-grande">Bots que viven en una carpeta.</h1>
            <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-tinta/80">{DESCRIPCION}</p>
            <div className="mt-9 flex flex-wrap gap-2">
              <a href="/docs/bots" className="inline-flex items-center gap-2 rounded bg-espuma px-5 py-3 text-[14px] font-medium text-lienzo transition-colors hover:bg-white">
                <Logo className="h-[14px] w-auto" />
                Leer la guía de bots
              </a>
              <a
                href="/docs/instalacion"
                className="inline-flex items-center gap-2 rounded border border-espuma/15 px-5 py-3 text-[14px] text-tinta transition-colors hover:border-electrico hover:text-espuma"
              >
                Instalar Dolphin
              </a>
            </div>
            <div className="mt-8 max-w-xl">
              <Codigo codigo={"dolphin bots nuevo Vigía --plantilla vigia\ndolphin bots telegram vigia --token <token> --chat <chat>\ndolphin bots correr"} titulo="tres comandos" />
            </div>
          </div>

          {/* La carpeta de los bots como se ve en el disco: una superficie partida por filetes, no
              cuatro tarjetas. */}
          <div className="min-w-0">
            <p className="border-b border-espuma/10 pb-3 font-codigo text-[13px] text-tinta/60">~/.dolphin/bots/</p>
            <ul className="grid gap-px bg-espuma/10">
              {PLANTILLAS.map((p) => (
                <li key={p.id} className="flex items-center gap-3 bg-lienzo py-3.5">
                  <span className="grid size-9 flex-none place-items-center rounded-full bg-espuma text-lienzo">
                    <Logo className="h-[14px] w-auto" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-codigo text-[14px] text-espuma">{p.id}/</span>
                    <span className="block text-[13px] text-tinta/70">{p.cuando}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="carpeta">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-2xl">
              <Titulo id="carpeta">Un bot por dentro.</Titulo>
              <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
                No hay una base de datos escondida. Lo que el bot es y lo que aprendió está en archivos de texto, en tu máquina. Tocá cada uno.
              </p>
            </div>
            <LaminaDeArchivo nombre="medusasPeine" alto="aspect-[4/3]" className="w-full max-w-sm justify-self-end max-lg:justify-self-start" />
          </div>
          <div className="mt-12">
            <CarpetaDeBot />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="plantillas">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-2xl">
            <Titulo id="plantillas">Cuatro para empezar.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Cada plantilla trae su alma y sus rutinas. Después le cambiás todo. Hablan con quien los usa, no con un nombre fijo.
            </p>
          </div>
          <div className="mt-12">
            <Etiqueta className="border-b border-espuma/10 pb-3">Un día</Etiqueta>
            <div className="mt-4">
              <Reloj />
            </div>
          </div>
          <dl className="mt-14 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {PLANTILLAS.map((p) => (
              <div key={p.id}>
                <dt className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[28px] font-medium tracking-[-0.022em] leading-tight text-espuma">{p.nombre}</span>
                  <span className="text-[13px] text-tinta/60">{p.cuando}</span>
                </dt>
                <dd className="mt-2 text-[16px] leading-relaxed text-tinta/80">
                  <span className="text-tinta/60">alma.md · </span>
                  {p.alma}
                </dd>
                <dd className="mt-2 flex flex-wrap gap-x-3 text-[13px] text-tinta/60">
                  <span className="font-codigo">--plantilla {p.id}</span>
                  <span>permiso {p.permiso}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="dale">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-2xl">
            <Titulo id="dale">Pregunta antes de tocar.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Un bot nuevo corre de solo lectura. Si para cumplir tu pedido necesita cambiar o ejecutar algo, te dice qué y por qué, y espera.
            </p>
          </div>
          <Diagrama cual="permiso" numero={1} />
          <div className="grid gap-px bg-espuma/10 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["leer", "Solo mira, con sus herramientas. Ni pide permiso ni guarda memoria o habilidades."],
              ["preguntar", "El de siempre. Lee solo; para escribir o ejecutar espera tu «dale», un pedido por vez."],
              ["carpeta", "Edita sin preguntar, pero antes saca una foto de su carpeta. dolphin bots deshacer la vuelve atrás."],
              ["libre", "Escribe y ejecuta sin preguntar. Lo autorizaste vos."],
            ].map(([p, t]) => (
              <div key={p} className="bg-lienzo p-5">
                <p className="font-codigo text-[14px] text-espuma">--permiso {p}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-tinta/80">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="latido">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Titulo id="latido">Late, y avisa solo si hay algo.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Una rutina corre a una hora o cada tantos minutos y deja su parte. Un latido es una rutina que se calla cuando no hay novedad: mira cada 30 minutos y te escribe una vez, cuando se rompe algo.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-tinta/75">
              Antes de cada latido corre un chequeo sin modelo. El del Vigía compara el último commit y el git status con lo que vio la vez anterior: si no cambió nada, la vuelta no gasta un token. El chequeo lo escribís vos; un bot no lo puede cambiar.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-tinta/75">
              Si una rutina falla, se reintenta a los 5, 15 y 30 minutos y después vuelve a su hora. El aviso sale una vez por racha, no en cada intento.
            </p>
          </div>
          {/* El latido: el chequeo mira en cada vuelta y el modelo despierta en una sola. */}
          <div
            role="img"
            aria-label="Doce vueltas del latido: en once el chequeo no vio cambios y no se gastó nada; en una el repo cambió, despertó al bot y avisó que se rompieron dos tests."
          >
            <Etiqueta className="border-b border-espuma/10 pb-3">Doce vueltas</Etiqueta>
            <div className="mt-6 flex items-end gap-2">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className={`flex-1 rounded-[2px] ${i === 8 ? "h-16 bg-espuma" : "h-3 bg-lienzo-3"}`} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-tinta/55">
              <span>06:00</span>
              <span>12:00</span>
            </div>
            <div className="mt-6 flex flex-col gap-1.5 text-[13px] text-tinta/70">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-4 bg-lienzo-3" /> el chequeo miró git: nada nuevo, cero tokens
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-4 bg-espuma" /> cambió algo: despertó al bot
              </span>
            </div>
            <p className="mt-6 rounded bg-lienzo-2 px-4 py-3 text-[15px] leading-snug text-tinta">
              Después del último commit se rompieron 2 tests de la tienda: el redondeo del IVA, en src/precios.ts.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="servicio">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0">
            <Titulo id="servicio">Prendidos aunque cierres la terminal.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              dolphin bots instalar los deja como un servicio del sistema que arranca al iniciar sesión. Un solo proceso a la vez: si ya hay uno prendido, otro no arranca.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-tinta/75">
              Y si el motor de un bot se queda sin cupo, reintenta una vez con el de respaldo (Claude o Codex) y lo deja anotado en la charla.
            </p>
          </div>
          <div className="min-w-0">
            <Codigo codigo={"dolphin bots instalar\ndolphin bots            # te dice si están prendidos\ndolphin bots desinstalar"} titulo="terminal" />
            <ul className="mt-6 grid gap-px bg-espuma/10">
              {[
                ["Windows", "una tarea al iniciar sesión"],
                ["macOS", "un LaunchAgent"],
                ["Linux", "un servicio de usuario de systemd"],
              ].map(([so, como]) => (
                <li key={so} className="flex items-baseline justify-between gap-4 bg-lienzo py-3">
                  <span className="text-[15px] text-espuma">{so}</span>
                  <span className="text-right text-[14px] text-tinta/75">{como}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="telegram">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="lg:order-2">
            <Titulo id="telegram">Te escribe por Telegram.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Cada bot tiene su propio bot de Telegram y atiende un solo chat: el tuyo. Le hablás como a cualquiera y también entiende comandos.
            </p>
            <ul className="mt-6 flex flex-col gap-2 text-[16px] text-tinta/80">
              {[
                ["/memoria", "lo que tiene anotado"],
                ["/habilidades", "lo que sabe hacer"],
                ["/rutinas", "cuándo vuelve a correr cada una"],
                ["/olvidar <línea>", "borra un recuerdo"],
                ["dale · sí · hacelo", "confirma lo que estaba esperando permiso"],
              ].map(([c, t]) => (
                <li key={c} className="flex flex-wrap gap-x-3">
                  <span className="font-codigo text-[14px] text-espuma">{c}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:order-1">
            <Charla />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="manada">
        <div className="mx-auto max-w-3xl text-center">
          <Titulo id="manada">Y se piden cosas entre ellos.</Titulo>
          <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-tinta/80">
            Un bot le pasa trabajo a otro y usa lo que le devuelve: el Escritor le pide datos al Investigador y escribe con eso. Como mucho dos saltos, nadie se consulta a sí mismo ni vuelve a uno que ya está en la cadena, y el que recibe el pedido trabaja con el permiso más bajo de los dos.
          </p>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="comparacion">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-2xl">
            <Titulo id="comparacion">Frente a otros.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              OpenClaw y Hermes Agent son dos agentes personales open source que corren en tu máquina; Grok también vive en Telegram. Esto es lo que tiene cada uno, sin estirarlo.
            </p>
          </div>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-espuma/20">
                  <th scope="col" className="py-3 pr-4 text-[13px] font-medium text-tinta/60">
                    <span className="sr-only">Qué</span>
                  </th>
                  {OTROS.map((o, i) => (
                    <th key={o} scope="col" className={`px-4 py-3 text-[22px] font-medium tracking-[-0.022em] font-normal ${i === 0 ? "text-espuma" : "text-tinta/85"}`}>
                      {o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARACION.map(([fila, ...celdas]) => (
                  <tr key={fila} className="border-b border-espuma/10">
                    <th scope="row" className="py-3 pr-4 align-top text-[12px] font-normal text-tinta/55">
                      {fila}
                    </th>
                    {celdas.map((c, i) => (
                      <td key={i} className={`px-4 py-3 align-top leading-snug ${i === 0 ? "text-espuma" : c === "sin dato" ? "text-tinta/50" : "text-tinta/80"}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {[
              { titulo: "Lo que ellos tienen y Dolphin no", items: ELLOS },
              { titulo: "Lo que Dolphin hace distinto", items: DOLPHIN },
            ].map((l) => (
              <div key={l.titulo}>
                <h3 className="border-b border-espuma/10 pb-3 text-[28px] font-medium tracking-[-0.022em] leading-tight text-espuma">{l.titulo}</h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {l.items.map((it) => (
                    <li key={it} className="relative pl-6 text-[16px] leading-relaxed text-tinta/80">
                      <span aria-hidden="true" className="absolute top-[0.7em] left-1 size-1.5 rounded-full bg-tinta/50" />
                      <Linea texto={it} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-3xl text-[13px] leading-relaxed text-tinta/60">
            Lo de OpenClaw y Hermes Agent sale de sus repositorios públicos (openclaw/openclaw, NousResearch/hermes-agent) al 28/10/2026. Grok en Telegram es el bot de xAI. «Sin dato» quiere decir que no lo encontramos en lo que publican, no que no lo tengan.
          </p>
        </div>
      </section>

      <section className="px-6 pt-10 pb-28 md:px-10">
        <div className="mx-auto max-w-3xl border-t border-espuma/10 pt-16 text-center">
          <h2 className="titulo-seccion">Armá el primero.</h2>
          <p className="mx-auto mt-5 max-w-lg text-[18px] text-tinta/80">La guía paso a paso, con cada comando, está en la documentación.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <a href="/docs/bots" className="rounded bg-espuma px-5 py-3 text-[14px] font-medium text-lienzo transition-colors hover:bg-white">
              Leer la guía de bots
            </a>
            <a href="/docs/instalacion" className="rounded border border-espuma/15 px-5 py-3 text-[14px] text-tinta transition-colors hover:border-electrico hover:text-espuma">
              Instalar Dolphin
            </a>
          </div>
        </div>
      </section>
    </Escena>
  );
}
