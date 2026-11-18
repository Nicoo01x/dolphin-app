import type { Metadata } from "next";
import { Escena } from "@/components/Escena";
import { Instaladores } from "@/components/descargar/Instaladores";
import { DatosEstructurados } from "@/components/DatosEstructurados";
import { canonicalDe, INSTALAR, REPO, SITIO, SITIO_PUBLICADO } from "@/lib/contenido";
import { RELEASES } from "@/lib/descargas";

const DESCRIPCION =
  "Bajá Dolphin para Windows, macOS o Linux: la app de escritorio para trabajar con Claude Code, Codex y otros agentes en paralelo. Gratis y open source.";

export const metadata: Metadata = {
  title: "Descargar Dolphin para Windows, macOS y Linux",
  description: DESCRIPCION,
  openGraph: { title: "Descargar Dolphin", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/descargar" } : {}) },
  ...canonicalDe("/descargar"),
};

export default function PaginaDescargar() {
  return (
    <Escena>
      <DatosEstructurados
        datos={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Dolphin",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Windows 10, Windows 11, macOS 13.4+, Linux",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          downloadUrl: `${SITIO}/descargar`,
          softwareHelp: `${SITIO}/docs`,
          license: "https://opensource.org/licenses/MIT",
          codeRepository: REPO,
        }}
      />
      <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-28 md:px-10">
        <header className="max-w-3xl">
          <h1 className="titulo-grande">Descargar.</h1>
          <p className="bajada mt-6 max-w-xl">
            La app de escritorio de Dolphin, gratis y open source. Elegí tu sistema: el instalador baja de la última versión publicada en GitHub.
          </p>
        </header>

        <div className="mt-14">
          <Instaladores />
        </div>

        <section aria-labelledby="terminal" className="mt-20 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 id="terminal" className="titulo-seccion">
              ¿Sólo la terminal?
            </h2>
            <p className="bajada mt-5 max-w-sm">La CLI y la consola son el mismo Dolphin, sin la app. Necesitan Node 22.12 o más nuevo y git.</p>
          </div>
          <div className="self-end rounded-[var(--radius-caja)] bg-lienzo-2 p-5">
            <code className="block font-codigo text-[13px] leading-relaxed text-espuma [overflow-wrap:anywhere]">{INSTALAR.comando}</code>
            <p className="mt-3 text-[13px] text-tenue">{INSTALAR.sistemas}</p>
          </div>
        </section>

        <p className="mt-16 text-[14px] text-tenue">
          ¿Buscás una versión anterior o los archivos para verificar?{" "}
          <a href={RELEASES} className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
            Todas las versiones en GitHub
          </a>
          . Lo que cambió en cada una está en{" "}
          <a href="/novedades" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
            Novedades
          </a>
          .
        </p>
      </div>
    </Escena>
  );
}
