import { CAPTURAS } from "./capturas";
import { type Celda, Grilla } from "./Grilla";
import { PAISAJES } from "./Lamina";
import { VIDEOS } from "./videos";

/**
 * «Y además»: la grilla de tres columnas, cada celda un recorte real de la app sobre un pedazo
 * de paisaje, con un título corto y una línea.
 *
 * Desde el 14/11/2026 va sólo lo que impresiona al ver la app trabajando (Nico: «ahí tienen que ir
 * las cosas buenas»): salieron el portón en las tarjetas, las ocho fases, las cifras del inicio y
 * la tarjeta de ejemplo de un perfil nuevo. La primera celda es el chat con la terminal al lado y
 * ocupa dos columnas. Las celdas con clip lo bajan recién al entrar en vista (`preload="none"`) y
 * muestran el póster mientras tanto; con movimiento reducido no arrancan solas.
 *
 * De dónde sale cada clip: `public/videos/app-12-11/LEEME.md`; cada captura:
 * `public/capturas/app-12-11/LEEME.md`.
 */
const CELDAS: readonly Celda[] = [
  {
    titulo: "El chat, con la terminal al lado",
    linea: "Le pedís en un chat y al lado corre tu PowerShell: los tests se ponen rojos mientras escribe y terminan en verde.",
    pieza: { video: VIDEOS.chatTerminal },
    paisaje: PAISAJES.lago,
    foco: "50% 60%",
    ancha: true,
  },
  {
    titulo: "Un agente por rama",
    linea: "Cada tarea en su espacio: mientras uno trabaja, mirás lo que entregaron los otros.",
    pieza: { video: VIDEOS.varios },
    paisaje: PAISAJES.andes,
    foco: "70% 50%",
  },
  {
    titulo: "Revisiones y puertos",
    linea: "Al pasar por un espacio ves su PR, su issue y los puertos que tiene abiertos.",
    pieza: { captura: CAPTURAS.revisiones },
    paisaje: PAISAJES.meandro,
    foco: "75% 50%",
  },
  {
    titulo: "El issue y su PR",
    linea: "La tarjeta del issue dice en qué hito está y qué PR lo va a cerrar.",
    pieza: { captura: CAPTURAS.issue },
    paisaje: PAISAJES.merced,
    foco: "25% 50%",
    ancha: true,
  },
];

export function Ademas() {
  return (
    <section id="ademas" aria-labelledby="ademas-titulo" className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <h2 id="ademas-titulo" className="titulo-seccion text-center">
          Y además
        </h2>
        <Grilla celdas={CELDAS} />
      </div>
    </section>
  );
}
