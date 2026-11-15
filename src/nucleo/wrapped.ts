import { homedir } from "node:os";
import { buscarMemorias, type Mensaje } from "./buscar-memorias.js";
import { leerMemoria, type Memoria } from "./memoria.js";
import { jaccardDePalabras, normalizarTexto, palabrasNormalizadas } from "./relevancia.js";

/**
 * Dolphin Wrapped: la primera pantalla después de instalar, hecha SOLO con lo
 * que ya está en la máquina.
 *
 * Decirle a alguien que Dolphin tiene memoria no convence a nadie. Mostrarle
 * que este mes le corrigió treinta y ocho veces lo mismo a su agente, y que
 * doce de esas correcciones se pueden volver chequeos del portón hoy, sí: son
 * sus propios datos y los reconoce al leerlos. Así que esto no explica la
 * memoria, la enseña.
 *
 * Tres decisiones, y qué pasaba antes de tomarlas:
 *
 * - No le escribe a ningún modelo. Destilar (entrenar.ts) le da las memorias a
 *   un modelo para que saque las verdades del proyecto, y eso cuesta plata y
 *   tarda minutos; la primera pantalla no le puede cobrar nada a quien recién
 *   instaló. Todo lo de acá sale de contar y de comparar palabras.
 * - Prefiere contar de menos. Es un número que la persona va a creer, así que
 *   un mensaje cuenta como corrección solo si trae una marca clara de estar
 *   corrigiendo («no uses», «sacá eso», «te lo dije»). Un «no sé si conviene»
 *   no es una corrección, y una pantalla que infla el número se descubre sola.
 * - Un mensaje sin fecha queda afuera de la cuenta y se informa aparte
 *   (`sinFecha`): Codex y Gemini no siempre la anotan, y meter lo que no tiene
 *   fecha adentro de «los últimos 30 días» sería inventar.
 */

/** Cuántos días mira la vuelta: un mes es lo que la persona todavía tiene fresco. */
export const DIAS_DE_LA_VUELTA = 30;
/** Cuántas repetidas se muestran: las que entran en una pantalla y en un posteo. */
export const TOPE_MAS_REPETIDAS = 5;
/** Más largo que esto no es una corrección, es un párrafo: se recorta para mostrarlo. */
const TOPE_DE_NUCLEO = 140;
/** Cuánta materia tienen que compartir dos correcciones para ser la misma. */
const PARECIDO_MINIMO = 0.5;
const UN_DIA = 86_400_000;

/** Cómo se llama cada agente cuando se lo muestra. Es la lista cerrada: nada de afuera se imprime. */
export const NOMBRE_DE_AGENTE: Readonly<Record<string, string>> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
};

export interface Correccion {
  /** La corrección como la escribió, recortada: es lo que se muestra. */
  readonly texto: string;
  /** Cuántas correcciones de la ventana hablan de esto: nadie repite una corrección con las mismas palabras. */
  readonly veces: number;
  /** Con qué patrón se volvería un verificador del portón; sin esto, es una regla dicha. */
  readonly patron?: string;
  /** La memoria del repo ya la tiene: no hay nada que enseñarle de nuevo. */
  readonly yaEstaba?: boolean;
}

export interface Wrapped {
  /** La ventana, en ISO: de acá hasta acá se contó. */
  readonly desde: string;
  readonly hasta: string;
  readonly dias: number;
  /** Todo lo que la persona escribió en la ventana: el denominador. */
  readonly escritos: number;
  readonly correcciones: number;
  /** Lo que escribió sin fecha y por eso no entró en la cuenta. */
  readonly sinFecha: number;
  readonly masRepetidas: readonly Correccion[];
  readonly queSePuedenVerificar: number;
  /** Las que se pueden volver chequeo ahora mismo, con su patrón. */
  readonly verificables: readonly Correccion[];
  /** Cuántas correcciones distintas ya están en la memoria del repo. */
  readonly yaEnLaMemoria: number;
  readonly porAgente: Readonly<Record<string, number>>;
}

/**
 * El texto sin tildes y en minúscula. Los patrones de abajo se escriben así por
 * una razón concreta: `\b` cuenta la «á» como separador, así que un `\bsacá\b`
 * no matchea «sacá eso» —el borde después de la á no existe— y la corrección
 * más común del castellano se perdía en silencio.
 */
const sinTildes = (texto: string): string => texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Las marcas de que un mensaje corrige y no pide. Son frases, no palabras
 * sueltas: con un `\bno\b` a secas, «no sé si conviene esto» entraba como
 * corrección y el número de la pantalla dejaba de valer.
 */
const MARCAS: readonly RegExp[] = [
  // Prohibiciones: lo que no hay que hacer, dicho después de que lo hizo.
  /\bno\s+(?:lo\s+|me\s+|la\s+|las\s+|los\s+)?(?:uses?|pongas|agregues|hagas|toques|metas|inventes|cambies|borres|repitas|vuelvas)\b/,
  /\bnada\s+de\b/,
  /\bnunca\b/,
  /\bno\s+(?:me\s+gusta|va\b|era\b|asi\b|hace\s+falta|quiero\b|es\s+(?:asi|eso)\b)/,
  // Deshacer lo que hizo.
  /\b(?:saca|sacale|borra|borralo|quita|quitale|elimina|reverti|revertir|deshace|deshacer)\b/,
  /\b(?:volve|volvelo|dejalo|dejala)\s+(?:a\b|como\b|atras\b)/,
  // Está mal.
  /\besta\s+mal\b/,
  /\bno\s+(?:anda|funciona|sirve|compila|pasa|pasan|cambio|hiciste)\b/,
  /\b(?:rompiste|sigue\s+igual|al\s+reves)\b/,
  // Ya lo había dicho antes.
  /\b(?:te\s+(?:lo\s+)?dije|ya\s+te\s+dije|otra\s+vez|de\s+nuevo|acordate|la\s+proxima)\b/,
];

/** Un mensaje que corrige, no uno que pide. */
export function esCorreccion(texto: string): boolean {
  const plano = sinTildes(texto);
  return MARCAS.some((marca) => marca.test(plano));
}

/**
 * Las cláusulas de un mensaje. El punto corta solo si lo sigue un espacio: si
 * cortara siempre, «nada de console.log» se partía en dos y la corrección
 * perdía justo el literal que la hace verificable.
 */
function clausulas(texto: string): string[] {
  return texto
    .split(/[\n;!?]+|\.(?=\s|$)/)
    .map((parte) => parte.replace(/\s+/g, " ").trim())
    .filter((parte) => parte !== "");
}

/** La parte del mensaje que corrige: un mensaje largo deja de ser comparable con otro. */
export function nucleoDeCorreccion(texto: string): string {
  const partes = clausulas(texto);
  const nucleo = partes.find(esCorreccion) ?? partes[0] ?? texto.replace(/\s+/g, " ").trim();
  return nucleo.length > TOPE_DE_NUCLEO ? `${nucleo.slice(0, TOPE_DE_NUCLEO - 1).trimEnd()}…` : nucleo;
}

/**
 * Las palabras que marcan una corrección, y que no dicen de QUÉ habla. Se
 * sacan antes de comparar: «no uses emojis» y «nada de emojis en la interfaz»
 * son la misma corrección dicha de dos maneras, pero mirando todas las
 * palabras comparten una de cuatro y quedaban en grupos distintos; sin
 * «uses» ni «nada», una de dos.
 */
const PALABRAS_DE_MARCA: ReadonlySet<string> = new Set([
  "usa", "uses", "usar", "use", "pone", "pongas", "poner", "ponele", "agregues", "agregar", "hagas", "hacer",
  "hace", "falta", "toques", "tocar", "metas", "meter", "inventes", "inventar", "cambies", "cambiar", "cambio",
  "borres", "borrar", "borra", "borralo", "repitas", "repetir", "vuelvas", "volver", "volve", "volvelo", "nada",
  "nunca", "siempre", "saca", "sacale", "sacar", "quita", "quitale", "quitar", "elimina", "eliminar", "reverti",
  "revertir", "deshace", "deshacer", "deja", "dejalo", "dejala", "mal", "anda", "funciona", "sirve", "compila",
  "pasa", "pasan", "rompiste", "romper", "sigue", "igual", "reves", "hiciste", "dije", "dijo", "vez", "veces",
  "nuevo", "acordate", "proxima", "gusta", "quiero", "arregla", "arreglar", "corregi", "corregir", "era", "eso",
  "esto", "esa", "ese", "asi", "favor", "ahora", "tiene", "esta", "estas",
]);

/** De qué habla una corrección: sus palabras, menos las que la marcan como corrección. */
function materiaDe(texto: string): ReadonlySet<string> {
  return new Set(palabrasNormalizadas(texto).filter((palabra) => !PALABRAS_DE_MARCA.has(palabra)));
}

/**
 * Dos correcciones hablan de lo mismo si comparten la mitad de la materia de la
 * más corta.
 *
 * Se mide contra la más corta y no contra las dos juntas por lo que pasa de
 * verdad: nadie repite una corrección con las mismas palabras. «no uses emojis
 * en la interfaz», «nada de emojis en los botones» y «sacá los emojis del
 * panel» son la misma corrección tres veces, pero sobre el total comparten una
 * palabra de tres —0,33— y con el corte en la mitad quedaban en tres grupos de
 * uno: la pantalla decía que nunca repitió nada. Contra la más corta, una de
 * dos. El precio es que dos correcciones distintas del mismo tema pueden caer
 * juntas, y por eso `veces` cuenta correcciones sobre un tema y el texto que se
 * muestra es siempre uno que la persona escribió de verdad.
 */
function hablanDeLoMismo(una: ReadonlySet<string>, otra: ReadonlySet<string>): boolean {
  if (una.size === 0 || otra.size === 0) return false;
  const juntas = [...una].filter((palabra) => otra.has(palabra)).length;
  return juntas > 0 && juntas / Math.min(una.size, otra.size) >= PARECIDO_MINIMO;
}

interface Grupo {
  /** La materia de cada corrección del grupo, no la del grupo: ver abajo por qué. */
  readonly materias: ReadonlySet<string>[];
  readonly nucleos: string[];
}

/**
 * Las correcciones que hablan de lo mismo, en un grupo.
 *
 * Una corrección entra al grupo si habla de lo mismo que CUALQUIERA de las que
 * ya están, no que la primera: la del medio es la que suele hacer de puente
 * entre la primera y la última, que entre ellas no se parecen.
 *
 * Los candidatos salen de un índice por palabra y no de recorrer todos los
 * grupos: comparar todo contra todo es lo único de esta pantalla que, con unos
 * cuantos miles de mensajes, se podría llegar a sentir.
 */
function agrupar(nucleos: readonly string[]): Grupo[] {
  const grupos: Grupo[] = [];
  const porPalabra = new Map<string, Grupo[]>();
  const porTextoPelado = new Map<string, Grupo>();

  for (const nucleo of nucleos) {
    const materia = materiaDe(nucleo);
    // Sin materia propia («está mal», «te lo dije») solo se junta con lo
    // idéntico: si no, todas las quejas sueltas del mes terminan en un grupo
    // enorme que no dice nada.
    if (materia.size === 0) {
      const pelado = normalizarTexto(nucleo);
      const mismo = porTextoPelado.get(pelado);
      if (mismo) {
        mismo.nucleos.push(nucleo);
        continue;
      }
      const grupo: Grupo = { materias: [materia], nucleos: [nucleo] };
      grupos.push(grupo);
      porTextoPelado.set(pelado, grupo);
      continue;
    }

    const candidatos = new Set<Grupo>();
    for (const palabra of materia) for (const grupo of porPalabra.get(palabra) ?? []) candidatos.add(grupo);
    // Por orden de aparición: el grupo más viejo se queda con la corrección, así
    // dos corridas sobre los mismos datos dan lo mismo.
    const suyo = [...candidatos]
      .sort((a, b) => grupos.indexOf(a) - grupos.indexOf(b))
      .find((grupo) => grupo.materias.some((suya) => hablanDeLoMismo(suya, materia)));
    const grupo = suyo ?? { materias: [], nucleos: [] };
    if (!suyo) grupos.push(grupo);
    grupo.nucleos.push(nucleo);
    grupo.materias.push(materia);
    for (const palabra of materia) {
      const enEsa = porPalabra.get(palabra) ?? [];
      if (!enEsa.includes(grupo)) porPalabra.set(palabra, [...enEsa, grupo]);
    }
  }
  return grupos;
}

/** Cómo se muestra un grupo: la forma que más repitió tal cual, y entre empates la más corta. */
function textoDelGrupo(nucleos: readonly string[]): string {
  const cuenta = new Map<string, number>();
  for (const nucleo of nucleos) cuenta.set(nucleo, (cuenta.get(nucleo) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]![0];
}

/** Las palabras de una cláusula, sin la puntuación que las envuelve y con sus símbolos intactos. */
function palabras(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map((palabra) => palabra.replace(/^[«"'`¡¿]+/, "").replace(/[.,;:!?»"'`…]+$/, ""))
    .filter((palabra) => palabra !== "");
}

const ENTRECOMILLADOS: readonly RegExp[] = [/`([^`\n]+)`/, /«([^»\n]+)»/, /"([^"\n]+)"/, /'([^'\n]+)'/];

/** Lo que una corrección prohíbe, cuando lo dice de una forma que se puede buscar. */
const PROHIBICIONES =
  /\b(?:no\s+(?:uses?|pongas|agregues|hagas|metas)|nada\s+de|nunca\s+(?:uses?|pongas)|prohibido|saca|sacale|borra|quita|quitale|elimina)\b/;

/**
 * Un literal sirve de patrón del portón si se puede buscar en una línea nueva y
 * encontrarlo significa algo. «emojis» no sirve: la palabra aparece en un
 * comentario que habla de emojis y el chequeo cortaría intentos buenos. Una
 * ruta tampoco: un archivo no es algo prohibido, y además la ruta cambia.
 */
function sirveDePatron(literal: string): boolean {
  if (literal.length < 3 || literal.length > 60) return false;
  if (/[/\\]/.test(literal)) return false;
  if (palabras(literal).length > 4) return false;
  // Con tildes o eñe es prosa, no código.
  if (/[À-ɏ]/.test(literal)) return false;
  return /[._([{=@#]/.test(literal) || /[a-z][A-Z]/.test(literal);
}

/**
 * Con qué patrón esta corrección se vuelve un verificador del portón, si se
 * puede. Primero lo que la persona entrecomilló —si se tomó el trabajo de
 * marcarlo, eso es el literal— y si no, la primera palabra con forma de código
 * de una cláusula que prohíbe algo.
 */
export function patronPropuesto(nucleo: string): string | undefined {
  const marcado = ENTRECOMILLADOS.map((comillas) => comillas.exec(nucleo)?.[1]).find(
    (literal): literal is string => literal !== undefined && sirveDePatron(literal),
  );
  const literal = marcado ?? (PROHIBICIONES.test(sinTildes(nucleo)) ? palabras(nucleo).find(sirveDePatron) : undefined);
  if (literal === undefined) return undefined;
  const patron = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    new RegExp(patron);
  } catch {
    // Escapado no debería pasar nunca, pero un patrón roto rompería el portón para siempre.
    return undefined;
  }
  return patron;
}

/** La memoria del repo ya sabe esto: el mismo patrón, o una regla que habla de la misma materia. */
function yaLaSabe(nucleo: string, patron: string | undefined, memoria: Memoria): boolean {
  const materia = materiaDe(nucleo);
  return memoria.recuerdos.some((recuerdo) => {
    if (!recuerdo.activo || recuerdo.candidato) return false;
    if (patron !== undefined && recuerdo.patron === patron) return true;
    return hablanDeLoMismo(materiaDe(recuerdo.dicho), materia) || jaccardDePalabras(recuerdo.dicho, nucleo) >= PARECIDO_MINIMO;
  });
}

/**
 * La vuelta, con los mensajes ya en la mano. Es la que usan los tests y la que
 * no toca el disco: todo lo que decide el resumen está acá.
 */
export function armarWrapped(
  mensajes: readonly Mensaje[],
  memoria: Memoria = { recuerdos: [] },
  ahora = new Date(),
  dias = DIAS_DE_LA_VUELTA,
): Wrapped {
  const hasta = ahora.getTime();
  const desde = hasta - dias * UN_DIA;

  const enLaVentana: Mensaje[] = [];
  let sinFecha = 0;
  for (const mensaje of mensajes) {
    const cuando = mensaje.cuando === undefined ? Number.NaN : Date.parse(mensaje.cuando);
    if (!Number.isFinite(cuando)) {
      sinFecha += 1;
      continue;
    }
    if (cuando < desde || cuando > hasta) continue;
    enLaVentana.push(mensaje);
  }

  const correcciones = enLaVentana.filter((mensaje) => esCorreccion(mensaje.texto));
  const porAgente: Record<string, number> = {};
  for (const mensaje of correcciones) porAgente[mensaje.de] = (porAgente[mensaje.de] ?? 0) + 1;

  const todas: Correccion[] = agrupar(correcciones.map((mensaje) => nucleoDeCorreccion(mensaje.texto))).map((grupo) => {
    const texto = textoDelGrupo(grupo.nucleos);
    const patron = patronPropuesto(texto);
    const yaEstaba = yaLaSabe(texto, patron, memoria);
    return {
      texto,
      veces: grupo.nucleos.length,
      ...(patron !== undefined ? { patron } : {}),
      ...(yaEstaba ? { yaEstaba: true } : {}),
    };
  });

  // Solo las que se repitieron: una corrección única no es «de las que más repetís».
  const masRepetidas = todas.filter((c) => c.veces >= 2).sort((a, b) => b.veces - a.veces).slice(0, TOPE_MAS_REPETIDAS);
  const verificables = todas.filter((c) => c.patron !== undefined && c.yaEstaba !== true);

  return {
    desde: new Date(desde).toISOString(),
    hasta: new Date(hasta).toISOString(),
    dias,
    escritos: enLaVentana.length,
    correcciones: correcciones.length,
    sinFecha,
    masRepetidas,
    queSePuedenVerificar: verificables.length,
    verificables,
    yaEnLaMemoria: todas.filter((c) => c.yaEstaba === true).length,
    porAgente,
  };
}

/**
 * La vuelta de este repo, leída de la máquina. No manda nada a ningún lado, no
 * le pregunta nada a ningún modelo y no escribe un solo archivo.
 */
export async function wrapped(repo: string, casa = homedir(), ahora = new Date(), dias = DIAS_DE_LA_VUELTA): Promise<Wrapped> {
  const [hallazgo, memoria] = await Promise.all([buscarMemorias(repo, casa), leerMemoria(repo)]);
  return armarWrapped(hallazgo.mensajes, memoria, ahora, dias);
}

/** Qué porcentaje de lo que escribió fueron correcciones. */
export const porcentajeDeCorrecciones = (resumen: Wrapped): number =>
  resumen.escritos === 0 ? 0 : Math.round((resumen.correcciones * 100) / resumen.escritos);

const LEMA = "Todo medido en mi propia máquina: sin telemetría y sin gastar un token.";

/**
 * La tarjeta para compartir: SOLO números.
 *
 * Es lo único de Dolphin que sale de la máquina, y lo pega una persona en una
 * red social. Así que acá no entra nada que haya escrito el dueño del repo: ni
 * el texto de una corrección, ni un nombre de archivo, ni una línea de código.
 * Se arma interpolando números y el nombre de los agentes de la tabla de
 * arriba, y nada más — la única manera de que no se filtre algo es que no haya
 * por dónde.
 */
export function tarjetaParaCompartir(resumen: Wrapped): string {
  const encabezado = `Dolphin Wrapped — últimos ${resumen.dias} días`;
  if (resumen.correcciones === 0) {
    return [encabezado, "", "Todavía no tengo números: 0 correcciones medidas.", "", LEMA].join("\n");
  }

  const lineas = [
    encabezado,
    "",
    `Le corregí cosas a mi agente ${resumen.correcciones} ${resumen.correcciones === 1 ? "vez" : "veces"}.`,
    `Fue el ${porcentajeDeCorrecciones(resumen)} % de lo que le escribí.`,
  ];
  const repetidas = resumen.masRepetidas.reduce((total, c) => total + c.veces, 0);
  if (resumen.masRepetidas.length === 1) lineas.push(`La que más repetí la dije ${repetidas} veces.`);
  else if (resumen.masRepetidas.length > 1) {
    lineas.push(`Las ${resumen.masRepetidas.length} que más repetí: ${repetidas} veces entre todas.`);
  }
  const verificables = resumen.queSePuedenVerificar;
  if (verificables > 0) {
    lineas.push(
      verificables === 1 ? "1 se puede volver un chequeo automático." : `${verificables} se pueden volver chequeos automáticos.`,
    );
  }
  if (resumen.yaEnLaMemoria > 0) {
    lineas.push(
      resumen.yaEnLaMemoria === 1
        ? "1 ya es una regla que mi agente respeta solo."
        : `${resumen.yaEnLaMemoria} ya son reglas que mi agente respeta solo.`,
    );
  }

  const agentes = Object.entries(NOMBRE_DE_AGENTE).flatMap(([agente, nombre]) => {
    const cuantas = resumen.porAgente[agente];
    return cuantas ? [`${nombre} ${cuantas}`] : [];
  });
  if (agentes.length > 0) lineas.push("", agentes.join(" · "));

  lineas.push("", LEMA);
  return lineas.join("\n");
}
