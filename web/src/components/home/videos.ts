/**
 * Los videos reales de la app que usa la home (`public/videos/app-12-11/`). Cómo se grabó cada uno
 * y cómo regenerarlo: el LEEME.md de esa carpeta.
 *
 * `escala`, como en capturas.ts: píxeles del video por píxel de pantalla en la app.
 */
export interface Video {
  readonly mp4: string;
  readonly webm: string;
  readonly poster: string;
  readonly ancho: number;
  readonly alto: number;
  readonly escala: number;
  /** Qué se ve, para un lector de pantalla. */
  readonly alt: string;
}

const D = "/videos/app-12-11/";

const video = (nombre: string, ancho: number, alto: number, escala: number, alt: string): Video => ({
  mp4: `${D}${nombre}.mp4`,
  webm: `${D}${nombre}.webm`,
  poster: `${D}${nombre}.webp`,
  ancho,
  alto,
  escala,
  alt,
});

export const VIDEOS = {
  portada: video(
    "portada",
    1600,
    1000,
    // La grabación es a 1x (ventana de 1600×1000): se deja crecer hasta el ancho del marco.
    1,
    "Dolphin con una tienda de ejemplo: desde Tareas se le da «Comenzar» a un issue con Claude y a otro con Codex, los dos trabajan a la vez cada uno en su rama, y el de Codex termina con 17 tests en verde y su PR abierto.",
  ),
  issue: video(
    "issue",
    1280,
    800,
    1,
    "Desde Tareas, «Comenzar» en un issue abre la ventana para crear el espacio, se elige Claude y se abre su chat en una rama nueva.",
  ),
  pr: video(
    "pr",
    1280,
    800,
    1,
    "Con el trabajo de Codex terminado, «Crear PR» arma el pull request desde la app y queda abierto, el #7.",
  ),
  chatTerminal: video(
    "chat-terminal",
    1280,
    800,
    1,
    "A la izquierda, el chat con Claude haciendo el issue de exportar pedidos a CSV; a la derecha, PowerShell con los tests corriendo solos: se ponen rojos mientras escribe y terminan en verde.",
  ),
  cola: video(
    "cola",
    960,
    600,
    1,
    "Mientras el agente trabaja, un mensaje nuevo queda en cola con «Enviar ahora» y la papelera, y entra cuando el agente termina.",
  ),
  varios: video(
    "varios",
    1280,
    800,
    1,
    "La barra lateral con tres espacios de la tienda, cada uno en su rama: uno trabajando en los cupones y dos que ya terminaron, con lo que hizo cada agente.",
  ),
  ctrlK: video(
    "ctrl-k",
    960,
    600,
    1,
    "En el editor se seleccionan tres líneas, Ctrl+K, se pide «que no distinga mayúsculas en el sku» y la propuesta aparece encima del código; Aceptar la deja escrita.",
  ),
  revertir: video(
    "revertir",
    960,
    600,
    1,
    "Se cambia una línea, aparece la rayita naranja en el margen, un clic muestra cómo estaba antes y «Revertir este cambio» la devuelve.",
  ),
  definicion: video(
    "definicion",
    960,
    600,
    1,
    "Con el cursor sobre ivaDe, F12 abre iva.ts en la línea donde está definida la función.",
  ),
  buscar: video(
    "buscar",
    1280,
    800,
    1,
    "En el panel de archivos, «ped» deja sólo pedidos.ts y su test; en Contenido, «filter» lista cada línea donde aparece, y un clic abre el archivo en esa línea.",
  ),
} as const satisfies Record<string, Video>;
