import { Encabezado } from "./Encabezado";

/**
 * La app trabajando, flotando sobre el agua.
 *
 * Es una captura de la app de verdad, sacada de la ventana mientras un agente estaba corriendo
 * (Nico, 09/11/2026: «poné una captura de cuando está trabajando»). Acá no hay nada dibujado a
 * mano: es la pantalla que vas a tener adelante, con sus proyectos, su chat, su árbol de archivos
 * y su barra de estado.
 *
 * Why una captura y no la ventana recreada que había antes: lo recreado envejece en silencio —se
 * agrega una sección en la app y acá sigue la de hace un mes— y además invita a inventar detalles
 * que el producto no tiene. Una foto de la app miente mucho menos, y cuando queda vieja se nota.
 * Lo que se recreó sigue en el repo (`ChatTrabajando`), por si se vuelve a una demo que se toca.
 *
 * El fondo es una foto a sangre y la ventana flota encima. Why una foto y no un degradado: el
 * degradado es lo que hace cualquier página de software y por eso no dice nada; el agua es de lo
 * que habla la marca entera —el delfín, el puerto, la manada— y además le da a una ventana oscura
 * el contraste para despegarse.
 */

/** Las medidas de la captura, para que el espacio esté reservado antes de que cargue. */
const CAPTURA = { src: "/capturas/app-trabajando.webp", ancho: 1600, alto: 860 } as const;

export function DemoReal() {
  return (
    <section id="demo" aria-labelledby="demo-titulo" className="relative scroll-mt-20 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/paisajes/verano.webp)" }}
      />
      {/* Las dos puntas se funden con el lienzo: arriba, para que se lea el título; abajo, para
          empalmar con la sección siguiente sin un corte. El resto del agua queda a la vista. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[30rem] bg-gradient-to-b from-lienzo via-lienzo/80 to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-lienzo" />

      <div className="relative mx-auto w-full max-w-[1200px] px-6 py-24 md:px-10 md:py-32">
        <Encabezado
          id="demo-titulo"
          titulo="Mirá cómo trabaja."
          bajada="Una sesión de verdad: el agente corriendo comandos y escribiendo archivos en tu repo."
        />
        <figure className="mt-12">
          <div className="overflow-hidden rounded-[var(--radius-ventana)] shadow-[0_30px_80px_-24px_rgba(11,13,16,0.55)] ring-1 ring-app-espuma/10">
            <img
              src={CAPTURA.src}
              width={CAPTURA.ancho}
              height={CAPTURA.alto}
              alt="La app de Dolphin trabajando: a la izquierda los proyectos con sus ramas, en el medio el chat con el agente corriendo comandos y escribiendo archivos, y a la derecha el árbol del repo."
              className="block w-full"
            />
          </div>
          <figcaption className="mt-3 inline-flex rounded-full bg-lienzo/80 px-3 py-1 text-[13px] text-tinta backdrop-blur-sm">
            La app de verdad, con un agente corriendo.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
