import { anchoDe, anchoDeTexto, mezclar, type Bufer, type Estilo, type Rgb } from "./celdas.js";
import { T } from "./piezas.js";

/**
 * Lo que dice un agente, dibujado como lo dibuja Claude Code: cada cosa que hace es un bloque con
 * su marca y, colgando debajo con «⎿», lo que le pasó. Una herramienta se lee «Bash(npm test)»
 * con un círculo vacío mientras corre, un tilde si salió bien y una cruz si falló; una edición muestra su
 * diff en rojo y verde; la lista de tareas se tilda; lo que piensa va en cursiva. Lo usan la
 * terminal de cada agente y el chat, para que las dos hablen igual.
 */

/** Un pedazo de renglón con un solo estilo. */
export interface Tramo extends Estilo {
  readonly texto: string;
}

export interface LineaDeTranscripcion {
  readonly t: number;
  readonly tramos: readonly Tramo[];
  /** Un fondo para el renglón entero desde la columna `desde` (el diff, lo que escribiste vos). */
  readonly fondo?: { readonly bg: Rgb; readonly desde: number };
}

/** Un renglón de la terminal de un agente (lo que guarda la sesión). */
export interface RenglonDeVoz {
  readonly t: number;
  readonly tipo: string;
  readonly texto: string;
  readonly ref?: string;
}

// En Windows, «⏺» no está en las fuentes de la consola y se dibuja ancho: Claude Code usa «●» ahí.
export const PUNTO = process.platform === "win32" ? "●" : "⏺";
const COLGANTE = "  ⎿  ";
const SANGRIA = "     ";
const FONDO_MAS: Rgb = [26, 52, 34];
const FONDO_MENOS: Rgb = [62, 30, 30];
const CODIGO: Rgb = [150, 170, 255];

/**
 * El markdown de un renglón: **negrita**, `código`, un título (#) en negrita y una viñeta (- o *)
 * como «•». No es un parser entero: es lo que escribe un agente en una línea.
 */
export function tramosDeMarkdown(texto: string, fg: Rgb, base: Estilo = {}): Tramo[] {
  const titulo = /^\s{0,3}#{1,6}\s+(.*)$/.exec(texto);
  if (titulo) return tramosDeMarkdown(titulo[1]!, fg, { ...base, negrita: true });
  const vineta = /^(\s*)[-*]\s+(.*)$/.exec(texto);
  if (vineta) return [{ ...base, texto: `${vineta[1]}• `, fg: T.suave }, ...tramosDeMarkdown(vineta[2]!, fg, base)];
  const tramos: Tramo[] = [];
  for (const parte of texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!parte) continue;
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) tramos.push({ ...base, texto: parte.slice(2, -2), fg, negrita: true });
    else if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2) tramos.push({ ...base, texto: parte.slice(1, -1), fg: CODIGO });
    else tramos.push({ ...base, texto: parte, fg });
  }
  return tramos;
}

/** Parte tramos en renglones de `ancho` columnas, por palabras, sin perder el estilo de cada una. */
export function envolver(tramos: readonly Tramo[], ancho: number): Tramo[][] {
  const lineas: Tramo[][] = [[]];
  let usado = 0;
  const cortar = () => {
    // El espacio que quedó al final del renglón no se ve, pero estiraría su fondo y su ancho.
    const actual = lineas.at(-1)!;
    while (actual.length > 0 && !actual.at(-1)!.texto.trim()) actual.pop();
    lineas.push([]);
    usado = 0;
  };
  for (const tramo of tramos) {
    for (const ficha of tramo.texto.split(/(\s+)/)) {
      if (!ficha) continue;
      const w = anchoDeTexto(ficha);
      if (usado + w <= ancho) {
        lineas.at(-1)!.push({ ...tramo, texto: ficha });
        usado += w;
        continue;
      }
      // El espacio donde se corta no pasa al renglón siguiente.
      if (!ficha.trim()) {
        cortar();
        continue;
      }
      if (usado > 0) cortar();
      let pedazo = "";
      let columnas = 0;
      for (const ch of ficha) {
        const a = anchoDe(ch);
        if (columnas + a > ancho && pedazo) {
          lineas.at(-1)!.push({ ...tramo, texto: pedazo });
          cortar();
          pedazo = "";
          columnas = 0;
        }
        pedazo += ch;
        columnas += a;
      }
      if (pedazo) lineas.at(-1)!.push({ ...tramo, texto: pedazo });
      usado = columnas;
    }
  }
  return lineas;
}

/**
 * Un bloque: el primer renglón lleva `cabeza` (el punto, o el «⎿») y los que siguen la sangría del
 * mismo ancho, como Claude Code cuando un texto no entra.
 */
export function bloque(t: number, cabeza: readonly Tramo[], cuerpo: readonly Tramo[], ancho: number, fondo?: LineaDeTranscripcion["fondo"]): LineaDeTranscripcion[] {
  const sangria = cabeza.reduce((n, x) => n + anchoDeTexto(x.texto), 0);
  return envolver(cuerpo, Math.max(8, ancho - sangria)).map((tramos, i) => ({
    t,
    tramos: [...(i === 0 ? cabeza : [{ texto: " ".repeat(sangria), fg: T.texto }]), ...tramos],
    ...(fondo ? { fondo } : {}),
  }));
}

/** «Bash: npm test» → Bash(npm test); «Edit src/a.ts» → Edit(src/a.ts). */
export function partirHerramienta(texto: string): { nombre: string; arg: string } {
  const m = /^([\w.-]+)(?::\s*|\s+)(.*)$/s.exec(texto);
  return m ? { nombre: m[1]!, arg: m[2]!.trim() } : { nombre: texto, arg: "" };
}

/**
 * La marca de una herramienta: la FORMA dice en qué estado está, el color sólo la acompaña.
 *
 * Era un punto para los tres estados y el único que distinguía era el color, que es justo lo que
 * no se puede leer de un vistazo en una terminal con cualquier tema —y lo que no ve nadie que no
 * distinga rojo de verde—. Es el mismo contrato que el chat de escritorio: círculo vacío mientras
 * corre, tilde cuando salió, cruz cuando no.
 */
export type MarcaDeHerramienta = { readonly glifo: string; readonly fg: Rgb };

/** Las tres formas. En Windows las fuentes de consola no traen «⏺», y éstas sí. */
export const CORRIENDO = "○";
export const HECHA = "✓";
export const FALLO = "✕";

export function marcaDeHerramienta(
  herramienta: RenglonDeVoz,
  siguientes: readonly RenglonDeVoz[],
  corriendo: boolean,
  t: number,
): MarcaDeHerramienta {
  const respuesta = herramienta.ref
    ? siguientes.find((x) => x.ref === herramienta.ref && (x.tipo === "resultado" || x.tipo === "error" || x.tipo === "listo"))
    : siguientes.find((x) => x.tipo !== "diff" && x.tipo !== "tareas");
  if (respuesta?.tipo === "error") return { glifo: FALLO, fg: T.rojo };
  if (respuesta) return { glifo: HECHA, fg: T.verde };
  // Mientras corre titila, que es lo que distingue «está pasando ahora» de «quedó así».
  if (corriendo) return { glifo: CORRIENDO, fg: Math.floor(t / 500) % 2 === 0 ? T.naranja : T.naranjaTenue };
  // Sin respuesta y con el agente parado: quedó sin contestar. La forma es la de corriendo porque
  // eso es lo que pasó —nunca llegó una respuesta—, pero apagada.
  return { glifo: CORRIENDO, fg: T.suave };
}

/** El diff de una edición: el resumen colgando y cada renglón con su fondo. */
function lineasDeDiff(r: RenglonDeVoz, ancho: number): LineaDeTranscripcion[] {
  const [resumen = "", ...resto] = r.texto.split("\n");
  const salida = bloque(r.t, [{ texto: COLGANTE, fg: T.tenue }], [{ texto: resumen, fg: T.suave }], ancho);
  for (const renglon of resto) {
    const signo = renglon[0] === "+" || renglon[0] === "-" ? `${renglon[0]} ` : renglon.slice(0, 2);
    const cuerpo = renglon.slice(2);
    if (renglon.startsWith("… ")) {
      salida.push({ t: r.t, tramos: [{ texto: SANGRIA, fg: T.tenue }, { texto: renglon, fg: T.tenue }] });
      continue;
    }
    const fondo = signo === "+ " ? FONDO_MAS : signo === "- " ? FONDO_MENOS : undefined;
    const fg = signo === "+ " ? [190, 235, 200] as Rgb : signo === "- " ? [245, 190, 190] as Rgb : T.suave;
    const marca = signo === "+ " ? "+" : signo === "- " ? "-" : " ";
    salida.push(...bloque(r.t, [{ texto: SANGRIA, fg: T.tenue }, { texto: `${marca} `, fg: signo === "+ " ? T.verde : signo === "- " ? T.rojo : T.tenue }], [{ texto: cuerpo || " ", fg }], ancho, fondo ? { bg: fondo, desde: SANGRIA.length } : undefined));
  }
  return salida;
}

/** La lista de tareas: ☒ hecha (tachada), ◼ la que está en curso, ☐ lo que falta. */
function lineasDeTareas(r: RenglonDeVoz, ancho: number): LineaDeTranscripcion[] {
  return r.texto.split("\n").flatMap((renglon, i) => {
    const cabeza: Tramo = { texto: i === 0 ? COLGANTE : SANGRIA, fg: T.tenue };
    const texto = renglon.slice(4);
    if (renglon.startsWith("[x]")) return bloque(r.t, [cabeza, { texto: "☒ ", fg: T.verde }], [{ texto, fg: T.tenue, tachado: true }], ancho);
    if (renglon.startsWith("[~]")) return bloque(r.t, [cabeza, { texto: "◼ ", fg: T.naranja }], [{ texto, fg: T.texto, negrita: true }], ancho);
    return bloque(r.t, [cabeza, { texto: "☐ ", fg: T.suave }], [{ texto, fg: T.suave }], ancho);
  });
}

/** Renglones con sangría colgando: el primero con «⎿», los demás alineados abajo. */
function colgando(r: RenglonDeVoz, ancho: number, fg: Rgb): LineaDeTranscripcion[] {
  return r.texto.split("\n").flatMap((renglon, i) => bloque(r.t, [{ texto: i === 0 ? COLGANTE : SANGRIA, fg: T.tenue }], [{ texto: renglon, fg: renglon.startsWith("… +") ? T.tenue : fg }], ancho));
}

/**
 * Con herramientas en paralelo llega «A, B, resultado de A, resultado de B»: cada resultado (con su
 * id) se muda a debajo de su herramienta, como lo muestra Claude Code.
 */
function enOrden(renglones: readonly RenglonDeVoz[]): RenglonDeVoz[] {
  const respuestas = new Map<string, RenglonDeVoz[]>();
  const conDueno = new Set(renglones.filter((r) => r.tipo === "herramienta" && r.ref).map((r) => r.ref!));
  const esRespuesta = (r: RenglonDeVoz) => !!r.ref && conDueno.has(r.ref) && (r.tipo === "resultado" || r.tipo === "error" || r.tipo === "listo");
  for (const r of renglones) if (esRespuesta(r)) respuestas.set(r.ref!, [...(respuestas.get(r.ref!) ?? []), r]);
  const salida: RenglonDeVoz[] = [];
  renglones.forEach((r, i) => {
    if (esRespuesta(r)) return;
    salida.push(r);
    // Después de la herramienta y de su diff o su lista, lo que le contestaron.
    const siguiente = renglones[i + 1];
    const cierra = r.ref && (r.tipo === "herramienta" || r.tipo === "diff" || r.tipo === "tareas") && !(siguiente?.ref === r.ref && (siguiente.tipo === "diff" || siguiente.tipo === "tareas"));
    if (cierra) salida.push(...(respuestas.get(r.ref!) ?? []));
  });
  return salida;
}

/**
 * La terminal de un agente hecha renglones de Claude Code. `corriendo`: el agente sigue trabajando
 * (la última herramienta sin respuesta titila). Entre bloque y bloque, un renglón en blanco.
 */
export function lineasDeTerminal(crudos: readonly RenglonDeVoz[], ancho: number, t: number, corriendo: boolean): LineaDeTranscripcion[] {
  const renglones = enOrden(crudos);
  const salida: LineaDeTranscripcion[] = [];
  const blanco = (tt: number) => salida.length > 0 && salida.push({ t: tt, tramos: [] });
  renglones.forEach((r, i) => {
    const anterior = renglones[i - 1];
    switch (r.tipo) {
      case "texto": {
        // Los renglones seguidos de un mismo texto son un solo bloque, con un solo punto.
        const sigue = anterior?.tipo === "texto";
        if (!sigue) blanco(r.t);
        salida.push(...bloque(r.t, [{ texto: sigue ? "  " : `${PUNTO} `, fg: T.texto }], tramosDeMarkdown(r.texto, T.texto), ancho));
        break;
      }
      case "pensando":
        blanco(r.t);
        salida.push(...bloque(r.t, [{ texto: `${CORRIENDO} `, fg: T.tenue }], [{ texto: r.texto, fg: T.suave, cursiva: true }], ancho));
        break;
      case "herramienta": {
        blanco(r.t);
        const { nombre, arg } = partirHerramienta(r.texto);
        const marca = marcaDeHerramienta(r, renglones.slice(i + 1), corriendo, t);
        salida.push(...bloque(r.t, [{ texto: `${marca.glifo} `, fg: marca.fg }], [{ texto: nombre, fg: T.texto, negrita: true }, ...(arg ? [{ texto: `(${arg})`, fg: T.suave }] : [])], ancho));
        break;
      }
      case "resultado":
        if (anterior?.tipo !== "herramienta" && anterior?.tipo !== "diff" && anterior?.tipo !== "tareas") blanco(r.t);
        salida.push(...colgando(r, ancho, T.suave));
        break;
      case "error":
        if (anterior?.tipo !== "herramienta" && anterior?.tipo !== "diff") blanco(r.t);
        salida.push(...colgando(r, ancho, T.rojo));
        break;
      case "diff":
        salida.push(...lineasDeDiff(r, ancho));
        break;
      case "tareas":
        salida.push(...lineasDeTareas(r, ancho));
        break;
      case "compactado":
        // Con su propia marca y una regla al costado: no es algo que dijo el agente, es algo que
        // le PASÓ, y mezclarlo con lo que dice hace que se lea como una frase más.
        blanco(r.t);
        salida.push(
          ...bloque(
            r.t,
            [{ texto: "⟳ ", fg: T.violeta }],
            [{ texto: r.texto, fg: T.tenue, cursiva: true }],
            ancho,
          ),
        );
        break;
      case "listo":
        // Solo dice que la herramienta terminó bien: pinta su punto de verde, no ocupa renglón.
        break;
      default:
        // Lo que dice Dolphin en la terminal de un agente (el plan, el portón): un rombo azul.
        if (anterior?.tipo !== "dolphin") blanco(r.t);
        salida.push(...bloque(r.t, [{ texto: "◆ ", fg: T.azul }], tramosDeMarkdown(r.texto, T.suave), ancho));
    }
  });
  return salida;
}

/**
 * Dibuja un renglón en (x, y). `k` (0 a 1) es cuánto se ve: lo nuevo entra fundiéndose desde
 * `fondoBase`. Devuelve las columnas que usó.
 */
export function pintarLinea(b: Bufer, x: number, y: number, ancho: number, linea: LineaDeTranscripcion, fondoBase: Rgb, k = 1): number {
  if (linea.fondo) for (let c = linea.fondo.desde; c < ancho; c++) b.poner(x + c, y, " ", { bg: mezclar(fondoBase, linea.fondo.bg, k) });
  let col = 0;
  for (const tramo of linea.tramos) {
    if (col >= ancho) break;
    const bg = tramo.bg ?? (linea.fondo && col >= linea.fondo.desde ? linea.fondo.bg : undefined);
    col += b.texto(x + col, y, tramo.texto, { ...tramo, fg: mezclar(fondoBase, tramo.fg ?? T.texto, k), ...(bg ? { bg: mezclar(fondoBase, bg, k) } : {}) }, ancho - col);
  }
  return col;
}
