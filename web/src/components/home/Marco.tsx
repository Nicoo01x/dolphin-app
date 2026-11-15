import type { Captura } from "./capturas";

/**
 * Una captura real de la app con su marco: radio de 14, la superficie oscura de la app detrás (así
 * una captura más baja que el marco no deja un hueco blanco) y una sombra en dos capas, una cerca
 * y nítida y otra lejos y difusa, como la de las tarjetas de la web.
 *
 * Sin barra de ventana dibujada: la captura es lo que hay, no se le inventa un macOS alrededor.
 *
 * En el celular, si la captura trae su recorte (`celular`), se usa ese: una captura de 1440
 * achicada a 358 px no se lee.
 *
 * `ancho` en px de pantalla es el tope al que se la muestra; por defecto, el tamaño al que se ve
 * nítida (su ancho sobre su escala).
 */
export function Marco({
  captura,
  ancho,
  prioridad = false,
  className = "",
  imagenClassName = "",
}: {
  readonly captura: Captura;
  readonly ancho?: number;
  readonly prioridad?: boolean;
  readonly className?: string;
  readonly imagenClassName?: string;
}) {
  const tope = ancho ?? Math.round(captura.ancho / captura.escala);
  return (
    <div
      className={`marco-captura overflow-hidden rounded-[14px] bg-[#111111] ${className}`}
      style={{ maxWidth: tope }}
    >
      <picture>
        {captura.celular ? (
          <source
            media="(max-width: 639px)"
            srcSet={captura.celular.src}
            width={captura.celular.ancho}
            height={captura.celular.alto}
          />
        ) : null}
        <img
          src={captura.src}
          width={captura.ancho}
          height={captura.alto}
          alt={captura.alt}
          loading={prioridad ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={prioridad ? "high" : "auto"}
          className={`block h-auto w-full ${imagenClassName}`}
        />
      </picture>
    </div>
  );
}
