/**
 * Las capturas reales de la app que usa la home (`public/capturas/app-12-11/`). De qué fixture
 * salió cada una, y cómo regenerarlas: el LEEME.md de esa carpeta. Desde el 12/11/2026 (noche) son
 * todas de la app de escritorio: las de la app de terminal salieron de la home.
 *
 * `escala` es cuántos píxeles de la imagen hay por píxel de pantalla en la app: 2 para las
 * fixtures (se sacan con `--scale 2`). De ahí sale el ancho al que se ve nítida
 * (`ancho / escala`), que es el tope al que se la muestra.
 */
export interface Captura {
  readonly src: string;
  readonly ancho: number;
  readonly alto: number;
  readonly escala: number;
  /** Qué muestra, para un lector de pantalla. */
  readonly alt: string;
  /** Un recorte pensado para el celular (~380 px de pantalla): la imagen entera achicada no se lee. */
  readonly celular?: { readonly src: string; readonly ancho: number; readonly alto: number };
}

const D = "/capturas/app-12-11/";

const fixture = (nombre: string, ancho: number, alto: number, alt: string): Captura => ({
  src: `${D}${nombre}.webp`,
  ancho,
  alto,
  escala: 2,
  alt,
});

const conCelular = (c: Captura, nombre: string, ancho: number, alto: number): Captura => ({
  ...c,
  celular: { src: `${D}${nombre}.webp`, ancho, alto },
});

export const CAPTURAS = {
  inicio: conCelular(
    fixture(
      "inicio",
      2560,
      1656,
      "El inicio de Dolphin: dos agentes corriendo, uno que necesita permiso, el tablero de la tienda de ejemplo con sus cinco columnas y el cuadro para pedir una tarea.",
    ),
    "inicio-cel",
    760,
    980,
  ),
  compositor: conCelular(
    fixture("compositor", 1380, 250, "El cuadro del inicio para pedir una tarea, con el proyecto, el destino y el agente."),
    "compositor-cel",
    760,
    250,
  ),
  tableroArrastre: conCelular(
    fixture(
      "tablero-arrastre",
      1500,
      530,
      "El tablero a mitad de un arrastre: la tarjeta «Paginar la lista de pedidos» va de Para hacer a Haciendo.",
    ),
    "tablero-arrastre-cel",
    760,
    530,
  ),
  cola: fixture("cola", 1024, 276, "Tres mensajes en cola para el agente, cada uno con su botón para mandarlo ya y para borrarlo."),
  portonReboto: fixture(
    "porton-reboto",
    872,
    290,
    "El portón cortado en test: cinco fases en verde, test en rojo con el motivo y dos fases que no llegaron a correr.",
  ),
  pr: fixture(
    "pr",
    800,
    556,
    "La tarjeta del PR 214: la rama, +86 −21 en cuatro archivos, nueve checks que pasaron y uno corriendo, esperando revisión.",
  ),
  revisiones: fixture(
    "revisiones",
    748,
    568,
    "La ventanita de un espacio de trabajo: su PR, su issue y dos puertos en vivo, node en el 3104 y postgres en el 5434.",
  ),
  issue: fixture("issue", 800, 404, "La tarjeta del issue 198, con sus etiquetas, el hito y el PR que lo va a cerrar."),
  ola: fixture("ola", 920, 600, "La ola del inicio, dibujada en puntos."),
  delfines: fixture(
    "delfines",
    2296,
    1518,
    "La página Delfines: cuatro bots con su estado, cuándo les toca, lo que gastaron este mes contra su tope, lo último que dijeron y los botones Hablarle y Correr en tu servidor.",
  ),
  llevarAlServidor: fixture(
    "llevar-al-servidor",
    951,
    907,
    "La ventana Correr Vigía en tu servidor: cinco chequeos en verde (Linux con systemd, Node, Claude Code con sesión, servicios de usuario, sigue corriendo sin sesión), la carpeta donde trabaja y el botón Correrlo en vps-ana.",
  ),
  ctrlK: fixture(
    "ctrl-k",
    1192,
    490,
    "El cuadrito de Ctrl+K en el editor: el pedido «validá que el token no venga vacío» y el cambio como diff, una línea que sale y tres que entran, con Descartar y Aceptar.",
  ),
  pocaRam: fixture(
    "poca-ram",
    1085,
    848,
    "El aviso Te queda poca RAM: 1,1 GB libres de 16, el espacio que más usa y los botones Dormirlo acá y Correr en vps-ana.",
  ),
} as const satisfies Record<string, Captura>;
