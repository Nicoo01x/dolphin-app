import { crearTarjeta, comentarTarjeta, buscarTarjeta, leerTablero, COLUMNAS, type Columna, type Tarjeta } from "./tarjetas.js";
import { parecidasA, yaEstaAnotada, type Parecida } from "./parecidas.js";

/**
 * El tablero, para un asistente conectado por MCP.
 *
 * Sirve para lo que más cuesta cuando trabajás con un agente: que lo que descubre mientras hace
 * otra cosa («de paso vi que el login no valida el mail») no se pierda en el chat. Con esto lo
 * anota en el tablero y sigue; la decisión de hacerlo o no sigue siendo tuya.
 *
 * **Qué se le concede y qué no.** Un asistente por MCP es código de afuera hablándole a tu
 * proyecto, así que puede LEER el tablero y SUMAR: anotar una idea y comentar una tarjeta. No
 * puede mover de columna, editar, borrar ni tomar una tarjeta:
 * - mover a Hecho es decir «esto terminó», y eso lo dicen el portón o vos;
 * - mover a Para hacer es asignarse trabajo solo, que es exactamente lo que el tablero existe para
 *   que decidas vos;
 * - editar o borrar le deja cambiar lo que vos escribiste, sin que quede rastro.
 *
 * Por eso **todo lo que entra por acá cae en Ideas**, con origen «mcp», igual que los TODO del
 * código y los issues: esperando que alguien las apruebe.
 */

/** Cuántas tarjetas devuelve una lista si no se pide otra cosa. El tablero entero infla el contexto. */
const TOPE = 40;
const TOPE_MAXIMO = 200;
/** Lo que se le muestra de un comentario en la lista: el detalle completo está en `tablero_ver`. */
const COMENTARIO_CORTO = 160;

export const HERRAMIENTAS_DEL_TABLERO = [
  {
    name: "tablero_listar",
    description:
      "Las tarjetas del tablero del proyecto: qué hay que hacer, qué se está haciendo y qué terminó. Conviene mirarlo ANTES de proponer trabajo: puede que ya esté anotado.",
    inputSchema: {
      type: "object",
      properties: {
        columna: { type: "string", description: `Una de: ${COLUMNAS.join(", ")}. Sin esto, todas.` },
        limite: { type: "number", description: `Cuántas devolver como mucho (${TOPE} por defecto).` },
      },
    },
  },
  {
    name: "tablero_ver",
    description: "Una tarjeta entera por su id: el detalle, cómo se sabe que está terminada, los comentarios y por qué columnas pasó.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "tablero_anotar",
    description:
      "Anota algo para no perderlo: queda como IDEA, esperando que una persona la apruebe. Nunca se autoasigna trabajo. Si ya hay una tarjeta parecida, lo dice y no anota de nuevo.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        detalle: { type: "string", description: "Lo que haga falta para que se entienda sin volver a mirar el código." },
        terminado: { type: "string", description: "Cómo se sabría que está resuelta." },
        tipo: { type: "string", description: "«idea» (por defecto) o «bug»." },
      },
      required: ["titulo"],
    },
  },
  {
    name: "tablero_comentar",
    description: "Deja un comentario en una tarjeta: lo que averiguaste, lo que te trabó, lo que conviene mirar.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, texto: { type: "string" } }, required: ["id", "texto"] },
  },
] as const;

const NOMBRES: ReadonlySet<string> = new Set<string>(HERRAMIENTAS_DEL_TABLERO.map((h) => h.name));
export const esHerramientaDelTablero = (nombre: string): boolean => NOMBRES.has(nombre);

/** Una tarjeta como la ve el asistente en una lista: lo justo para decidir si le sirve. */
interface TarjetaEnLista {
  readonly id: string;
  readonly titulo: string;
  readonly columna: Columna;
  readonly tipo: Tarjeta["tipo"];
  readonly quien?: string;
  readonly terminado?: string;
  readonly comentarios: number;
}

const enLista = (t: Tarjeta): TarjetaEnLista => ({
  id: t.id,
  titulo: t.titulo,
  columna: t.columna,
  tipo: t.tipo,
  ...(t.quien ? { quien: t.quien } : {}),
  ...(t.terminado ? { terminado: t.terminado } : {}),
  comentarios: t.comentarios.length,
});

const comoSeLlama = (p: Parecida) => ({ id: p.tarjeta.id, titulo: p.tarjeta.titulo, columna: p.tarjeta.columna, parecido: Math.round(p.cuanto * 100) / 100 });

function columnaPedida(valor: unknown): Columna | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const columna = valor.trim() as Columna;
  if (!(COLUMNAS as readonly string[]).includes(columna)) throw new Error(`«${valor}» no es una columna; son: ${COLUMNAS.join(", ")}`);
  return columna;
}

function texto(valor: unknown, campo: string, herramienta: string): string {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (!limpio) throw new Error(`${herramienta} necesita ${campo}`);
  return limpio;
}

/**
 * Atiende una herramienta del tablero. Devuelve `undefined` si el nombre no es de acá, así el
 * servidor MCP sigue probando con las suyas y hay un solo lugar donde se decide qué hace cada una.
 */
export async function llamarHerramientaDelTablero(nombre: string, args: Record<string, unknown>, repo: string): Promise<Record<string, unknown> | undefined> {
  if (nombre === "tablero_listar") {
    const columna = columnaPedida(args.columna);
    const pedido = typeof args.limite === "number" && Number.isFinite(args.limite) ? Math.floor(args.limite) : TOPE;
    const limite = Math.min(TOPE_MAXIMO, Math.max(1, pedido));
    const todas = await leerTablero(repo);
    const elegidas = columna ? todas.filter((t) => t.columna === columna) : todas;
    return {
      tarjetas: elegidas.slice(0, limite).map(enLista),
      total: elegidas.length,
      // Que el asistente sepa que la lista está cortada: si no, propone algo que ya está anotado
      // dos pantallas más abajo.
      hayMas: elegidas.length > limite,
    };
  }

  if (nombre === "tablero_ver") {
    const tarjeta = await buscarTarjeta(repo, texto(args.id, "id", "tablero_ver"));
    return {
      tarjeta: {
        ...enLista(tarjeta),
        ...(tarjeta.detalle ? { detalle: tarjeta.detalle } : {}),
        origen: tarjeta.origen,
        creada: tarjeta.creada,
        comentarios: tarjeta.comentarios.map((c) => ({ quien: c.quien, texto: c.texto, cuando: c.cuando, ...(c.donde ? { donde: c.donde } : {}) })),
        historial: tarjeta.historial,
      },
    };
  }

  if (nombre === "tablero_anotar") {
    const titulo = texto(args.titulo, "titulo", "tablero_anotar");
    const tablero = await leerTablero(repo);
    const misma = yaEstaAnotada(tablero, titulo);
    if (misma) {
      // No se anota de nuevo y se dice cuál es: el tablero existe para decidir, y una lista de
      // variantes de lo mismo es justo lo que hace que nadie lo mire.
      return { anotada: false, porQue: "ya hay una tarjeta que dice lo mismo", yaEstaba: enLista(misma) };
    }
    const tipo = args.tipo === "bug" ? "bug" : "idea";
    const tarjeta = await crearTarjeta(repo, {
      titulo,
      ...(typeof args.detalle === "string" && args.detalle.trim() ? { detalle: args.detalle.trim() } : {}),
      ...(typeof args.terminado === "string" && args.terminado.trim() ? { terminado: args.terminado.trim() } : {}),
      tipo,
      // Siempre en Ideas, aunque sea un bug: lo que entra por MCP espera que alguien lo apruebe.
      columna: "ideas",
      origen: "mcp",
    });
    const parecidas = parecidasA(tablero, titulo).map(comoSeLlama);
    return { anotada: true, tarjeta: enLista(tarjeta), ...(parecidas.length > 0 ? { parecidas } : {}) };
  }

  if (nombre === "tablero_comentar") {
    const id = texto(args.id, "id", "tablero_comentar");
    const cuerpo = texto(args.texto, "texto", "tablero_comentar");
    const tarjeta = await buscarTarjeta(repo, id);
    const conComentario = await comentarTarjeta(repo, tarjeta.id, cuerpo, "mcp");
    const ultimo = conComentario.comentarios.at(-1);
    return {
      comentada: true,
      tarjeta: enLista(conComentario),
      comentario: ultimo ? { quien: ultimo.quien, texto: ultimo.texto.slice(0, COMENTARIO_CORTO), cuando: ultimo.cuando } : undefined,
    };
  }

  return undefined;
}
