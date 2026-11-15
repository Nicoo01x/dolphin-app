import type { ReactNode } from "react";

/**
 * Una tarjeta acrílica flotando sobre una imagen a sangre, con una fila por cosa.
 *
 * Es la forma que eligió Nico el 09/11/2026 para mostrar funciones: el paisaje de fondo le da aire
 * y temperatura a una lista que, sola, es una tabla; y la tarjeta —blanca translúcida, con el fondo
 * difuminado detrás— la separa de la foto sin taparla. Cada fila lleva su tilde en círculo, que es
 * la misma marca que usa el chat del escritorio para decir «esto salió»: la web y la app hablan
 * igual.
 *
 * Why la imagen va como fondo del contenedor y no como `<img>`: no es contenido, es superficie. Un
 * lector de pantalla no tiene nada que hacer con ella, y como fondo se recorta sola en cualquier
 * ancho sin que haya que pensar la relación de aspecto.
 */

export type FilaDeTarjeta = {
  readonly titulo: string;
  readonly texto?: string;
};

export function TarjetaSobrePaisaje({
  paisaje,
  encabezado,
  filas,
  className = "",
}: {
  /** La URL de una imagen de fondo; sin ella se pinta el cielo y el mar de la marca. */
  readonly paisaje?: string;
  /** Lo que va arriba de todo, adentro de la tarjeta: un nombre, un avatar, lo que sea. */
  readonly encabezado?: ReactNode;
  readonly filas: readonly FilaDeTarjeta[];
  readonly className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-6 sm:p-10 ${className}`}
      style={
        paisaje
          ? { backgroundImage: `url(${paisaje})`, backgroundSize: "cover", backgroundPosition: "center" }
          : {
              // Why un paisaje pintado y no una foto de banco: una foto trae una licencia ajena
              // adentro del producto. Este es el mundo de la marca —cielo y mar— con dos
              // degradados, no pesa nada, y el día que haya una foto elegida entra por `paisaje`.
              backgroundImage:
                "linear-gradient(to bottom, #cfe6f2, #eaf4f8 55%), radial-gradient(130% 80% at 50% 115%, #8ecae6, transparent 70%)",
            }
      }
    >
      {/* Un velo tenue: sobre una foto clara la tarjeta se lee igual, y sobre una oscura también.
          Sin él, el contraste del texto depende de qué foto se haya puesto. */}
      <div aria-hidden className="absolute inset-0 bg-black/10" />
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_8px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        {encabezado ? (
          <div className="flex items-center gap-2 border-b border-black/5 px-5 py-3 text-sm text-neutral-600">
            {encabezado}
          </div>
        ) : null}
        <ul>
          {filas.map((fila, i) => (
            <li
              key={fila.titulo}
              className={`flex gap-3 px-5 py-4 ${i > 0 ? "border-t border-black/5" : ""}`}
            >
              <TildeEnCirculo />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-neutral-900">{fila.titulo}</p>
                {fila.texto ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{fila.texto}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** El mismo tilde en círculo que lleva cada fila de herramienta en el chat del escritorio. */
function TildeEnCirculo() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="mt-0.5 size-[18px] shrink-0 text-neutral-400"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
