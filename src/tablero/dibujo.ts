import { ETAPAS, etapaActual, type EstadoTablero, type FaseDeUniverso, type Momento, type Tono, type UniversoEnTablero } from "./estado.js";

/**
 * El tablero de la terminal, como texto: cajas en ASCII (se ven igual en cualquier fuente y en
 * Windows Terminal, PowerShell o un SSH), un color por estado y nada que dependa del ancho de un
 * emoji. Es una función pura: recibe el estado y el ancho, devuelve las líneas. El redibujado
 * vive en en-vivo.ts.
 */

export interface OpcionesDeDibujo {
  ancho: number;
  ahora: number;
  color: boolean;
  /** Renglones del log que entran abajo. */
  renglonesDeLog?: number;
}

const ANSI = {
  negrita: "\x1b[1m",
  suave: "\x1b[2m",
  rojo: "\x1b[31m",
  verde: "\x1b[32m",
  amarillo: "\x1b[33m",
  cian: "\x1b[36m",
  invertido: "\x1b[7m",
  fin: "\x1b[0m",
} as const;

type Pintor = (texto: string, ...estilos: (keyof typeof ANSI)[]) => string;

function pintor(color: boolean): Pintor {
  return (texto, ...estilos) => (color && estilos.length > 0 ? `${estilos.map((e) => ANSI[e]).join("")}${texto}${ANSI.fin}` : texto);
}

const SIN_ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Cuántas columnas ocupa un texto ya pintado. */
export function anchoVisible(texto: string): number {
  return [...texto.replace(SIN_ANSI, "")].length;
}

/** Recorta o rellena a `ancho` columnas visibles, sin cortar una secuencia de color por la mitad. */
export function ajustar(texto: string, ancho: number): string {
  const visible = anchoVisible(texto);
  if (visible <= ancho) return texto + " ".repeat(ancho - visible);
  let salida = "";
  let usado = 0;
  for (let i = 0; i < texto.length && usado < ancho - 1; ) {
    const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(texto.slice(i));
    if (m) {
      salida += m[0];
      i += m[0].length;
      continue;
    }
    const caracter = String.fromCodePoint(texto.codePointAt(i) ?? 32);
    salida += caracter;
    i += caracter.length;
    usado += 1;
  }
  return `${salida}…${texto.includes("\x1b[") ? ANSI.fin : ""}`;
}

function reloj(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Una caja: título en el borde de arriba y el contenido ya ajustado a lo ancho. */
function caja(titulo: string, lineas: string[], ancho: number, p: Pintor, tonoBorde: keyof typeof ANSI = "suave"): string[] {
  const interior = ancho - 4;
  const cabeza = titulo ? `-- ${titulo} ` : "";
  const arriba = p("+", tonoBorde) + p(cabeza, "negrita") + p("-".repeat(Math.max(0, ancho - 2 - anchoVisible(cabeza))) + "+", tonoBorde);
  const abajo = p(`+${"-".repeat(ancho - 2)}+`, tonoBorde);
  return [arriba, ...lineas.map((l) => `${p("|", tonoBorde)} ${ajustar(l, interior)} ${p("|", tonoBorde)}`), abajo];
}

/** Pone cajas de igual alto una al lado de la otra, separadas por un espacio. */
function lado(columnas: string[][]): string[] {
  const alto = Math.max(...columnas.map((c) => c.length));
  const anchos = columnas.map((c) => Math.max(...c.map(anchoVisible)));
  const filas: string[] = [];
  for (let i = 0; i < alto; i++) filas.push(columnas.map((c, j) => ajustar(c[i] ?? "", anchos[j] ?? 0)).join(" "));
  return filas;
}

function barra(fase: FaseDeUniverso | undefined, ancho: number, p: Pintor, ahora: number, desde: number): string {
  const lleno = (n: number, c: string) => `[${c.repeat(n)}${".".repeat(ancho - n)}]`;
  switch (fase?.estado) {
    case "paso":
      return p(lleno(ancho, "#"), "verde");
    case "fallo":
      return p(lleno(ancho, "x"), "rojo");
    case "salteada":
      return p(lleno(ancho, "-"), "amarillo");
    case "corrige":
      return p(lleno(Math.ceil(ancho / 2), "~"), "amarillo");
    case "corre": {
      // Sin saber cuánto dura, la barra avanza y vuelve: dice «está trabajando», no un porcentaje.
      const paso = Math.floor((ahora - desde) / 250) % (ancho + 1);
      return p(lleno(paso, "#"), "cian");
    }
    default:
      return p(lleno(0, "."), "suave");
  }
}

function etiquetaDeFase(fase: FaseDeUniverso | undefined, p: Pintor): string {
  switch (fase?.estado) {
    case "paso":
      return p(`ok${fase.ms !== undefined ? ` ${(fase.ms / 1000).toFixed(1)}s` : ""}`, "verde");
    case "fallo":
      return p("falla", "rojo");
    case "salteada":
      return p("salteada", "amarillo");
    case "corrige":
      return p(`corrige ${fase.intento ?? ""}`.trim(), "amarillo");
    case "corre":
      return p("corre", "cian");
    default:
      return p("espera", "suave");
  }
}

const NOMBRE_DE_MOMENTO: Record<Momento, string> = {
  nace: "naciendo",
  escribe: "escribiendo…",
  porton: "en el portón",
  corrige: "corrigiendo",
  paso: "pasó todo",
  cortada: "cortada",
};

function tonoDeMomento(momento: Momento): keyof typeof ANSI {
  if (momento === "paso") return "verde";
  if (momento === "cortada") return "rojo";
  if (momento === "corrige") return "amarillo";
  if (momento === "escribe" || momento === "porton") return "cian";
  return "suave";
}

const archivos = (n: number): string => (n === 1 ? "1 archivo" : `${n} archivos`);

function tarjeta(u: UniversoEnTablero, ancho: number, p: Pintor, elegida: boolean): string[] {
  const cuerpo = [
    u.enfoque || p("—", "suave"),
    u.agregadas !== undefined ? `+${u.agregadas} −${u.quitadas ?? 0} · ${archivos(u.archivos ?? 0)}` : p("todavía sin cambios", "suave"),
    p(`${u.momento === "paso" ? "[ok]" : u.momento === "cortada" ? "[x]" : "[..]"} ${NOMBRE_DE_MOMENTO[u.momento]}`, tonoDeMomento(u.momento)),
    u.momento === "cortada" && u.porQue ? p(u.porQue, "suave") : u.faseActual && u.momento !== "paso" ? p(`fase: ${u.faseActual}`, "suave") : "",
  ];
  const titulo = `${u.id}${u.modelo ? ` · ${u.modelo}` : ""}${elegida ? " · ELEGIDA" : ""}`;
  return caja(titulo, cuerpo, ancho, p, elegida ? "verde" : tonoDeMomento(u.momento) === "rojo" ? "rojo" : "suave");
}

const LETRA_DE_MOMENTO: Record<Momento, string> = {
  nace: ".",
  escribe: "#",
  porton: "=",
  corrige: "~",
  paso: "+",
  cortada: "x",
};

/** Un renglón por rama: cada columna es un pedazo de tiempo, con la letra de lo que hacía. */
function lineaDeTiempo(u: UniversoEnTablero, columnas: number, desde: number, hasta: number, p: Pintor): string {
  const largo = Math.max(1, hasta - desde);
  let salida = "";
  let terminada = false;
  for (let c = 0; c < columnas; c++) {
    const t = desde + (largo * (c + 0.5)) / columnas;
    const tramo = [...u.tramos].reverse().find((x) => x.t <= t);
    if (!tramo || terminada) {
      salida += " ";
      continue;
    }
    const letra = LETRA_DE_MOMENTO[tramo.momento];
    salida += p(letra, tonoDeMomento(tramo.momento));
    // Lo que pasó o se cortó para siempre (el último tramo) se marca una vez; después, la rama ya no hace nada.
    if ((tramo.momento === "paso" || tramo.momento === "cortada") && tramo === u.tramos[u.tramos.length - 1]) terminada = true;
  }
  return salida;
}

const TONO_DE_LOG: Record<Tono, keyof typeof ANSI | undefined> = {
  normal: undefined,
  bien: "verde",
  mal: "rojo",
  aviso: "amarillo",
  suave: "suave",
};

export function dibujarTablero(estado: EstadoTablero, opciones: OpcionesDeDibujo): string[] {
  const p = pintor(opciones.color);
  const ancho = Math.max(72, Math.min(opciones.ancho, 140));
  const ahora = estado.cosecha ? estado.ultimo : opciones.ahora;
  const universos = [...estado.universos.values()];
  const vivas = universos.filter((u) => u.momento !== "cortada").length;
  const elegida = estado.cosecha?.elegida;
  const salida: string[] = [];

  // Cabecera: qué se siembra, con quién, y la tira de etapas con la actual resaltada.
  const quien = estado.agente ? ` · ${estado.agente.toUpperCase()}` : "";
  const ramas = estado.total === 1 ? "UNA RAMA" : `${estado.total || universos.length} RAMAS`;
  const titulo = `${p("DOLPHIN", "negrita", "cian")} ${p(`· SIEMBRA · ${ramas}${quien}`, "negrita")}`;
  salida.push(ajustar(` ${titulo}`, ancho - 7) + p(reloj(ahora - estado.desde).padStart(7), "suave"));
  salida.push(ajustar(` ${p("tarea", "suave")} ${estado.tarea || p("(esperando la siembra…)", "suave")}`, ancho));
  const actual = etapaActual(estado);
  const NOMBRE_DE_ETAPA = { sembrar: "sembrar", escribir: "escribir", porton: "portón", elegir: "elegir", entregar: "entregar" } as const;
  const indice = ETAPAS.indexOf(actual);
  const tira = ETAPAS.map((e, i) => {
    const nombre = NOMBRE_DE_ETAPA[e];
    if (i < indice || (estado.cosecha && i === indice)) return p(`+ ${nombre}`, "verde");
    if (i === indice) return p(` ${nombre} `, "invertido", "negrita");
    return p(nombre, "suave");
  }).join(p(" > ", "suave"));
  salida.push(` ${tira}`, "");

  // Las ramas, de a tres o cuatro por fila según el ancho.
  const porFila = Math.max(1, Math.min(universos.length || 1, Math.floor(ancho / 30)));
  const anchoTarjeta = Math.floor((ancho - (porFila - 1)) / porFila);
  if (universos.length === 0) {
    salida.push(...caja("ramas", [p("todavía no nació ninguna", "suave")], ancho, p));
  } else {
    for (let i = 0; i < universos.length; i += porFila) {
      const fila = universos.slice(i, i + porFila).map((u) => tarjeta(u, anchoTarjeta, p, Boolean(elegida) && u.momento === "paso" && elegida?.endsWith(u.id) === true));
      salida.push(...lado(fila));
    }
  }

  // El portón: una fila por fase, una columna por rama.
  if (estado.fases.length > 0 && universos.length > 0) {
    const anchoFase = Math.min(16, Math.max(8, ...estado.fases.map((f) => f.length + 1)));
    const anchoCelda = Math.max(14, Math.floor((ancho - 4 - anchoFase) / Math.max(1, universos.length)));
    const anchoBarra = Math.max(4, Math.min(10, anchoCelda - 9));
    const cabecera = ajustar(p("fase", "suave"), anchoFase) + universos.map((u) => ajustar(p(u.id, "negrita"), anchoCelda)).join("");
    const filas = estado.fases.map(
      (fase) =>
        ajustar(fase, anchoFase) +
        universos
          .map((u) => {
            const f = u.fases.get(fase);
            const vacia = !f && (u.momento === "cortada" || u.momento === "paso");
            return ajustar(vacia ? p("—", "suave") : `${barra(f, anchoBarra, p, opciones.ahora, estado.desde)} ${etiquetaDeFase(f, p)}`, anchoCelda);
          })
          .join(""),
    );
    salida.push(...caja("portón · fase por fase · lo gratis primero", [cabecera, ...filas], ancho, p));
  }

  // La línea de tiempo: de un vistazo, quién escribió, quién se trabó en el portón, quién corrigió.
  if (universos.length > 0) {
    const columnas = ancho - 12;
    const filas = universos.map((u) => `${ajustar(p(u.id, "negrita"), 6)}${lineaDeTiempo(u, columnas, estado.desde, ahora, p)}`);
    const leyenda = p("# escribe  = portón  ~ corrige  + pasó  x cortada", "suave");
    salida.push(...caja("línea de tiempo", [...filas, leyenda], ancho, p));
  }

  // La cola del log, como un tail -f.
  const cuantos = opciones.renglonesDeLog ?? 6;
  const ultimos = estado.log.slice(-cuantos);
  const renglones = ultimos.map((r) => {
    const tono = TONO_DE_LOG[r.tono];
    return `${p(reloj(r.t - estado.desde), "suave")} ${r.u ? ajustar(p(r.u, "negrita"), 4) : "    "} ${tono ? p(r.texto, tono) : r.texto}`;
  });
  while (renglones.length < cuantos) renglones.push("");
  salida.push(...caja("tail -f en-vivo", renglones, ancho, p));

  // La barra de estado.
  const fasesTotales = estado.fases.length * universos.length;
  const fasesHechas = universos.reduce((n, u) => n + [...u.fases.values()].filter((f) => f.estado === "paso" || f.estado === "salteada").length, 0);
  const plata =
    estado.cosecha?.gastado !== undefined && !estado.cosecha.suscripcion ? ` · gastado US$ ${estado.cosecha.gastado.toFixed(2)}` : "";
  const fin = estado.cosecha
    ? elegida
      ? p(` · elegida ${elegida}`, "verde")
      : p(" · no pasó nadie", "rojo")
    : "";
  const estadoTexto = ` [${NOMBRE_DE_ETAPA[actual]}] ramas ${vivas}/${universos.length || estado.total} vivas · fases ${fasesHechas}/${fasesTotales}${plata}`;
  salida.push(ajustar(p(estadoTexto, "suave") + fin, ancho));
  if (estado.cosecha?.porQue) salida.push(ajustar(p(` ${estado.cosecha.porQue}`, "suave"), ancho));
  return salida.map((l) => ajustar(l, ancho).trimEnd());
}
