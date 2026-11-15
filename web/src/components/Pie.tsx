import { LogoPastilla } from "./Logo";
import { REPO } from "@/lib/contenido";
import { PIE } from "@/lib/navegacion";

/**
 * El pie de todas las páginas: el mapa del sitio, el repo y los créditos. Lo separa de la página
 * una superficie tonal y no un filete: con el rediseño del 01/11 se fueron las líneas de todo el
 * sitio (ver globals.css).
 */
export function Pie() {
  return (
    <footer className="relative z-10 bg-lienzo-2 px-6 py-16 md:px-10">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <a href="/" className="flex items-center gap-2 text-[19px] leading-none font-medium tracking-[-0.022em] text-espuma">
              <LogoPastilla className="size-[22px]" />
              Dolphin
            </a>
            <p className="mt-4 text-[15px] leading-relaxed text-tenue">
              Un orquestador para los agentes de código que ya usás. Corre en tu máquina, con tus cuentas. Open source, licencia MIT.
            </p>
            <a href={REPO} className="boton-tonal mt-5 bg-lienzo-3 hover:bg-lienzo-4">
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
              El código
            </a>
          </div>
          {PIE.map((col) => (
            <nav key={col.titulo} aria-label={col.titulo}>
              <p className="text-[14px] text-apagado">{col.titulo}</p>
              <ul className="mt-3 flex flex-col">
                {col.enlaces.map((e) => (
                  <li key={e.href}>
                    {/* 44 px de alto: en el celular el pie es el menú completo y se toca con el dedo. */}
                    <a href={e.href} className="inline-block py-2.5 text-[15px] text-tenue transition-colors hover:text-espuma">
                      {e.nombre}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 text-[13px] text-apagado md:flex-row md:items-baseline md:justify-between">
          <p>Hecho en Argentina · 34°36′ S · 58°22′ O</p>
          {/* CC-BY 3.0 exige el crédito, el link a la licencia y a la fuente. */}
          <p>
            <a href="https://poly.pizza/m/bRCPQJJP_bR" className="underline decoration-tinta/30 underline-offset-4 hover:text-espuma">
              Delfín 3D de Poly by Google
            </a>{" "}
            (
            <a href="https://creativecommons.org/licenses/by/3.0/" className="underline decoration-tinta/30 underline-offset-4 hover:text-espuma">
              CC-BY 3.0
            </a>
            ), vía Poly Pizza
          </p>
        </div>
      </div>
    </footer>
  );
}
