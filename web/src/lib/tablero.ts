/**
 * Lo que muestra el tablero de la portada: las columnas del producto y las tarjetas de este mismo
 * repo, tal como estaban el 01/11/2026.
 *
 * Son de verdad: salieron del tablero de Dolphin corriendo sobre `dolphin-app`. Si alguna vez hay
 * que renovarlas, se copian de ahí y no se inventan — una landing con tarjetas inventadas de un
 * producto de tareas se nota enseguida.
 */

export type Columna = "ideas" | "para-hacer" | "haciendo" | "para-revisar" | "hecho";

export interface TarjetaDelTablero {
  readonly id: string;
  readonly texto: string;
  readonly columna: Columna;
  readonly etiqueta?: string;
  readonly comentarios?: number;
}

/** El color del punto es el del estado en la consola; no es un acento de la página. */
export const COLUMNAS: readonly { readonly id: Columna; readonly nombre: string; readonly punto: string }[] = [
  { id: "ideas", nombre: "Ideas", punto: "#a78bfa" },
  { id: "para-hacer", nombre: "Para hacer", punto: "#60a5fa" },
  { id: "haciendo", nombre: "Haciendo", punto: "#fbbf24" },
  { id: "para-revisar", nombre: "Para revisar", punto: "#22d3ee" },
  { id: "hecho", nombre: "Hecho", punto: "#7fd1a4" },
];

export const TARJETAS_INICIALES: readonly TarjetaDelTablero[] = [
  { id: "t1", texto: "Enseñarle el tablero a cualquier agente desde CLAUDE.md y AGENTS.md", columna: "ideas" },
  { id: "t2", texto: "Entregas: juntar tarjetas en un hito con su avance", columna: "ideas" },
  { id: "t3", texto: "Avisar cuando un agente se trabó", columna: "ideas" },
  { id: "t4", texto: "Probar la rama en tu máquina con un toque", columna: "ideas" },
  { id: "t5", texto: "Tarjetas que se repiten solas", columna: "ideas" },
  { id: "t6", texto: "Los TODO del código como Ideas, sin gastar tokens", columna: "ideas" },

  { id: "t7", texto: "Dolphin mejora su propio sistema: propone y prueba sus propias estrategias", columna: "para-hacer" },
  { id: "t8", texto: "La revisión adentro de la tarjeta: el diff, el portón, integrar o devolver", columna: "para-hacer" },
  { id: "t9", texto: "La noche toma la columna Para hacer y deja todo en Para revisar", columna: "para-hacer" },
  { id: "t10", texto: "Compartir el tablero: sincronizarlo a la rama dolphin/tablero", columna: "para-hacer" },
  { id: "t11", texto: "El tablero en la terminal, como sección propia", columna: "para-hacer" },

  { id: "t12", texto: "El tablero en el escritorio: la sección Tareas en la barra lateral", columna: "haciendo", comentarios: 1 },

  { id: "t13", texto: "La cola de Telegram falla con dos drenados a la vez", columna: "hecho", etiqueta: "Bug", comentarios: 1 },
  { id: "t14", texto: "Darle «dale» a una tarjeta desde la consola y el escritorio", columna: "hecho", comentarios: 1 },
  { id: "t15", texto: "Dependencias entre tarjetas y «lo próximo que se puede hacer»", columna: "hecho", etiqueta: "Idea", comentarios: 1 },
  { id: "t16", texto: "Arrastrar una tarjeta a Haciendo arranca el equipo", columna: "hecho", etiqueta: "Idea", comentarios: 1 },
  { id: "t17", texto: "Las tarjetas y dolphin tarea", columna: "hecho" },
];
