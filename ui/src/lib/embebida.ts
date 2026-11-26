/**
 * La consola adentro de la app de escritorio de Dolphin.
 *
 * La app la abre con `?embebida=1&tema=claro|oscuro`: así deja de verse como una
 * web pegada. Sigue el tema de la app, no repite la marca ni el proyecto (ya los
 * muestra la barra de la app) y le pide a la app lo que no puede hacer sola:
 * levantarse de nuevo si se cayó y abrirse en el navegador.
 *
 * Sola en el navegador, nada de esto aplica: oscura, con su marca y su selector.
 */

const parametros = new URLSearchParams(window.location.search);

/** ¿Está adentro de la app de escritorio? */
export const embebida = parametros.get("embebida") === "1";

/**
 * ¿Va sin la barra de vistas?
 *
 * En el lienzo del escritorio cada ventana ES una vista (`?barra=0`): su barra sería el mismo
 * menú repetido en cada ventana, y en una chica se come la mitad del alto. En cualquier otro
 * lado la barra va, que es por donde se navega.
 */
export const sinBarra = parametros.get("barra") === "0";

export type Tema = "claro" | "oscuro";
export type VistaDeLaApp = "tareas" | "nueva" | "bandeja" | "tablero" | "cosechas" | "memoria" | "bots" | "git";

let tareaNuevaPendiente: string | null = null;
let aplicarTareaNueva: ((texto: string) => void) | null = null;

/**
 * Poner la consola en una vista desde afuera.
 *
 * Es un canal propio y no el `#hash` porque el hash lo pisa la propia consola al arrancar, y en
 * el lienzo del escritorio —donde cada ventana es una vista— eso dejaba a dos ventanas
 * mostrando lo mismo. Igual que `dolphinTema`, lo llama la app con executeJavaScript.
 */
let aplicarVista: ((vista: VistaDeLaApp) => void) | null = null;

export function registrarVista(aplicar: (vista: VistaDeLaApp) => void): () => void {
  aplicarVista = aplicar;
  (window as unknown as { dolphinVista?: (v: string) => void }).dolphinVista = (v) => aplicarVista?.(v as VistaDeLaApp);
  return () => {
    if (aplicarVista === aplicar) aplicarVista = null;
  };
}

export function dolphinNuevaTarea(texto: string): void {
  if (aplicarTareaNueva) {
    aplicarTareaNueva(texto);
  } else {
    tareaNuevaPendiente = texto;
  }
}

export function tomarTareaNuevaPendiente(): string | null {
  const texto = tareaNuevaPendiente;
  tareaNuevaPendiente = null;
  return texto;
}

export function registrarCampoNuevaTarea(aplicar: (texto: string) => void): () => void {
  aplicarTareaNueva = aplicar;
  return () => {
    if (aplicarTareaNueva === aplicar) aplicarTareaNueva = null;
  };
}

/** Los colores de la escena (el mar y el delfín), leídos del tema: el lienzo no ve las clases. */
export interface ColoresDeEscena {
  readonly delfin: string;
  readonly espuma: string;
  readonly punto: string;
}

let escena: ColoresDeEscena | null = null;

function leerEscena(): ColoresDeEscena {
  const estilo = getComputedStyle(document.documentElement);
  const de = (variable: string, siNo: string) => estilo.getPropertyValue(variable).trim() || siNo;
  return {
    delfin: de("--escena", "#a8cdea"),
    espuma: de("--escena-espuma", "#fafafa"),
    punto: de("--escena-punto", "#fafafa"),
  };
}

/** Se lee una vez por tema, no en cada cuadro: getComputedStyle cuesta. */
export function coloresDeEscena(): ColoresDeEscena {
  return (escena ??= leerEscena());
}

export function ponerTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema;
  escena = null;
}

/** El tema con que la abrió la app. Sin parámetro queda el oscuro de siempre. */
export function ponerTemaInicial(): void {
  // Marca para el CSS: embebida, el texto toma la letra de la app (ver el final de app.css).
  if (embebida) document.documentElement.dataset.embebida = "";
  const tema = parametros.get("tema");
  if (tema === "claro" || tema === "oscuro") ponerTema(tema);
  // La app cambia de tema sin recargar la consola: llama a esto con executeJavaScript.
  (window as unknown as { dolphinTema?: (tema: Tema) => void }).dolphinTema = (nuevo) => {
    if (nuevo === "claro" || nuevo === "oscuro") ponerTema(nuevo);
  };
  (window as unknown as { dolphinNuevaTarea?: (texto: string) => void }).dolphinNuevaTarea = dolphinNuevaTarea;
  // Con la pintura de fondo de la app, la consola es transparente y sus superficies son velos
  // sobre el vidrio, como cualquier otra página (Nico, 26/11/2026: «no tiene ni el fondo»).
  if (embebida) ponerVidrio(parametros.get("vidrio") === "1");
  (window as unknown as { dolphinVidrio?: (si: boolean) => void }).dolphinVidrio = (si) => {
    if (embebida) ponerVidrio(si === true);
  };
}

function ponerVidrio(si: boolean): void {
  if (si) {
    document.documentElement.dataset.vidrio = "";
  } else {
    delete document.documentElement.dataset.vidrio;
  }
}

/**
 * Algo que tiene que hacer la app, no la consola.
 *
 * Why por la consola del navegador: la app ya escucha el `console-message` del
 * webview; un canal propio pediría un preload en una página que también se abre
 * sola en el navegador. La app solo atiende estos dos textos exactos.
 */
export function pedirALaApp(que: "recargar" | "abrir-afuera" | `vista:${VistaDeLaApp}`): void {
  console.info(`dolphin:app:${que}`);
}
