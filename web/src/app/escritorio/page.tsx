import type { Metadata } from "next";
import { Codigo } from "@/components/docs/Bloques";
import { Escena } from "@/components/Escena";
import { LaminaDeArchivo } from "@/components/LaminaDeArchivo";
import { Vistas } from "@/components/escritorio/Vistas";
import { Ventana } from "@/components/Ventana";
import { VideoDeFuncion } from "@/components/VideoDeFuncion";
import { canonicalDe, SITIO_PUBLICADO, REPO } from "@/lib/contenido";

const DESCRIPCION =
  "La app de escritorio de Dolphin: tablero, tareas, cosechas, memoria, bots, git y orquestación en una ventana, con el chat sobre el CLI de tu agente.";

export const metadata: Metadata = {
  title: "App de escritorio",
  description: DESCRIPCION,
  openGraph: { title: "Dolphin · App de escritorio", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/escritorio" } : {}) },
    ...canonicalDe("/escritorio"),
};

/** Las tres tablas de la vista Git, como las arma ui/src/components/Git.tsx (la misma en la consola). */
const TABLAS = [
  {
    nombre: "Ramas",
    texto: "El último commit, quiénes trabajaron, cuántos commits tiene adelante y atrás de la base, si ya está mergeada y su PR.",
    filtros: "todas · por integrar · mergeadas · las que abrió Dolphin",
  },
  { nombre: "Commits", texto: "El mensaje, el autor y las ramas que apuntan a cada uno.", filtros: "se filtran escribiendo" },
  { nombre: "Issues", texto: "Las etiquetas, los asignados, quién lo abrió y si sigue abierto. Salen de GitHub, con gh.", filtros: "abiertos · cerrados · todos" },
] as const;

/** Lo que tiene la app y no la consola (escritorio/README.md). */
const SOLO_ACA = [
  ["El chat sobre el CLI", "Cada agente abre en un chat con el CLI interactivo de verdad abajo. Arriba, el modelo, en qué anda, cuánto del plan te queda y el contexto."],
  ["Los archivos al costado", "Lo que el agente escribe se abre a la derecha en modo cambios, sin robarte el foco."],
  ["X-ray", "Ctrl + Alt + X prende una capa sobre todas las pantallas: señalás un control de cualquier app y el agente recibe qué es y un recorte. Por ahora, solo en Windows."],
  ["Dictado", "El micrófono baja un modelo de voz que corre en tu compu."],
  ["El modo live", "En el navegador integrado tocás un elemento de tu app, decís qué cambiarle y Dolphin siembra la rama, la pasa por el portón y la mergeás desde ahí."],
  ["Delegar desde el chat", "Le decís a Claude «delegá las tareas» o «pasale esto a Codex» y reparte el trabajo en agentes que ves trabajar en la app, cada uno en su rama."],
  ["Tu servidor", "«Conectar una máquina» prueba tu VPS antes de guardarlo y, si algo falla, un agente lo arregla. Tus bots y el trabajo pesado pueden seguir allá con la compu apagada."],
  ["Ctrl+K en el editor", "Seleccionás, decís qué cambiar o qué querés saber, y vuelve con formato o con el cambio como diff antes de aplicarlo."],
  ["Poca RAM", "Antes de que la compu se cuelgue avisa qué espacio pesa más y ofrece dormirlo o seguirlo en tu servidor."],
] as const;

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

export default function Escritorio() {
  return (
    <Escena>
      <section className="px-6 pt-10 pb-16 md:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <Etiqueta className="text-[13px]">App de escritorio</Etiqueta>
            <h1 className="mt-6 titulo-grande">Dolphin, en una ventana.</h1>
            <p className="mt-7 max-w-lg text-[18px] leading-relaxed text-tinta/80">
              Las tareas, las ramas que te entregaron los agentes, la memoria, los bots y git del proyecto, sin abrir una terminal. Con la consola de Dolphin adentro.
            </p>
            <div className="mt-9 flex flex-wrap gap-2">
              <a href="#abrir" className="rounded bg-espuma px-5 py-3 text-[14px] font-medium text-lienzo transition-colors hover:bg-white">
                Cómo abrirla
              </a>
              <a href="#git" className="rounded border border-espuma/15 px-5 py-3 text-[14px] text-tinta transition-colors hover:border-electrico hover:text-espuma">
                La vista Git
              </a>
            </div>
          </div>
          <Ventana etiqueta="Dolphin · Git" className="min-w-0">
            <img
              src="/capturas/escritorio-git.webp"
              alt="La app de escritorio en la vista Git: a la izquierda la barra con Tablero, Tareas, Cosechas, Bandeja, Memoria, Bots, Git, Automatizaciones y Orquestación; a la derecha las ramas del repo con su último commit, quiénes las tocaron, cuánto les falta contra la base y si están por integrar."
              width={1920}
              height={470}
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </Ventana>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="git">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-2xl">
            <Titulo id="git">La vista Git.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Qué rama sigue viva, quién la tocó y cuánto le falta para entrar. Sale de git y de GitHub en el momento: no guarda nada aparte y no cambia nada.
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start lg:gap-16">
            <dl className="grid gap-px bg-espuma/10">
              {TABLAS.map((t) => (
                <div key={t.nombre} className="bg-lienzo py-5 first:pt-0">
                  <dt className="text-[28px] font-medium tracking-[-0.022em] leading-tight text-espuma">{t.nombre}</dt>
                  <dd className="mt-1.5 text-[16px] leading-relaxed text-tinta/80">{t.texto}</dd>
                  <dd className="mt-1.5 text-[12px] text-tinta/55">{t.filtros}</dd>
                </div>
              ))}
              <div className="bg-lienzo py-5">
                <dt className="text-[28px] font-medium tracking-[-0.022em] leading-tight text-espuma">Columnas</dt>
                <dd className="mt-1.5 text-[16px] leading-relaxed text-tinta/80">
                  Cada tabla elige qué columnas mostrar. Las caras son las fotos de GitHub: pasás por encima y te dice quién es.
                </dd>
              </div>
            </dl>
            <div className="flex min-w-0 flex-col gap-8">
              <figure>
                <Ventana etiqueta="Dolphin · Git · Por integrar">
                  <img src="/capturas/git-quienes.webp" alt="Las ramas por integrar, con el nombre y el usuario de GitHub de quien trabajó en una al pasar por encima de su foto." width={1416} height={420} loading="lazy" decoding="async" className="block h-auto w-full" />
                </Ventana>
                <figcaption className="mt-3 border-t border-espuma/10 pt-2 text-[12px] text-tinta/55">
                  <span className="normal-case">Esta es de la consola: es la misma vista, con el mismo código.</span>
                </figcaption>
              </figure>
            </div>
          </div>

          <div className="mt-16 grid gap-8 border-t border-espuma/10 pt-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="min-w-0">
              <h3 className="text-[28px] font-medium tracking-[-0.022em] leading-tight text-espuma">También en la terminal.</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-tinta/80">
                En la app de terminal es la sección 7: las flechas pasan entre ramas, commits e issues, <span className="font-codigo text-[14px] text-espuma">o</span> abre lo elegido en GitHub y{" "}
                <span className="font-codigo text-[14px] text-espuma">r</span> relee. Y para un vistazo sin abrir nada, <span className="font-codigo text-[14px] text-espuma">dolphin git</span>.
              </p>
              <p className="mt-4 text-[15px] text-tinta/70">
                <a href="/docs/terminal#git" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
                  La sección Git de la terminal
                </a>{" "}
                ·{" "}
                <a href="/docs/cli#cmd-git" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
                  dolphin git
                </a>
              </p>
            </div>
            <div className="min-w-0">
              <Codigo codigo={"dolphin git\ndolphin git ramas --todas\ndolphin git commits --rama main"} titulo="terminal" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="vistas">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-2xl">
            <Titulo id="vistas">Cada vista.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Lo que hay detrás de cada entrada de la barra. Además están la Bandeja, con las ideas y los errores que Dolphin encontró solo, y las Automatizaciones, que programan el trabajo del agente.
            </p>
          </div>
          <div className="mt-10">
            <Vistas />
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10" aria-labelledby="solo-aca">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-2xl">
              <Titulo id="solo-aca">Lo que no está en la consola.</Titulo>
              <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
                Abrís Claude Code o Codex y no ves una terminal: ves un chat con lo que el CLI no te muestra, y el CLI de verdad sigue corriendo abajo.
              </p>
            </div>
            <LaminaDeArchivo nombre="anemonas" alto="aspect-[4/3]" className="w-full max-w-sm justify-self-end max-lg:justify-self-start" />
          </div>
          <Ventana etiqueta="Dolphin · Claude Code" className="mt-12">
            <img
              src="/capturas/escritorio-chat.webp"
              alt="El chat de la app sobre Claude Code: arriba el modelo, que te está esperando, cuánto queda de la semana y el contexto; en el medio una pregunta del agente con dos opciones; a la derecha el historial de sesiones."
              width={1891}
              height={606}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </Ventana>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-start lg:gap-16">
            <div className="lg:col-span-2">
              <h3 className="text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">
                Delegar
              </h3>
              <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-tinta/80">
                Escribís una tarea, el líder la parte, y cada pedazo abre su terminal. Es el mismo
                clip que la app te muestra adentro, el día que te lo ofrece.
              </p>
              <VideoDeFuncion
                className="mt-6"
                src="/carteles/delegacion.mp4"
                poster="/carteles/delegacion.poster.jpg"
                ancho={1280}
                alto={720}
                queSeVe="Una tarea escrita en el chat de Dolphin se parte en tres, y tres terminales se abren solas y la hacen a la vez."
              />

              <h3 className="mt-14 text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">
                Permisos
              </h3>
              <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-tinta/80">
                Elegís si los agentes paran a pedirte permiso o siguen de largo. Es la misma tarea
                corrida de los dos modos, para que la diferencia se vea en vez de explicarse.
              </p>
              <VideoDeFuncion
                className="mt-6"
                src="/carteles/permisos.mp4"
                poster="/carteles/permisos.poster.jpg"
                ancho={1280}
                alto={720}
                queSeVe="La misma tarea corrida de los dos modos a la vez: a la izquierda el agente se frena y pregunta antes de editar, y a la derecha termina los cuatro archivos sin preguntar."
              />

              <h3 className="mt-14 text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">
                El portón
              </h3>
              <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-tinta/80">
                Dos ramas hacen la misma tarea y las dos dicen «listo». El portón las prueba igual
                y una sola llega a la tuya. Es lo que hay que ver para entender que el portón no es
                burocracia: el error que agarra es uno que el agente no vio.
              </p>
              <VideoDeFuncion
                className="mt-6"
                src="/carteles/porton.mp4"
                poster="/carteles/porton.poster.jpg"
                ancho={1280}
                alto={720}
                queSeVe="Dos ramas hacen la misma tarea y las dos avisan que terminaron. El portón corre typecheck, lint y test en las dos: la primera pasa las tres y la segunda falla el test, con un error de tipos en otro archivo que su agente no había visto."
              />
            </div>
            <dl className="grid gap-x-12 gap-y-7 sm:grid-cols-2">
              {SOLO_ACA.map(([nombre, texto]) => (
                <div key={nombre}>
                  <dt className="border-b border-espuma/10 pb-2 text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">{nombre}</dt>
                  <dd className="mt-2.5 text-[15px] leading-relaxed text-tinta/80">{texto}</dd>
                </div>
              ))}
            </dl>
            <figure>
              <div className="rounded bg-lienzo-2 px-6 py-8">
                <img src="/capturas/escritorio-isla.webp" alt="La isla abierta: dos agentes que terminaron en master, con el botón para responderle a cada uno." width={436} height={201} loading="lazy" decoding="async" className="mx-auto block h-auto w-full max-w-[436px]" />
              </div>
              <figcaption className="mt-4">
                <span className="block text-[24px] font-medium tracking-[-0.022em] leading-tight text-espuma">La isla</span>
                <span className="mt-2 block text-[15px] leading-relaxed text-tinta/80">
                  Una pastilla arriba de la pantalla, encima de cualquier app, que dice qué agente te necesita o terminó. Le respondés desde ahí.
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="px-6 pt-10 pb-28 md:px-10" aria-labelledby="abrir">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 border-t border-espuma/10 pt-16 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0">
            <Titulo id="abrir">Cómo abrirla.</Titulo>
            <p className="mt-5 text-[18px] leading-relaxed text-tinta/80">
              Con el instalador de tu sistema, desde la portada: Windows, macOS o Linux. Todavía no está firmado, así que la primera vez el sistema pregunta antes de abrirlo. También se corre desde el código, con pnpm.
            </p>
            <div className="mt-9 flex flex-wrap gap-2">
              <a href="/docs/escritorio" className="rounded bg-espuma px-5 py-3 text-[14px] font-medium text-lienzo transition-colors hover:bg-white">
                Leer la doc del escritorio
              </a>
              <a href={REPO} className="rounded border border-espuma/15 px-5 py-3 text-[14px] text-tinta transition-colors hover:border-electrico hover:text-espuma">
                Ver el código
              </a>
            </div>
          </div>
          <div className="min-w-0">
            <Codigo codigo={"git clone https://github.com/Nicoo01x/dolphin-app\ncd dolphin-app\nnpm install\ncd escritorio\npnpm install\npnpm dev"} titulo="terminal" />
            <p className="text-[14px] leading-relaxed text-tinta/70">
              ¿Sin escritorio? La misma consola se abre en el navegador con <span className="font-codigo text-[13px] text-espuma">dolphin ui --abrir</span>.
            </p>
          </div>
        </div>
      </section>
    </Escena>
  );
}
