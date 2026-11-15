import { REPO } from "@/lib/contenido";
import { Lamina, PAISAJES } from "./Lamina";
import { VIDEOS } from "./videos";
import { Descargar } from "./Descargar";
import { VideoReal } from "./VideoReal";

/**
 * La portada, con el molde de la web de la base: titular, una oración, los botones y abajo la app de verdad,
 * grande. Desde el 12/11/2026 (noche) lo de abajo es un VIDEO de la app de escritorio trabajando
 * sobre un proyecto de demostración (`tienda-web`): se abre un issue desde Tareas, se le da a empezar
 * y el agente lo resuelve en su espacio. Nico: «debe ser el video, cómo se van delegando». Las
 * pestañas de antes (inicio, equipo, plan, un compañero) salieron: tres eran capturas de la app de
 * terminal, y el video ya cuenta el recorrido entero.
 *
 * Cómo se grabó: `public/videos/app-12-11/LEEME.md`.
 */
export function PortadaReal() {
  return (
    <section aria-labelledby="portada-titulo" className="px-4 pt-14 md:px-10 md:pt-20">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="flex flex-col items-center text-center">
          <h1 id="portada-titulo" className="titulo-grande">
            Dolphin
          </h1>
          <p className="bajada mt-5 max-w-[36ch]">
            Una app open source donde Claude Code, Codex y otros ocho agentes hacen tus tareas en paralelo, cada uno en su rama.
          </p>
          <div className="mt-8">
            <Descargar />
          </div>
          <p className="mt-4 text-[13px] text-tenue">
            <a href={REPO} className="inline-flex items-center gap-1.5 text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma">
              <IconoGithub />
              El código, en GitHub
            </a>
            {" · "}
            <a href="#instalar" className="text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma">
              Instalarlo desde el código
            </a>
          </p>
        </div>
      </div>

      {/* La app va más ancha que el texto (hasta 1440, el video a ~1330): a 1100 el chat no se leía. */}
      <div className="mx-auto w-full max-w-[1440px]">
        <Lamina paisaje={PAISAJES.lago} foco="50% 62%" prioridad="sin-diferir" className="mt-12 md:mt-14">
          <VideoReal video={VIDEOS.portada} modo="portada" ancho={1360} className="mx-auto w-full" />
        </Lamina>
      </div>
    </section>
  );
}

function IconoGithub() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
