/**
 * Un módulo que se carga bien pero no exporta por defecto una fábrica: el
 * error más fácil de cometer escribiendo una fase. Tiene que decirlo, no
 * romperse.
 */
export const fase = { nombre: "la mía", costo: "gratis", correr: async () => ({ paso: true, detalle: "ok" }) };
