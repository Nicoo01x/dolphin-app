import { REPO } from "@/lib/contenido";
import { RELEASES } from "@/lib/descargas";
import { Instalar } from "../Instalar";
import { Descargar } from "./Descargar";

/**
 * El cierre: cómo tenerlo, y el botón otra vez. Es la ancla `#instalar` de la barra y de la
 * portada.
 *
 * Desde el 14/11/2026 el camino principal es el instalador de la app de escritorio (GitHub
 * Releases, `lib/descargas.ts`), el del sistema de quien visita. Desde el código queda como
 * segunda opción, para quien quiere la terminal y la CLI sin la app.
 */
export function Cierre() {
  return (
    <section id="instalar" aria-labelledby="cierre-titulo" className="scroll-mt-24 px-4 pt-24 pb-32 md:px-10 md:pt-36">
      <div className="mx-auto grid w-full max-w-[1200px] gap-x-16 gap-y-10 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <h2 id="cierre-titulo" className="titulo-seccion">
            Descargalo.
          </h2>
          <p className="bajada mt-4 max-w-[40ch]">
            Un instalador para tu sistema. Los agentes los ponés vos: Claude Code, Codex o el CLI que ya usás, con tu sesión.
          </p>
          <div className="mt-8">
            <Descargar alinear="izquierda" />
          </div>
          <p className="mt-4 text-[13px] text-tenue">
            <a href={RELEASES} className="text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma">
              Todas las versiones
            </a>
            {" · "}
            <a href={REPO} className="text-tinta underline decoration-espuma/30 underline-offset-[3px] transition-colors hover:text-espuma">
              El código, en GitHub
            </a>
          </p>
        </div>
        <div className="min-w-0 lg:pt-3">
          <h3 className="text-[16px] leading-[1.3] font-medium tracking-[-0.012em] text-espuma">O desde el código</h3>
          <p className="mt-1.5 mb-4 max-w-[46ch] text-[14px] leading-[1.5] text-tenue">
            Para la terminal y la CLI sin la app. Necesita Node 22.12 y git; después,{" "}
            <code className="font-codigo text-[0.92em] text-espuma">dolphin --demo</code> lo muestra entero con un agente de mentira.
          </p>
          <Instalar />
        </div>
      </div>
    </section>
  );
}
