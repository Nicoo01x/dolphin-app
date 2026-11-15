/**
 * Los colores de Dolphin, no los de un clip cualquiera.
 *
 * El azul sale del mar de píxeles del delfín (escritorio/src/renderer/src/components/landing/
 * MarDePuntos.tsx) y los grises del tema oscuro de la app (assets/main.css): así el video se ve
 * como la ventana que el cartel está explicando y no como un render aparte.
 */
export const PALETA = {
  /** --background del tema oscuro. */
  fondo: '#0a0a0a',
  /** --card. */
  tarjeta: '#171717',
  /** Un tono más honda que la tarjeta, para la terminal adentro de la tarjeta. */
  hondo: '#101010',
  /** --foreground. */
  texto: '#fafafa',
  /** --muted-foreground. */
  tenue: '#a1a1a1',
  /** --border del tema oscuro, ya resuelto sobre el fondo. */
  linea: 'rgba(255,255,255,0.08)',
  lineaFuerte: 'rgba(255,255,255,0.14)',
  /** El azul hondo del mar. */
  marHondo: '#113354',
  /** El azul del lomo del delfín. */
  marino: '#1b6ca8',
  /** El azul eléctrico del reflejo: el acento. */
  electrico: '#19b9ff',
  /** La espuma. */
  espuma: '#e8f1f8',
  /** Verde solo para lo que terminó bien. */
  listo: '#4ade80'
} as const

/** Una sola familia, la del sistema: el clip no espera a que baje ninguna fuente. */
export const LETRA =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Roboto, sans-serif'
export const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'
