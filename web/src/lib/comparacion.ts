/**
 * La tabla honesta: qué hace Dolphin y qué no, al lado de las dos formas en que hoy se trabaja
 * con agentes.
 *
 * Es la pieza de deska.dev que la vuelve creíble, y lo que la hace creíble es que la columna
 * propia también dice «no». Tres veces acá: con la máquina cerrada, en equipo y con soporte. Una
 * tabla donde la columna de uno gana todas las filas no la lee nadie — se nota el truco desde la
 * segunda fila y a partir de ahí no se cree ninguna.
 *
 * Regla para editar esto: cada «sí» tiene que poder señalarse en el repo. Si una fila necesita
 * una explicación para ser cierta, va en `nota`, no en el título de la fila.
 */

/** Qué tan cierto es, para esa columna. */
export type Cuanto = "si" | "limitado" | "no";

export type FilaComparada = {
  readonly que: string;
  /** En el orden de COLUMNAS. */
  readonly columnas: readonly { readonly cuanto: Cuanto; readonly nota?: string }[];
};

export const COLUMNAS = ["Dolphin", "Un agente en tu terminal", "Los que corren en la nube"] as const;

const SI = { cuanto: "si" } as const;
const NO = { cuanto: "no" } as const;
const con = (nota: string) => ({ cuanto: "limitado", nota }) as const;
const si = (nota: string) => ({ cuanto: "si", nota }) as const;
const no = (nota: string) => ({ cuanto: "no", nota }) as const;

export const FILAS: readonly FilaComparada[] = [
  {
    que: "Varias tareas a la vez, cada una en su rama",
    columnas: [SI, NO, con("una por pedido")],
  },
  {
    que: "La rama se prueba sola antes de que la mires",
    columnas: [si("ocho fases"), NO, NO],
  },
  {
    que: "El mismo pedido escrito N veces; queda el que pasa",
    columnas: [SI, NO, NO],
  },
  {
    que: "Elegís qué modelo escribe y cuál prueba",
    columnas: [SI, NO, NO],
  },
  {
    que: "Cada corrección tuya queda guardada para la próxima",
    columnas: [SI, NO, con("dentro de la charla")],
  },
  {
    que: "Editor, terminal, chat y tablero en la misma ventana",
    columnas: [SI, NO, con("en el navegador")],
  },
  {
    que: "Anda con la suscripción que ya pagás",
    columnas: [SI, SI, no("se paga aparte")],
  },
  {
    que: "Tu repo no sube a ningún servidor nuestro",
    columnas: [SI, SI, NO],
  },
  {
    que: "Sigue trabajando con la máquina cerrada",
    columnas: [con("en tu VPS, por SSH"), NO, SI],
  },
  {
    que: "Varias personas en el mismo tablero",
    columnas: [no("todavía no"), NO, SI],
  },
  {
    que: "Soporte con contrato y alguien a quien llamar",
    columnas: [NO, NO, SI],
  },
  {
    que: "El código entero a la vista",
    columnas: [si("MIT"), con("según cuál"), NO],
  },
];
