/**
 * La doc es datos: cada página es una lista de bloques que `components/docs/Bloques.tsx` dibuja.
 * Dentro de un texto, `así` es código y [esto](/docs/x) es un link.
 */

export type Bloque =
  | { readonly t: "p"; readonly texto: string }
  | { readonly t: "h2"; readonly texto: string; readonly id: string }
  | { readonly t: "h3"; readonly texto: string }
  | { readonly t: "codigo"; readonly codigo: string; readonly titulo?: string }
  | { readonly t: "lista"; readonly items: readonly string[] }
  | { readonly t: "tabla"; readonly columnas: readonly string[]; readonly filas: readonly (readonly string[])[] }
  /** Un aparte: lo que conviene saber antes de seguir. */
  | { readonly t: "nota"; readonly texto: string }
  /** Una ruta de pasos, dibujada como un rumbo en la carta (sin números). */
  | { readonly t: "ruta"; readonly pasos: readonly { readonly titulo: string; readonly texto: string; readonly codigo?: string }[] }
  /** Un árbol de archivos: nivel 0 es la carpeta de arriba. */
  | { readonly t: "arbol"; readonly filas: readonly { readonly nombre: string; readonly nivel: number; readonly nota?: string }[] }
  /** Un diagrama propio, por nombre (ver components/docs/Diagramas.tsx). */
  | { readonly t: "diagrama"; readonly cual: "portón" | "equipo" | "permiso" };

export interface PaginaDeDoc {
  /** "" es la portada de la doc (/docs). */
  readonly slug: string;
  readonly titulo: string;
  /** Una línea: va debajo del título, en la barra y en la descripción de la página. */
  readonly resumen: string;
  readonly grupo: GrupoDeDoc;
  /** De qué archivos del código sale lo que dice: si cambian, esta página se revisa. */
  readonly fuentes: readonly string[];
  readonly bloques: readonly Bloque[];
}

export type GrupoDeDoc = "Empezar" | "Orquestar" | "Bots" | "Dónde se usa" | "Referencia";
export const GRUPOS: readonly GrupoDeDoc[] = ["Empezar", "Orquestar", "Bots", "Dónde se usa", "Referencia"];
