import { Encabezado } from "./Encabezado";
import { Logo } from "./Logo";
import { TarjetaSobrePaisaje } from "./TarjetaSobrePaisaje";

/**
 * Qué tiene ese chat abajo: una consola de verdad.
 *
 * Nico pidió contarlo (09/11/2026: «contá cómo funciona lo de un chat bonito con la potencia del
 * PowerShell»), y enseguida pidió lo contrario de un muro de texto: «hay mucho texto en la web y
 * pocas imágenes de las que me gustan». Así que lo cuenta la forma que eligió él —tarjeta
 * acrílica sobre un paisaje, una fila por cosa— y cada fila dice lo suyo en una línea.
 *
 * Las tres son hechos del producto, no promesas: los shells son los que la app detecta de verdad
 * (pwsh, Git Bash y WSL en Windows; bash o zsh en macOS y Linux), el repo entero es lo que el
 * agente lee, y la rama con el portón es el camino por el que pasa todo lo que escribe. Si alguna
 * deja de ser cierta, se saca de acá antes que de ningún otro lado.
 */
const FILAS = [
  {
    titulo: "Corre en tu terminal, no en un sandbox",
    texto: "PowerShell, Git Bash o WSL. El comando exacto queda a la vista.",
  },
  {
    titulo: "Lee el repo entero",
    texto: "Busca y abre lo que necesita. No le pegás nada en el prompt.",
  },
  {
    titulo: "Y nada toca tu rama",
    texto: "Lo que escribe cruza el portón antes de que lo mires.",
  },
] as const;

export function ChatConTerminal() {
  // La foto va en la tarjeta y no también de fondo de la sección: con las dos, la misma postal
  // aparecía dos veces en la misma pantalla y la tarjeta perdía el borde contra su propio fondo.
  return (
    <section id="chat" aria-labelledby="chat-titulo" className="scroll-mt-20 px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto w-full max-w-[1200px]">
        <Encabezado
          id="chat-titulo"
          titulo="Un chat con una consola abajo."
          bajada="La comodidad de escribirle como a una persona, con lo que puede hacer alguien sentado en tu terminal."
        />
        <TarjetaSobrePaisaje
          className="mt-10"
          paisaje="/paisajes/mar.webp"
          encabezado={
            <>
              <Logo className="size-4" />
              <span>En tu máquina</span>
            </>
          }
          filas={FILAS}
        />
      </div>
    </section>
  );
}
