/** Las secciones del sitio: la barra de arriba y el pie leen de acá. */

export interface Enlace {
  readonly href: string;
  readonly nombre: string;
}

/** La barra de arriba. En el celular quedan las que tienen `siempre`. */
export const SECCIONES: readonly (Enlace & { readonly siempre?: boolean })[] = [
  // El 12/11/2026 la home dejó de tener una sección #porton (el portón es un paso del ciclo):
  // el link va a su página de la doc.
  { href: "/docs/porton", nombre: "El portón" },
  { href: "/escritorio", nombre: "Escritorio" },
  { href: "/bots", nombre: "Bots", siempre: true },
  { href: "/docs", nombre: "Docs", siempre: true },
  { href: "/preguntas", nombre: "Preguntas" },
  { href: "/novedades", nombre: "Novedades" },
];

export const PIE: readonly { readonly titulo: string; readonly enlaces: readonly Enlace[] }[] = [
  {
    titulo: "Dolphin",
    enlaces: [
      // Las anclas son las secciones de la home del 12/11/2026 (ver app/page.tsx).
      { href: "/", nombre: "Inicio" },
      { href: "/#ciclo", nombre: "Cómo se trabaja" },
      { href: "/#agentes", nombre: "Con qué agentes" },
      { href: "/#ademas", nombre: "Todo lo demás" },
      { href: "/escritorio", nombre: "App de escritorio" },
      { href: "/descargar", nombre: "Descargar" },
      { href: "/preguntas", nombre: "Preguntas" },
      { href: "/novedades", nombre: "Novedades" },
      { href: "/privacidad", nombre: "Privacidad" },
    ],
  },
  {
    titulo: "Bots",
    enlaces: [
      { href: "/bots", nombre: "Dolphin bots" },
      { href: "/bots#carpeta", nombre: "Un bot por dentro" },
      { href: "/bots#plantillas", nombre: "Plantillas" },
      { href: "/bots#comparacion", nombre: "Frente a otros" },
      { href: "/docs/bots", nombre: "Doc de los bots" },
    ],
  },
  {
    titulo: "Docs",
    enlaces: [
      { href: "/docs/instalacion", nombre: "Instalación" },
      { href: "/docs/primeros-pasos", nombre: "Primeros pasos" },
      { href: "/docs/equipo", nombre: "El equipo" },
      { href: "/docs/porton", nombre: "El portón" },
      { href: "/docs/cli", nombre: "Referencia de la CLI" },
      { href: "/docs/configuracion", nombre: "Configuración" },
    ],
  },
];
