import { Encabezado, Seccion } from "./Encabezado";
import { Logo } from "./Logo";
import { TarjetaSobrePaisaje } from "./TarjetaSobrePaisaje";

/**
 * Qué se le puede pedir a Dolphin, en tres frases.
 *
 * La forma —tarjeta acrílica sobre un paisaje, una fila por cosa con su tilde— la eligió Nico el
 * 09/11/2026. Es la forma de MOSTRAR funciones: va acá y en los carteles flotantes de la app, no
 * adentro de una pantalla de trabajo.
 *
 * Son tres y no doce a propósito. El catálogo completo está más abajo, con sus 141 funciones; acá
 * va lo que alguien contesta cuando le preguntan «¿y para qué sirve?».
 */
/** La foto del fondo. Está en public/paisajes, con su origen y licencia en LEEME.md. */
const PAISAJE = "/paisajes/niebla.webp";

const PEDIDOS = [
  {
    titulo: "Arreglá algo que falla",
    texto:
      "Lo reproduce, encuentra la causa y deja el arreglo con la prueba que lo cubre. Nada llega sin cruzar el portón.",
  },
  {
    titulo: "Revisá lo que hay",
    texto:
      "Qué está mal, qué falta y qué conviene tocar primero, leyendo el repo entero y no el archivo que tenías abierto.",
  },
  {
    titulo: "Hacelo de punta a punta",
    texto:
      "Lo piensa, lo parte entre varios agentes, lo escribe, lo prueba y te deja la rama lista para mirar.",
  },
] as const;

export function QuePuedePedirle() {
  return (
    <Seccion id="que-pedirle" tonal>
      <Encabezado
        id="que-pedirle"
        titulo="¿Y qué le pido?"
        bajada="Lo mismo que le pedirías a alguien del equipo. Escrito como se lo dirías."
      />
      <TarjetaSobrePaisaje
        className="mt-10"
        paisaje={PAISAJE}
        // Quién hace el trabajo, arriba de lo que se le pide: sin esto la tarjeta es una lista de
        // tres frases sobre una foto y no se entiende a quién se las estás diciendo.
        encabezado={
          <>
            <Logo className="size-4" />
            <span>Dolphin</span>
          </>
        }
        filas={PEDIDOS}
      />
    </Seccion>
  );
}
