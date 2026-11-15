/**
 * Lo que llega por la entrada de la terminal en modo crudo, hecho eventos: teclas (con Ctrl y Alt),
 * texto pegado (bracketed paste, `\x1b[200~ … \x1b[201~`) y el mouse en modo SGR 1006
 * (`\x1b[<b;x;yM`), que Ink no trae y por eso va propio. Es una función pura: los tests le pasan
 * los bytes tal cual los manda Windows Terminal.
 */

export type Entrada =
  | { tipo: "tecla"; nombre: string; ctrl: boolean; alt: boolean; shift: boolean }
  | { tipo: "texto"; texto: string }
  | { tipo: "pegar"; texto: string }
  /** La terminal ganó o perdió el foco (modo 1004): sin foco, Dolphin avisa con una notificación. */
  | { tipo: "foco"; enFoco: boolean }
  | { tipo: "mouse"; accion: "clic" | "suelta" | "arrastra" | "mueve" | "rueda-arriba" | "rueda-abajo"; x: number; y: number; boton: number };

const tecla = (nombre: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}): Entrada => ({
  tipo: "tecla",
  nombre,
  ctrl: mods.ctrl ?? false,
  alt: mods.alt ?? false,
  shift: mods.shift ?? false,
});

/** Las secuencias CSI de teclas que usamos: flechas, inicio/fin, página, suprimir, F1. */
const CSI_FINAL: Record<string, string> = { A: "arriba", B: "abajo", C: "derecha", D: "izquierda", H: "inicio", F: "fin", Z: "tab", P: "f1" };
const CSI_TILDE: Record<string, string> = { "1": "inicio", "2": "insertar", "3": "suprimir", "4": "fin", "5": "repag", "6": "avpag", "7": "inicio", "8": "fin" };

/** Modificadores de xterm: 2 shift, 3 alt, 5 ctrl… (el número menos uno es una máscara). */
function modificadores(n: number | undefined): { ctrl: boolean; alt: boolean; shift: boolean } {
  const m = (n ?? 1) - 1;
  return { shift: (m & 1) !== 0, alt: (m & 2) !== 0, ctrl: (m & 4) !== 0 };
}

export function leerEntrada(datos: string): Entrada[] {
  const eventos: Entrada[] = [];
  let texto = "";
  const soltarTexto = (): void => {
    if (texto) eventos.push({ tipo: "texto", texto });
    texto = "";
  };

  for (let i = 0; i < datos.length; ) {
    const resto = datos.slice(i);

    const pegado = /^\x1b\[200~([\s\S]*?)(\x1b\[201~|$)/.exec(resto);
    if (pegado) {
      soltarTexto();
      eventos.push({ tipo: "pegar", texto: pegado[1]!.replace(/\r\n?/g, "\n") });
      i += pegado[0].length;
      continue;
    }

    const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(resto);
    if (mouse) {
      soltarTexto();
      const b = Number(mouse[1]);
      const x = Number(mouse[2]) - 1;
      const y = Number(mouse[3]) - 1;
      const accion =
        b & 64 ? (b & 1 ? "rueda-abajo" : "rueda-arriba") : b & 32 ? ((b & 3) === 3 ? "mueve" : "arrastra") : mouse[4] === "m" ? "suelta" : "clic";
      eventos.push({ tipo: "mouse", accion, x, y, boton: b & 3 });
      i += mouse[0].length;
      continue;
    }

    // Foco (modo 1004): ESC [ I al ganarlo, ESC [ O al perderlo.
    const foco = /^\x1b\[([IO])/.exec(resto);
    if (foco) {
      soltarTexto();
      eventos.push({ tipo: "foco", enFoco: foco[1] === "I" });
      i += 3;
      continue;
    }

    const csi = /^\x1b\[(?:(\d+)(?:;(\d+))?)?([A-Za-z~])/.exec(resto);
    if (csi) {
      soltarTexto();
      const [, n1, n2, final] = csi;
      const nombre = final === "~" ? CSI_TILDE[n1 ?? ""] : CSI_FINAL[final!];
      if (nombre) {
        const mods = modificadores(n2 ? Number(n2) : undefined);
        eventos.push(tecla(nombre, final === "Z" ? { ...mods, shift: true } : mods));
      }
      i += csi[0].length;
      continue;
    }

    // SS3: algunas terminales mandan las flechas y F1 así (`\x1bOA`).
    const ss3 = /^\x1bO([A-DHFP])/.exec(resto);
    if (ss3) {
      soltarTexto();
      eventos.push(tecla(CSI_FINAL[ss3[1]!]!));
      i += 3;
      continue;
    }

    const ch = resto[0]!;
    const codigo = ch.charCodeAt(0);

    if (ch === "\x1b") {
      soltarTexto();
      // Alt + algo llega como ESC seguido de la tecla; ESC solo es Escape.
      const siguiente = resto[1];
      if (siguiente && siguiente !== "\x1b" && siguiente !== "[" && siguiente !== "O") {
        const [interior] = leerEntrada(siguiente);
        if (interior?.tipo === "tecla") eventos.push({ ...interior, alt: true });
        else eventos.push(tecla(siguiente.toLowerCase(), { alt: true, shift: siguiente !== siguiente.toLowerCase() }));
        i += 2;
        continue;
      }
      eventos.push(tecla("escape"));
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      soltarTexto();
      eventos.push(tecla("enter"));
      i += ch === "\r" && resto[1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\t") {
      soltarTexto();
      eventos.push(tecla("tab"));
      i += 1;
      continue;
    }
    if (ch === "\x7f" || ch === "\b") {
      soltarTexto();
      eventos.push(tecla("borrar", { ctrl: ch === "\b" }));
      i += 1;
      continue;
    }
    if (codigo < 32) {
      soltarTexto();
      // Ctrl+A … Ctrl+Z son 1 … 26.
      eventos.push(tecla(String.fromCharCode(codigo + 96), { ctrl: true }));
      i += 1;
      continue;
    }

    const caracter = String.fromCodePoint(datos.codePointAt(i)!);
    texto += caracter;
    i += caracter.length;
  }
  soltarTexto();
  return eventos;
}

/**
 * Un lector con memoria entre trozos: un pegado largo llega partido en varios `data` y no puede
 * leerse como teclas (cada renglón sería un Enter, y un «dale» suelto aprobaría un plan). Mientras un
 * pegado no cerró, se espera; una secuencia de escape cortada al final también.
 */
export function crearLector(): (datos: string) => Entrada[] {
  let pendiente = "";
  return (datos) => {
    pendiente += datos;
    const abre = pendiente.lastIndexOf("\x1b[200~");
    if (abre >= 0 && !pendiente.includes("\x1b[201~", abre)) return [];
    // Un ESC suelto al final puede ser el principio de una secuencia que llega en el próximo trozo.
    if (/\x1b(\[[0-9;<]*)?$/.test(pendiente) && pendiente !== "\x1b") return [];
    const todo = pendiente;
    pendiente = "";
    return leerEntrada(todo);
  };
}

/** Prender y apagar lo que la app le pide a la terminal: mouse SGR, pegado entre corchetes, foco. */
export const MODOS = {
  prender: "\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?2004h\x1b[?1004h",
  apagar: "\x1b[?1000l\x1b[?1002l\x1b[?1006l\x1b[?2004l\x1b[?1004l",
} as const;
