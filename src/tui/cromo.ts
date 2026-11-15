import { anchoDeTexto, mezclar, partirEnRenglones, recortar, type Bufer, type Rgb } from "./celdas.js";
import { haceCuanto, type Instantanea } from "./datos.js";
import { pintarDelfin3d } from "./delfin3d.js";
import { progresoDe } from "./equipo-estado.js";
import { renglonesDeLaCola, type Encolado } from "./cola-de-mensajes.js";
import { atajos, barra, brillo, colorDeDueno, colorDeTono, giro, panel, pastilla, reloj, T, type Rect, type Zona } from "./piezas.js";
import { COMANDOS, nombreDeCuenta, type Mensaje, type Sesion } from "./sesion.js";
import { cuentaEnUso, CUENTA_DE_SIEMPRE } from "../nucleo/cuentas.js";
import { bloque, pintarLinea, PUNTO, tramosDeMarkdown, type LineaDeTranscripcion } from "./transcripcion.js";

/**
 * Lo que rodea a las vistas. La cáscara va en grises, como la app de escritorio: la barra de
 * arriba, el prompt, el pie, el inicio (el delfín de puntos girando, la marca y el prompt al
 * centro, como OpenCode) y el chat con el delfín girando al costado. Adentro, lo que pasa tiene
 * color, como en Claude Code: verde lo que pasó, rojo lo que falló, ámbar los avisos, y cada
 * compañero del equipo el suyo.
 */

/**
 * Las secciones del CLI. Son TRES desde el 09/11/2026, por pedido de Nico: elegir modelo, orquestar
 * o no, y entrar a cada agente. Lo que había —Tablero, Historial, Memoria, Bandeja y Git— se fue de
 * la barra: cada una era una vista de datos que la app de escritorio ya muestra mejor, y en una
 * terminal competían con lo único que se hace acá, que es pedir algo y mirar a los agentes
 * trabajar. Sus módulos siguen en el repo: lo que se sacó es la puerta, no el cuarto.
 */
export const VISTAS = ["inicio", "chat", "equipo"] as const;
export type Vista = (typeof VISTAS)[number];
const NOMBRE: Record<Vista, string> = { inicio: "Inicio", chat: "Chat", equipo: "Equipo" };

export function barraDeArriba(b: Bufer, datos: Instantanea, sesion: Sesion, vista: Vista, t: number, irA: (v: Vista) => void): Zona[] {
  let x = 2;
  x += b.texto(x, 0, "dolphin", { fg: T.acento, negrita: true });
  x += 2;
  x += b.texto(x, 0, recortar(sesion.config.sinRepo ? "sin proyecto" : datos.nombre, 28), { fg: sesion.config.sinRepo ? T.amarillo : T.suave });
  if (datos.rama && !sesion.config.sinRepo) b.texto(x, 0, recortar(`  ⎇ ${datos.rama}`, 30), { fg: T.tenue });

  // A la derecha: lo que está corriendo, el agente y el modo.
  const { agente, automatico } = sesion.config;
  let derecha = b.ancho - 2;
  const ponerDerecha = (texto: string, fg: Rgb): void => {
    derecha -= anchoDeTexto(texto);
    b.texto(derecha, 0, texto, { fg });
    derecha -= 3;
  };
  if (automatico) ponerDerecha("sin permisos", T.rojo);
  ponerDerecha(agente === "mentira" ? "agente de mentira" : agente, T.suave);
  if (sesion.ocupada && sesion.trabajo) {
    const texto = `${sesion.trabajo.tipo} ${reloj(t - sesion.trabajo.desde)}`;
    derecha -= anchoDeTexto(texto) + 2;
    b.poner(derecha, 0, giro(t), { fg: T.naranja });
    brillo(b, derecha + 2, 0, texto, t);
  }

  // Las pestañas: la activa es una pastilla clara; la que tiene algo corriendo, con un punto.
  const zonas: Zona[] = [];
  x = 1;
  for (const [i, v] of VISTAS.entries()) {
    const etiqueta = `${i + 1} ${NOMBRE[v]}`;
    const activa = v === vista;
    const corriendo = sesion.ocupada && (v === "equipo" || v === "chat");
    const largo = activa ? pastilla(b, x, 1, etiqueta, T.fondo, T.acento, true) : b.texto(x + 1, 1, etiqueta, { fg: T.suave }) + 2;
    if (corriendo && !activa) b.poner(x + largo - 1, 1, "•", { fg: T.naranja });
    zonas.push({ x, y: 1, w: largo, h: 1, accion: () => irA(v) });
    x += largo + 1;
    if (x > b.ancho - 4) break;
  }
  for (let i = 0; i < b.ancho; i++) b.poner(i, 2, "─", { fg: T.linea });
  return zonas;
}

// --- El prompt ---

export interface EstadoPrompt {
  texto: string;
  cursor: number;
  foco: boolean;
  /** La sugerencia elegida de la lista de comandos. */
  sugerencia: number;
}

export function sugerencias(texto: string): typeof COMANDOS[number][] {
  if (!texto.startsWith("/") || /\s/.test(texto)) return [];
  return COMANDOS.filter((c) => c.nombre.startsWith(texto));
}

export function dibujarPrompt(b: Bufer, r: Rect, p: EstadoPrompt, ocupada: boolean, t: number, alTocar: () => void, sinRepo = false, mandado = 0, esperaDale = false, pendientes: readonly Encolado[] = []): Zona[] {
  const dentro = panel(b, r, { foco: p.foco });
  // Al mandar, el borde destella y se apaga: el pedido salió.
  const destello = Math.max(0, 1 - (t - mandado) / 420);
  if (destello > 0) b.caja(r.x, r.y, r.w, r.h, mezclar(T.foco, T.claro, destello));
  b.texto(dentro.x - 1, dentro.y, "›", { fg: p.foco ? T.acento : T.tenue, negrita: true });
  const ancho = dentro.w - 1;
  if (!p.texto) {
    const guia = esperaDale
      ? "El plan espera: «dale» para arrancar, «no» para dejarlo."
      : sinRepo
      ? "Elegí un proyecto de la lista (↑↓ y enter, o un clic), o escribí /abrir D:/ruta/al/repo"
      : ocupada
        ? "Dolphin está trabajando. Escribí igual: lo guardo y sale cuando termine."
        // La guía dice las dos cosas que se pueden escribir —un pedido y una ruta con @—, como en
        // la referencia de Qoder que mandó Nico. Lo que el pedido PROVOCA ya lo dicen las tres
        // pastillas de arriba, así que acá no se repite.
        : "Escribí tu mensaje o @ruta/al/archivo    · / para comandos";
    b.texto(dentro.x + 2, dentro.y, recortar(guia, ancho - 2), { fg: T.tenue });
    if (p.foco && Math.floor(t / 530) % 2 === 0) b.poner(dentro.x + 1, dentro.y, " ", { bg: T.acento });
  } else {
    // Si el texto no entra, se ve el final (donde está el cursor), como en cualquier campo.
    const letras = [...p.texto];
    const inicio = Math.max(0, p.cursor - ancho + 2);
    const visible = letras.slice(inicio, inicio + ancho - 1);
    // Un comando se ve distinto de un pedido: la palabra del comando en color.
    const finDelComando = p.texto.startsWith("/") ? [...p.texto.split(/\s/)[0]!].length : 0;
    visible.forEach((ch, i) => b.poner(dentro.x + 1 + i, dentro.y, ch, { fg: inicio + i < finDelComando ? T.violeta : T.texto }));
    if (p.foco) b.poner(dentro.x + 1 + p.cursor - inicio, dentro.y, letras[p.cursor] ?? " ", { fg: T.fondo, bg: T.acento });
  }

  // Lo que escribiste mientras trabajaba, arriba del prompt y apagado: está escrito, no mandado.
  // Va APAGADO y no en el color del texto por eso mismo — que se vea igual que lo ya mandado es
  // justo lo que hace creer que salió.
  const enEspera = renglonesDeLaCola(pendientes, Math.max(0, Math.min(4, r.y - 5)));
  enEspera.forEach((linea, i) => {
    const y = r.y - enEspera.length + i;
    b.texto(r.x + 2, y, "⇢ ", { fg: T.tenue });
    b.texto(r.x + 4, y, recortar(linea.texto, r.w - 24), { fg: T.suave, cursiva: true });
  });
  if (enEspera.length > 0) {
    const nota = ` ${pendientes.length} esperando · sale al terminar `;
    b.texto(Math.max(r.x, r.x + r.w - nota.length - 1), r.y - enEspera.length - 1, nota, { fg: T.tenue });
  }

  // Las sugerencias de comandos, flotando arriba del prompt.
  const lista = p.foco ? sugerencias(p.texto) : [];
  if (lista.length > 0) {
    const alto = lista.length + 2;
    const caja = panel(b, { x: r.x, y: r.y - alto, w: Math.min(r.w, 80), h: alto }, { titulo: "comandos" });
    lista.forEach((c, i) => {
      const elegida = i === p.sugerencia % lista.length;
      if (elegida) b.rellenar(caja.x - 1, caja.y + i, caja.w + 2, 1, T.pastilla);
      b.texto(caja.x, caja.y + i, c.uso.padEnd(24), { fg: elegida ? T.violeta : T.texto, negrita: elegida });
      b.texto(caja.x + 24, caja.y + i, recortar(c.que, caja.w - 24), { fg: T.suave });
    });
  }
  return [{ ...r, accion: alTocar }];
}

/**
 * La ultima fila: mientras el agente trabaja dice QUE esta pasando; el resto del tiempo, los
 * atajos.
 *
 * Why no siempre los atajos: medido contra el CLI de Qoder (docs/tui-de-qoder-por-dentro.md), su
 * barra tiene 56 textos distintos y casi ninguno es un atajo —son el contexto usado, hace cuanto
 * que el modelo piensa, en que modo de permisos esta—. La nuestra decia seis atajos y nada mas,
 * asi que la fila que mas se mira no informaba nada de lo que estaba pasando.
 */
export function pie(
  b: Bufer,
  vista: Vista,
  focoEnVista: boolean,
  ocupada: boolean,
  sesion?: Sesion,
  t = 0,
): void {
  const y = b.alto - 1;
  if (ocupada && sesion && trabajando(b, y, sesion, t)) {
    return;
  }
  const lista: [string, string][] = [];
  if (focoEnVista && vista === "equipo") {
    lista.push(["←→", "elegir agente"], ["enter", "su terminal"], ["d", "deshacer"], ["r", "revisar"], ["esc", "volver"], ["tab", "al prompt"]);
  } else {
    lista.push(["enter", "mandar"], ["/", "comandos"]);
    if (vista === "chat") lista.push(["repág", "subir"]);
  }
  lista.push([`1-${VISTAS.length}`, "secciones"], ["ctrl+k", "buscar"], ["f1", "ayuda"], ["ctrl+c", ocupada ? "cortar" : "salir"]);
  atajos(b, 2, y, b.ancho - 4, lista);
}

/**
 * Lo que esta pasando ahora, a la izquierda, y con que esta trabajando, a la derecha.
 *
 * Devuelve false si no hay nada que contar, y entonces la barra vuelve a los atajos: una fila que
 * dice «trabajando» sin decir en que ni hace cuanto ocupa el mismo lugar y sirve menos.
 */
function trabajando(b: Bufer, y: number, sesion: Sesion, t: number): boolean {
  const desde = sesion.trabajo && !sesion.trabajo.terminado ? sesion.trabajo.desde : sesion.pensandoDesde;
  if (desde === null || desde === undefined) {
    return false;
  }
  const titulo = sesion.trabajo && !sesion.trabajo.terminado ? sesion.trabajo.titulo : "Pensando";
  let x = 2 + b.texto(2, y, `${giro(t)} `, { fg: T.marca });
  x += b.texto(x, y, recortar(titulo, Math.max(10, b.ancho - 46)), { fg: T.texto });
  // El cronometro y como cortar, juntos: cuanto lleva esto solo preocupa, y preocupa menos
  // sabiendo que se corta con una tecla.
  x += b.texto(x + 1, y, `(esc para cortar, ${reloj(Date.now() - desde)})`, { fg: T.tenue }) + 1;

  // A la derecha, con que esta trabajando: el modo de permisos primero, que es lo que cambia que
  // puede hacer sin preguntar.
  const agente = sesion.lider ?? sesion.config.agente;
  const modo = sesion.config.automatico ? "sin permisos" : "pregunta";
  const derecha = `${modo} · ${agente}`;
  const xd = b.ancho - 2 - anchoDeTexto(derecha);
  if (xd > x + 2) {
    b.texto(xd, y, derecha, { fg: sesion.config.automatico ? T.rojo : T.suave });
  }
  return true;
}

// --- El inicio: el delfín girando, la marca y el prompt al centro ---

// Las letras de la marca: 4 de ancho y 6 de alto, cuadradas (con la «p» que baja),
// pero cada píxel es un bloque entero de 2 columnas: trazo gordo y sin aplastar.
const LETRAS: Record<string, string[]> = {
  d: ["...#", "...#", "####", "#..#", "####", "...."],
  o: ["....", "....", "####", "#..#", "####", "...."],
  l: ["#", "#", "#", "#", "#", "."],
  p: ["....", "....", "####", "#..#", "####", "#..."],
  h: ["#...", "#...", "####", "#..#", "#..#", "...."],
  i: ["#", ".", "#", "#", "#", "."],
  n: ["....", "....", "####", "#..#", "#..#", "...."],
};
const ALTO_MARCA = 6;

/** «dolphin» en bloques, en grises de arriba abajo, con un brillo que la cruza inclinado. */
function marca(b: Bufer, y: number, t: number): void {
  const palabra = "dolphin";
  const ancho = [...palabra].reduce((s, l) => s + LETRAS[l]![0]!.length + 1, -1) * 2;
  const desde = Math.floor((b.ancho - ancho) / 2);
  let x0 = desde;
  const brilloX = ((t / 14) % (ancho + 70)) - 35;
  for (const letra of palabra) {
    const filas = LETRAS[letra]!;
    const w = filas[0]!.length;
    for (let fy = 0; fy < ALTO_MARCA; fy++) {
      for (let fx = 0; fx < w * 2; fx++) {
        if (filas[fy]![Math.floor(fx / 2)] !== "#") continue;
        // Cada renglón es un bloque: arriba un gris y abajo otro, así el degradé es parejo.
        const k = Math.max(0, 1 - Math.abs(x0 + fx - desde - brilloX + fy * 2) / 7);
        const tono = (mitad: number) => mezclar(mezclar([228, 228, 228], [112, 112, 112], (fy * 2 + mitad) / 11), T.claro, k);
        b.poner(x0 + fx, y + fy, "▀", { fg: tono(0), bg: tono(1) });
      }
    }
    x0 += (w + 1) * 2;
  }
}

const contar = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

/**
 * El delfín en movimiento: gira tranquilo y, mientras el equipo trabaja, más rápido y con un pulso
 * de luz. Sin permisos (--dangerously-skip-permissions) es rojo: que se note siempre.
 */
const movimiento = (sesion: Sesion, t: number, abierta: number) => ({
  armadoDesde: abierta,
  ...(sesion.config.automatico ? { oscuro: [78, 26, 26] as Rgb, claro: [255, 104, 104] as Rgb } : {}),
  vueltasPorSegundo: sesion.ocupada ? 0.42 : 1 / 7,
  pulso: sesion.ocupada ? 0.5 + 0.5 * Math.sin(t / 260) : 0,
});

/** Alto del encabezado de dos columnas: lo que ocupa el delfín, que es la columna más alta. */
const ALTO_ENCABEZADO = 6;

/** Donde arranca la caja de la derecha, medida desde el borde izquierdo del encabezado. */
const COLUMNA_DE_LA_CAJA = 48;

/** Ancho del delfin. Why 20 y no menos: el dibujo es 3D y abajo de eso pierde la forma. */
const ANCHO_DEL_DELFIN = 20;

/** Qué hace Dolphin, en una línea. */
const LEMA = "Le pedís algo: un equipo de agentes lo hace, lo prueba, y te deja la rama lista.";

/** Lo que se puede pedir, dicho en una línea cada uno. Numerados: se leen de un vistazo. */
const PARA_EMPEZAR: readonly string[] = [
  "Escribí lo que querés y Dolphin arma el equipo",
  "/ para los comandos, @ruta para darle un archivo",
  "Cada pedido sale en su propia rama, ya probada",
  "Cuanto más preciso el pedido, mejor la rama",
];

/**
 * El encabezado del inicio: el delfín y quién sos a la izquierda, qué podés pedir a la derecha.
 *
 * El delfín queda chico y a un costado a propósito. Grande y centrado se lo comía todo, y lo que
 * alguien necesita de esta pantalla no es el logo: es saber qué escribir.
 */
function encabezadoDeInicio(
  b: Bufer,
  x: number,
  y: number,
  ancho: number,
  sesion: Sesion,
  t: number,
  abierta: number,
): void {
  const anchoDelfin = ANCHO_DEL_DELFIN;
  pintarDelfin3d(b, x, y, anchoDelfin, ALTO_ENCABEZADO, t, movimiento(sesion, t, abierta));

  // Al lado del delfín, en su fila media: el nombre, la versión y con qué está trabajando.
  const xi = x + anchoDelfin + 2;
  const filaNombre = y + Math.floor(ALTO_ENCABEZADO / 2) - 1;
  // Why recortar al hueco que queda y no a un numero fijo: un texto mas largo que ese hueco se
  // dibuja ENCIMA del borde de la caja, y queda una pantalla rota en vez de una palabra cortada.
  const hueco = Math.max(0, COLUMNA_DE_LA_CAJA - (xi - x) - 2);
  b.texto(xi, filaNombre, recortar("Dolphin", hueco), { fg: T.texto, negrita: true });

  // La caja de la derecha: el título va DENTRO del borde, en el azul de la marca.
  // La columna de la caja arranca siempre en el mismo lugar, no detras del texto mas largo: asi
  // la pantalla no se reacomoda sola cuando cambia el lema o el nombre del agente.
  const xCaja = x + COLUMNA_DE_LA_CAJA;
  const anchoCaja = ancho - COLUMNA_DE_LA_CAJA;
  if (anchoCaja < 30) return;
  b.caja(xCaja, y, anchoCaja, ALTO_ENCABEZADO, T.borde, { titulo: "Para empezar", colorTitulo: T.marca });
  PARA_EMPEZAR.forEach((linea, i) => {
    if (i + 1 >= ALTO_ENCABEZADO - 1) return;
    b.texto(xCaja + 2, y + 1 + i, `${i + 1}.`, { fg: T.tenue });
    b.texto(xCaja + 5, y + 1 + i, recortar(linea, anchoCaja - 7), { fg: T.texto });
  });
}

/** Lo que el inicio necesita de la app: dónde va el prompt (al centro) y qué se puede tocar. */
export interface InicioDibujado {
  readonly prompt: Rect;
  readonly zonas: Zona[];
}

export function vistaInicio(
  b: Bufer,
  area: Rect,
  datos: Instantanea,
  sesion: Sesion,
  t: number,
  opciones: {
    abierta: number;
    seleccion?: number;
    abrir?: (ruta: string) => void;
    /** Pasa al modelo siguiente de MODELOS_PRINCIPALES. */
    otroModelo?: () => void;
    /** Prende o apaga que el pedido lo reparta un equipo. */
    alternarOrquestar?: () => void;
    /** Va a la sección de los agentes. */
    verAgentes?: () => void;
  },
): InicioDibujado {
  const sinRepo = sesion.config.sinRepo === true;
  const listaAlto = sinRepo ? Math.min(8, Math.max(3, datos.proyectos.length + 2)) : 0;
  // Dos columnas arriba —el delfín con quién sos a la izquierda, qué podés pedir a la derecha— y
  // el prompt debajo. Es la forma del CLI de Qoder (docs/tui-de-qoder.md) y resuelve lo que el
  // centrado no: con el delfín grande al medio, la pantalla de inicio no decía NADA de lo que se
  // puede hacer, y era justo la pantalla que mira alguien que todavía no sabe.
  // El encabezado va pegado a la izquierda y no centrado: centrado, el delfin y la caja quedan
  // separados por un hueco que crece con la pantalla, y dejan de leerse como una sola fila.
  const x0 = area.x + 2;
  const anchoTotal = area.w - 4;
  // Why arriba y no centrado: centrado deja diez renglones vacios arriba y empuja el prompt al
  // medio; abajo es donde aparece la conversacion apenas se escribe algo, asi que ese espacio no
  // esta de mas, esta reservado.
  let y = area.y + 1;

  encabezadoDeInicio(b, x0, y, anchoTotal, sesion, t, opciones.abierta);
  y += ALTO_ENCABEZADO + 1;
  // Why el lema acá abajo y no al lado del nombre: en esa columna entran 24 caracteres y la frase
  // quedaba cortada a la mitad. Acá se lee entera, y es lo único que explica qué hace esto.
  b.texto(x0, y, recortar(LEMA, anchoTotal), { fg: T.suave });
  y += 2;

  // Why alineado con el encabezado y no centrado: con el encabezado a la izquierda y el prompt
  // al medio, los dos bloques se leen como si fueran de dos pantallas distintas.
  const prompt: Rect = { x: x0, y, w: anchoTotal, h: 3 };
  y += 3;
  // Abajo del prompt, las TRES cosas que el CLI deja elegir y nada más: con qué modelo, si lo
  // reparte un equipo, y entrar a ver a los agentes. Son pastillas y no comandos escondidos porque
  // son las decisiones que se toman antes de cada pedido, no una vez en la vida.
  const controles: Zona[] = [];
  const pastillaDeOpcion = (x: number, texto: string, encendida: boolean, accion?: () => void): number => {
    const largo = encendida
      ? pastilla(b, x, y, texto, T.fondo, T.acento)
      : b.texto(x + 1, y, texto, { fg: T.suave }) + 2;
    if (accion) controles.push({ x, y, w: largo, h: 1, accion });
    return largo + 2;
  };
  let cx = prompt.x + 1;
  const agente = sesion.config.agente === "mentira" ? "agente de mentira" : sesion.config.agente;
  cx += pastillaDeOpcion(cx, sesion.lider ?? agente, sesion.lider !== null, opciones.otroModelo);
  cx += pastillaDeOpcion(cx, sesion.orquestar ? "orquesta" : "un agente", sesion.orquestar, opciones.alternarOrquestar);
  const cuantos = sesion.equipo?.tareas.length ?? 0;
  pastillaDeOpcion(cx, cuantos > 0 ? contar(cuantos, "agente", "agentes") : "agentes", false, opciones.verAgentes);
  y += 2;
  if (!sinRepo) return { prompt, zonas: controles };
  return {
    prompt,
    zonas: [...controles, ...proyectosParaElegir(b, { x: prompt.x, y, w: prompt.w, h: listaAlto }, datos, opciones.seleccion ?? 0, opciones.abrir ?? (() => {}))],
  };
}

/** Abierto fuera de un repo: los proyectos de ~/.dolphin (los mismos que la app de escritorio), para elegir uno. */
function proyectosParaElegir(b: Bufer, caja: Rect, datos: Instantanea, seleccion: number, abrir: (ruta: string) => void): Zona[] {
  const r = panel(b, caja, { titulo: "elegí un proyecto", foco: true });
  if (datos.proyectos.length === 0) {
    b.texto(r.x, r.y, recortar("Todavía no tenés proyectos. Escribí /abrir D:/ruta/al/repo, o abrí dolphin adentro de uno.", r.w), { fg: T.suave });
    return [];
  }
  const zonas: Zona[] = [];
  const desde = Math.max(0, Math.min(seleccion - r.h + 1, datos.proyectos.length - r.h));
  for (let i = desde; i < datos.proyectos.length && i - desde < r.h; i++) {
    const p = datos.proyectos[i]!;
    const fila = r.y + i - desde;
    const elegido = i === seleccion;
    if (elegido) b.rellenar(r.x - 1, fila, r.w + 2, 1, T.pastilla);
    b.texto(r.x, fila, recortar(p.nombre, 24).padEnd(26), { fg: elegido ? T.acento : T.texto, negrita: elegido });
    b.texto(r.x + 26, fila, recortar(p.ruta, r.w - 26), { fg: T.tenue });
    zonas.push({ x: r.x - 1, y: fila, w: r.w + 2, h: 1, accion: () => abrir(p.ruta) });
  }
  return zonas;
}

// --- El chat ---

const FONDO_TUYO: Rgb = [30, 30, 30];

/**
 * Los renglones del chat ya partidos al ancho, como Claude Code: lo tuyo con «›» sobre una franja
 * gris, lo de Dolphin con su punto (el color dice cómo salió) y lo del sistema colgando con «⎿»
 * del mensaje de arriba. Lo de abajo es lo más nuevo.
 */
function renglonesDelChat(mensajes: readonly Mensaje[], ancho: number): LineaDeTranscripcion[] {
  const salida: LineaDeTranscripcion[] = [];
  const colgar = (m: Mensaje, fg: Rgb) =>
    m.texto.split("\n").forEach((r, i) => salida.push(...bloque(m.t, [{ texto: i === 0 ? "  ⎿  " : "     ", fg: T.tenue }], tramosDeMarkdown(r, fg), ancho)));
  // Un paso de Dolphin que sigue a otro es parte de lo mismo: cuelga del primero, no abre otro punto.
  let pasoAbierto = false;
  for (const m of mensajes) {
    if (m.quien === "sistema") {
      colgar(m, T.suave);
      continue;
    }
    const tono = m.tono ?? "normal";
    if (m.quien === "dolphin" && tono === "normal" && pasoAbierto) {
      colgar(m, T.texto);
      continue;
    }
    if (salida.length > 0) salida.push({ t: m.t, tramos: [] });
    pasoAbierto = m.quien === "dolphin" && tono === "normal";
    if (m.quien === "vos") {
      m.texto.split("\n").forEach((r, i) => salida.push(...bloque(m.t, [{ texto: i === 0 ? "› " : "  ", fg: T.suave, negrita: true }], [{ texto: r || " ", fg: T.texto }], ancho, { bg: FONDO_TUYO, desde: 0 })));
      continue;
    }
    // El punto lleva el color de cómo salió; el texto queda blanco salvo un error o un aviso.
    const punto = tono === "normal" ? T.naranja : colorDeTono(tono);
    const fg = tono === "mal" || tono === "aviso" ? colorDeTono(tono) : T.texto;
    m.texto.split("\n").forEach((r, i) => salida.push(...bloque(m.t, [{ texto: i === 0 ? `${PUNTO} ` : "  ", fg: punto }], tramosDeMarkdown(r, fg), ancho)));
  }
  return salida;
}

/** Las tareas del equipo debajo del «trabajando», como la lista de tareas de Claude Code. */
function lineasDeTareasDelEquipo(sesion: Sesion, ancho: number, t: number): LineaDeTranscripcion[] {
  const tareas = sesion.equipo?.tareas ?? [];
  return tareas.slice(0, 6).map((x, i) => {
    const hecha = x.estado === "lista" || x.estado === "integrada";
    const mal = x.estado === "no-salio" || x.estado === "choco" || x.estado === "en-conflicto";
    const marca = hecha ? { ch: "☒ ", fg: T.verde } : x.estado === "trabajando" ? { ch: "◼ ", fg: T.naranja } : mal ? { ch: "✗ ", fg: T.rojo } : { ch: "☐ ", fg: T.suave };
    const quien = recortar(x.dueno, 9).padEnd(10);
    const titulo = i === 5 && tareas.length > 6 ? `… y ${tareas.length - 5} más` : x.titulo;
    return {
      t,
      tramos: [
        { texto: i === 0 ? "  ⎿  " : "     ", fg: T.tenue },
        { texto: marca.ch, fg: marca.fg },
        { texto: quien, fg: colorDeDueno(x.dueno), negrita: true },
        { texto: recortar(titulo, Math.max(8, ancho - 17)), fg: hecha ? T.tenue : x.estado === "trabajando" ? T.texto : T.suave, tachado: hecha || x.estado === "deshecha", negrita: x.estado === "trabajando" },
      ],
    };
  });
}

/** La barra del costado del chat: el delfín girando y lo que está pasando. */
function costado(b: Bufer, r: Rect, datos: Instantanea, sesion: Sesion, t: number, abierta: number): void {
  const dentro = panel(b, r);
  const altoDelfin = Math.min(12, Math.max(6, Math.floor(r.h * 0.3)));
  const anchoDelfin = Math.min(dentro.w, Math.round(altoDelfin * 2.5));
  pintarDelfin3d(b, dentro.x + Math.floor((dentro.w - anchoDelfin) / 2), dentro.y, anchoDelfin, altoDelfin, t, movimiento(sesion, t, abierta));
  let y = dentro.y + altoDelfin + 1;
  const fila = (etiqueta: string, valor: string, fg: Rgb = T.texto) => {
    if (y >= dentro.y + dentro.h) return;
    b.texto(dentro.x, y, etiqueta, { fg: T.tenue });
    b.texto(dentro.x + 10, y++, recortar(valor, dentro.w - 10), { fg });
  };
  fila("proyecto", sesion.config.sinRepo ? "sin proyecto" : datos.nombre);
  if (datos.rama && !sesion.config.sinRepo) fila("rama", datos.rama, T.suave);
  fila("agente", sesion.config.agente === "mentira" ? "de mentira" : sesion.config.agente, sesion.config.agente === "mentira" ? T.suave : T.naranja);
  fila("permisos", sesion.config.automatico ? "no los pide" : "los pide", sesion.config.automatico ? T.rojo : T.suave);
  // Con más de una cuenta, cuál está usando (cambia sola si una se queda sin cupo).
  const cuenta = cuentaEnUso();
  if (cuenta && cuenta.id !== CUENTA_DE_SIEMPRE) fila("cuenta", nombreDeCuenta(cuenta), T.suave);
  y++;

  const equipo = sesion.equipo;
  if (equipo && (sesion.ocupada || equipo.fin)) {
    if (y < dentro.y + dentro.h) {
      const titulo = equipo.fin ? (equipo.fin.rama ? "✓ el equipo terminó" : "× no salió") : `equipo · ${equipo.etapa ?? "plan"}`;
      b.texto(dentro.x, y++, recortar(titulo, dentro.w), { fg: equipo.fin ? (equipo.fin.rama ? T.verde : T.rojo) : T.suave, negrita: true });
    }
    for (const x of equipo.tareas) {
      if (y + 1 >= dentro.y + dentro.h) break;
      const c = b.texto(dentro.x, y, x.dueno, { fg: colorDeDueno(x.dueno), negrita: true });
      b.texto(dentro.x + c + 1, y, recortar(x.titulo, dentro.w - c - 1), { fg: T.texto });
      const color = x.estado === "trabajando" ? T.naranja : x.estado === "no-salio" || x.estado === "choco" ? T.rojo : x.estado === "esperando" ? T.tenue : T.verde;
      barra(b, dentro.x, y + 1, dentro.w, progresoDe(x), color);
      y += 2;
    }
    return;
  }
  if (y < dentro.y + dentro.h) b.texto(dentro.x, y++, "lo último", { fg: T.suave, negrita: true });
  for (const a of datos.actividad) {
    if (y >= dentro.y + dentro.h) break;
    const cuando = haceCuanto(a.en);
    b.poner(dentro.x, y, "●", { fg: a.tono === "bien" ? T.verde : a.tono === "mal" ? T.rojo : T.azul });
    b.texto(dentro.x + 2, y, recortar(a.titulo, dentro.w - cuando.length - 3), { fg: T.texto });
    b.texto(dentro.x + dentro.w - cuando.length, y++, cuando, { fg: T.tenue });
  }
}

/**
 * La caja de bienvenida de un chat vacío: el saludo y en qué carpeta estás.
 *
 * Why una caja punteada y no un título centrado: es la forma de la referencia que mandó Nico
 * (Qoder CLI), y dice lo único que hace falta saber antes de escribir —dónde está parado esto—,
 * que es justo lo que un título centrado no decía. El borde punteado la separa de la conversación
 * sin pesar como un panel: lo de adentro no es contenido, es el encabezado de lo que viene.
 */
function bienvenida(b: Bufer, area: Rect, sesion: Sesion): void {
  const ancho = Math.min(74, area.w - 2);
  const x = area.x + Math.max(0, Math.floor((area.w - ancho) / 2));
  const y = area.y + 1;
  const alto = 4;
  for (let i = 0; i < ancho; i++) {
    b.poner(x + i, y, "╌", { fg: T.borde });
    b.poner(x + i, y + alto - 1, "╌", { fg: T.borde });
  }
  for (let j = 1; j < alto - 1; j++) {
    b.poner(x, y + j, "╎", { fg: T.borde });
    b.poner(x + ancho - 1, y + j, "╎", { fg: T.borde });
  }
  let cx = x + 3;
  cx += b.texto(cx, y + 1, "✦ ", { fg: T.verde });
  b.texto(cx, y + 1, "Dolphin", { fg: T.acento, negrita: true });
  const donde = sesion.config.sinRepo ? "sin proyecto" : sesion.config.repo;
  b.texto(x + 3, y + 2, recortar(`carpeta: ${donde}`, ancho - 6), { fg: T.tenue });
}

export function vistaChat(b: Bufer, area: Rect, datos: Instantanea, sesion: Sesion, desplazamiento: number, t: number, abierta: number): void {
  const conCostado = area.w >= 96;
  const anchoCostado = conCostado ? Math.min(40, Math.floor(area.w * 0.32)) : 0;
  if (conCostado) costado(b, { x: area.x + area.w - anchoCostado, y: area.y, w: anchoCostado, h: area.h }, datos, sesion, t, abierta);
  const libre = area.w - anchoCostado - (conCostado ? 2 : 0);
  const ancho = Math.min(100, libre);
  const r: Rect = { x: area.x + Math.floor((libre - ancho) / 2), y: area.y, w: ancho, h: area.h };
  if (sesion.mensajes.length === 0) {
    bienvenida(b, r, sesion);
    return;
  }
  const anchoTexto = r.w - 2;
  const lineas = renglonesDelChat(sesion.mensajes, anchoTexto);
  const tareas = sesion.ocupada && !sesion.esperaDale && !!sesion.trabajo && !sesion.trabajo.terminado ? lineasDeTareasDelEquipo(sesion, anchoTexto, t) : [];
  const conEstado = sesion.ocupada || !!sesion.pensandoDesde || sesion.esperaDale;
  const alto = r.h - (conEstado ? 2 + tareas.length : 0);
  const fin = Math.max(0, lineas.length - desplazamiento);
  const desde = Math.max(0, fin - alto);
  for (let i = desde; i < fin; i++) {
    const l = lineas[i]!;
    // Lo que recién llega entra fundiéndose desde el fondo.
    pintarLinea(b, r.x + 1, r.y + (alto - (fin - desde)) + (i - desde), anchoTexto, l, T.fondo, Math.min(1, Math.max(0, (t - l.t) / 280)));
  }
  // El estado, como el de Claude Code: «✻ Haciendo… (00:12 · lo que va · ctrl+c corta)».
  const y = r.y + r.h - 1 - tareas.length;
  const entreParentesis = (x: number, partes: string[]) => b.texto(x, y, recortar(` (${partes.join(" · ")})`, r.x + r.w - x), { fg: T.tenue });
  if (sesion.esperaDale) {
    b.poner(r.x + 1, y, "◆", { fg: T.amarillo });
    const c = b.texto(r.x + 3, y, "El plan espera tu «dale»", { fg: T.amarillo, negrita: true });
    entreParentesis(r.x + 3 + c, ["«no» para dejarlo"]);
  } else if (sesion.ocupada && sesion.trabajo) {
    const equipo = sesion.equipo;
    const hechas = equipo?.tareas.length ? `${equipo.tareas.filter((x) => x.estado === "lista" || x.estado === "integrada").length}/${equipo.tareas.length} tareas` : "";
    b.poner(r.x + 1, y, giro(t), { fg: T.naranja });
    const c = brillo(b, r.x + 3, y, `${sesion.equipo && sesion.equipo.tareas.length > 1 ? "El equipo está trabajando" : "Trabajando"}…`, t, T.naranjaTenue, T.naranja);
    entreParentesis(r.x + 3 + c, [reloj(t - sesion.trabajo.desde), ...(equipo?.etapa ? [equipo.etapa] : []), ...(hechas ? [hechas] : []), "ctrl+c corta"]);
    tareas.forEach((l, i) => pintarLinea(b, r.x + 1, y + 1 + i, anchoTexto, l, T.fondo));
  } else if (sesion.pensandoDesde) {
    b.poner(r.x + 1, y, giro(t), { fg: T.naranja });
    const c = brillo(b, r.x + 3, y, "Dolphin está pensando qué hace falta…", t, T.naranjaTenue, T.naranja);
    entreParentesis(r.x + 3 + c, [reloj(t - sesion.pensandoDesde)]);
  }
  if (desplazamiento > 0) b.texto(r.x + r.w - 18, r.y, ` ↓ ${desplazamiento} renglones `, { fg: T.fondo, bg: T.suave });
}

// --- Ventanas: la paleta (Ctrl+K) y la ayuda ---

export interface EntradaDePaleta {
  readonly texto: string;
  readonly nota?: string;
  readonly hacer: () => void;
}

export function filtrarPaleta(entradas: readonly EntradaDePaleta[], filtro: string): EntradaDePaleta[] {
  const f = filtro.trim().toLowerCase();
  if (!f) return [...entradas];
  // Primero lo que coincide más adelante en el texto: «bandeja» trae «Ir a bandeja» antes que «Anotar … en la bandeja».
  return entradas
    .map((e) => ({ e, donde: `${e.texto} ${e.nota ?? ""}`.toLowerCase().indexOf(f) }))
    .filter((x) => x.donde >= 0)
    .sort((x, y) => x.donde - y.donde)
    .map((x) => x.e);
}

export function dibujarPaleta(b: Bufer, entradas: readonly EntradaDePaleta[], filtro: string, seleccion: number, alElegir: (i: number) => void): Zona[] {
  const ancho = Math.min(72, b.ancho - 6);
  const alto = Math.min(18, b.alto - 6);
  const r = panel(b, { x: Math.floor((b.ancho - ancho) / 2), y: 4, w: ancho, h: alto }, { titulo: "buscar", foco: true });
  b.texto(r.x, r.y, "› ", { fg: T.acento, negrita: true });
  b.texto(r.x + 2, r.y, filtro, { fg: T.texto });
  b.poner(r.x + 2 + anchoDeTexto(filtro), r.y, " ", { bg: T.acento });
  if (!filtro) b.texto(r.x + 4, r.y, "secciones, comandos, proyectos…", { fg: T.tenue });
  const lista = filtrarPaleta(entradas, filtro);
  const zonas: Zona[] = [];
  const visibles = r.h - 2;
  const desde = Math.max(0, Math.min(seleccion - visibles + 1, lista.length - visibles));
  for (let i = desde; i < lista.length && i - desde < visibles; i++) {
    const e = lista[i]!;
    const y = r.y + 2 + i - desde;
    const elegida = i === seleccion;
    if (elegida) b.rellenar(r.x - 1, y, r.w + 2, 1, T.pastilla);
    b.texto(r.x, y, recortar(e.texto, r.w - 16), { fg: elegida ? T.acento : T.texto, negrita: elegida });
    if (e.nota) b.texto(r.x + r.w - Math.min(16, anchoDeTexto(e.nota)), y, recortar(e.nota, 16), { fg: e.nota.startsWith("/") ? T.violeta : T.tenue });
    zonas.push({ x: r.x - 1, y, w: r.w + 2, h: 1, accion: () => alElegir(i) });
  }
  if (lista.length === 0) b.texto(r.x, r.y + 2, "Nada con eso.", { fg: T.suave });
  return zonas;
}

const AYUDA: [string, string][] = [
  ["escribir + enter", "le pedís algo: un equipo lo parte, lo hace y lo prueba"],
  ["/memoria <regla>", "una regla para el proyecto (la ven las dos apps)"],
  ["/idea <idea>", "a la bandeja, para después"],
  ["/abrir <ruta>", "trabajar sobre otro repo"],
  ["1 … 7", "las secciones (con el prompt vacío) · alt+número siempre"],
  ["ctrl+k", "buscar secciones, comandos y proyectos"],
  ["tab", "pasar del prompt a la lista y volver"],
  ["↑ ↓ · rueda", "mover en las listas · subir en el chat"],
  ["ctrl+c", "borrar el prompt · cortar lo que corre · salir"],
  ["--dangerously-skip-permissions", "el agente no pide permisos (el portón sigue)"],
];

export function dibujarAyuda(b: Bufer): void {
  const ancho = Math.min(84, b.ancho - 6);
  const r = panel(b, { x: Math.floor((b.ancho - ancho) / 2), y: 4, w: ancho, h: AYUDA.length + 4 }, { titulo: "ayuda", foco: true });
  AYUDA.forEach(([tecla, que], i) => {
    b.texto(r.x, r.y + i, tecla, { fg: tecla.startsWith("/") ? T.violeta : T.acento, negrita: true });
    b.texto(r.x + 32, r.y + i, recortar(que, r.w - 32), { fg: T.texto });
  });
  b.texto(r.x, r.y + r.h - 1, "esc para cerrar", { fg: T.tenue });
}
