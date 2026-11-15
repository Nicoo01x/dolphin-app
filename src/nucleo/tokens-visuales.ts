/**
 * Un solo lugar donde dice de qué color es Dolphin.
 *
 * La consola (`ui/src/app.css`) y la app de escritorio
 * (`escritorio/src/renderer/src/assets/main.css`) son dos superficies del mismo producto, y hasta
 * acá cada una escribía sus colores por su lado. Eso se nota enseguida: el `--accent` de la
 * consola era `#2e2e2e` y el del escritorio `#404040`, y el borde estaba escrito de dos maneras
 * distintas para el mismo valor. Nadie lo decidió; se fue separando.
 *
 * Este archivo es la fuente: `tests/tokens-visuales.test.ts` lee los dos CSS y falla si alguno
 * dice otra cosa o si a alguno le falta un token. No genera los CSS a propósito —son hojas que se
 * editan a mano todo el tiempo, y un archivo generado en el medio molesta más de lo que ayuda—:
 * los vigila.
 *
 * **Qué NO está acá** y por qué:
 * - El tema CLARO: la consola no tiene (se mira de noche, al lado de la terminal) y el escritorio sí.
 * - **La tipografía**: el escritorio deja elegir la letra de la app (`--app-font-family`) y la
 *   consola trae las suyas embebidas. Unificarlas sería sacarle a la app de escritorio una
 *   configuración que ya tiene; es una divergencia decidida, no una que se escapó.
 * - `--destructive`: el escritorio usa el rojo de los diffs de GitHub, que vive con los colores de
 *   git; la consola usa uno medido a 4,5:1 como texto sobre sus tres superficies. Son dos
 *   decisiones distintas y las dos están bien.
 * - Todo lo que es de una sola superficie: la barra de título, el editor, los colores de git.
 */

/**
 * La base, el tema oscuro de shadcn neutro, medido del DOLPHIN real. Donde las dos diferían, gana el
 * valor del escritorio: es el que viene del fork y el que la gente ve más horas por día.
 */
export const BASE_OSCURA = {
  background: "#0a0a0a",
  foreground: "#f0f0f0",
  card: "#171717",
  "card-foreground": "#f0f0f0",
  popover: "#171717",
  "popover-foreground": "#f0f0f0",
  primary: "#e5e5e5",
  "primary-foreground": "#171717",
  secondary: "#262626",
  "secondary-foreground": "#f0f0f0",
  muted: "#262626",
  "muted-foreground": "#acacac",
  accent: "#404040",
  "accent-foreground": "#f0f0f0",
  border: "rgb(255 255 255 / 0.07)",
  input: "rgb(255 255 255 / 0.15)",
  ring: "#737373",
} as const;

/**
 * La forma. No depende del tema, así que se declara en `:root` en las dos y se mira ahí: de este
 * radio salen todos los demás (`--radius-sm` a `--radius-4xl` se calculan a partir de él).
 */
export const FORMA = {
  radius: "0.625rem",
} as const;

/**
 * Lo que significa cada estado, en color. Esto es lo que de verdad no puede divergir: si en la
 * consola «hecho» es verde y en el escritorio es otra cosa, la misma rama se lee distinta según
 * dónde la mires.
 *
 * Los tres primeros son de un universo; los tres siguientes, de las columnas del tablero que no
 * tienen un estado propio (hecho usa `paso`, haciendo usa `corriendo`). Cada uno llega a 7:1 como
 * texto sobre el fondo.
 */
export const ESTADOS = {
  /** Pasó el portón. */
  paso: "#5fb07c",
  /** Se cayó. */
  murio: "#e5776d",
  /** Está corriendo ahora. */
  corriendo: "#d4a300",
  /** Una idea, esperando que alguien la apruebe. */
  idea: "#b9a6f7",
  /** Para hacer. */
  hacer: "#93b7e6",
  /** Para revisar: te espera a vos. */
  revisar: "#6fd0d6",
  /** El mar y el delfín: el único color que no significa un estado. */
  escena: "#a8cdea",
} as const;

export const TOKENS_COMPARTIDOS = { ...BASE_OSCURA, ...ESTADOS, ...FORMA } as const;

export type NombreDeToken = keyof typeof TOKENS_COMPARTIDOS;

/**
 * Dónde vive cada superficie, bajo qué selector declara el tema oscuro y bajo cuál lo que no
 * depende del tema. En la consola son el mismo (`:root`): no tiene tema claro.
 */
export const SUPERFICIES = [
  { nombre: "la consola", archivo: "ui/src/app.css", oscuro: ":root", raiz: ":root" },
  { nombre: "el escritorio", archivo: "escritorio/src/renderer/src/assets/main.css", oscuro: ".dark", raiz: ":root" },
] as const;

/**
 * Los tokens declarados adentro del primer bloque que abre con ese selector exacto. Un parser a
 * mano y no una librería de CSS: lo único que hay que entender es `--nombre: valor;`, y las hojas
 * traen `@media`, `color-mix` y anidado que cualquier parser completo nos haría instalar.
 */
export function tokensDeclarados(css: string, selector: string): Map<string, string> {
  const encontrados = new Map<string, string>();
  const lineas = css.split("\n");
  let dentro = false;
  let profundidad = 0;
  for (const linea of lineas) {
    if (!dentro) {
      // El selector puede venir solo («.dark {») o encabezando una lista («.dark,»).
      const abre = linea.trim().replace(/\s*\{\s*$/, "");
      if (abre === selector || abre === `${selector},`) {
        dentro = true;
        profundidad = linea.includes("{") ? 1 : 0;
      }
      continue;
    }
    if (profundidad === 0) {
      if (linea.includes("{")) profundidad = 1;
      continue;
    }
    const token = /^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/i.exec(linea);
    if (token) {
      encontrados.set(token[1]!, token[2]!.trim());
    }
    profundidad += (linea.match(/\{/g)?.length ?? 0) - (linea.match(/\}/g)?.length ?? 0);
    if (profundidad <= 0) break;
  }
  return encontrados;
}
