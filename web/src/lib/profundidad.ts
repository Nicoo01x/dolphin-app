/**
 * Bajar por la página es sumergirse: el scroll entero va de la superficie (0) al fondo (1).
 * El océano, el profundímetro y las secciones leen la misma cuenta.
 */

/** Hasta acá la cámara está arriba del agua; entre los dos números cruza la superficie. */
export const EMPIEZA_A_HUNDIRSE = 0.035;
export const YA_ABAJO = 0.13;

/** La fosa de las Marianas, el punto más hondo que se conoce. */
export const FONDO_EN_METROS = 10_994;

/**
 * Qué parte del océano recorre una página, de 0 (la superficie) a 1 (el fondo). La home baja
 * entera; la doc vive entre la zona de luz y la medianoche, donde el texto largo se lee tranquilo.
 */
export type Tramo = readonly [desde: number, hasta: number];
export const TODO_EL_MAR: Tramo = [0, 1];

/**
 * Cuánto avanzó la estampa: 0 mientras su borde de arriba no llegó al tope de la pantalla, 1
 * cuando terminó de salir. Se mide contra el elemento y no contra el scroll de la página, así la
 * misma estampa se comporta igual esté donde esté y en la página que sea.
 */
export function profundidadDeLaLamina(elemento: Element, tramo: Tramo = TODO_EL_MAR): number {
  const caja = elemento.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -caja.top / Math.max(1, caja.height)));
  return tramo[0] + (tramo[1] - tramo[0]) * p;
}

/** Metros bajo la superficie: nada hasta cruzar, y cada vez más rápido, como una caída al abismo. */
export function metrosDe(d: number): number {
  if (d <= YA_ABAJO) return 0;
  return Math.round(Math.pow((d - YA_ABAJO) / (1 - YA_ABAJO), 1.7) * FONDO_EN_METROS);
}

export const ZONAS = [
  { desde: 0, nombre: "Superficie" },
  { desde: 1, nombre: "Zona de luz" },
  { desde: 200, nombre: "Penumbra" },
  { desde: 1_000, nombre: "Medianoche" },
  { desde: 4_000, nombre: "Abisal" },
  { desde: 6_000, nombre: "Hadal" },
] as const;

export function zonaDe(metros: number): string {
  let nombre: string = ZONAS[0].nombre;
  for (const z of ZONAS) if (metros >= z.desde) nombre = z.nombre;
  return nombre;
}
