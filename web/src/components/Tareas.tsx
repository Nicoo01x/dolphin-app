import { TableroVivo } from "./TableroVivo";

/**
 * El tablero de tareas, andando, sobre su propio paisaje.
 *
 * Estaba adentro de la portada, pegado al titular y sobre el lienzo blanco. Ahora es una banda
 * propia con su foto a sangre, como la demo del chat: las dos piezas que SE TOCAN —arrastrar una
 * tarjeta, pedirle algo al agente— se reconocen a lo lejos porque las dos flotan sobre una foto,
 * y las que sólo se leen van sobre el blanco. Es la regla que pidió Nico el 09/11/2026 («la parte
 * de tareas también que se muestre con otro fondo»).
 *
 * Why una foto distinta de la del chat: si las dos bandas llevaran la misma, la página parecería
 * repetirse. Son del mismo mundo —agua, niebla, verde— sin ser la misma postal.
 */
export function Tareas() {
  return (
    <section id="tareas" aria-labelledby="tareas-titulo" className="relative scroll-mt-20 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/paisajes/sendero.webp)" }}
      />
      {/* Las dos puntas se funden con el lienzo para que la banda no entre ni salga con un corte. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-lienzo to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-lienzo" />

      <div className="relative mx-auto w-full max-w-[1200px] px-6 py-20 md:px-10 md:py-28">
        <h2 id="tareas-titulo" className="sr-only">
          El tablero
        </h2>
        <div className="ventana-captura">
          <TableroVivo />
        </div>
        {/* Sobre la foto, un gris tenue no se lee: la línea va en una pastilla, como un pie de
            foto de verdad. */}
        <p className="mt-3 inline-flex rounded-full bg-lienzo/80 px-3 py-1 text-[13px] text-tinta backdrop-blur-sm">
          Arrastrá una tarjeta. En tu máquina, soltarla en «Haciendo» larga el equipo.
        </p>
      </div>
    </section>
  );
}
