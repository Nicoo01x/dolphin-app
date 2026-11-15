/**
 * Los tonos de la escena del lienzo.
 *
 * Viven acá y no en el tema de la app a propósito: el lienzo es un MODO con su propio mundo, y
 * nada de esto se usa en el Dolphin de siempre. Por eso van como variables en el estilo del
 * contenedor del modo: entran al abrirlo y se van al salir, sin tocar una sola regla del resto.
 *
 * El fondo, la ventana y el acento salieron de medir Deska 1.29.0 con CDP el 01/11 (el informe
 * quedó en el scratchpad, `deska-rea/`). Los del vidrio, en cambio, salen de sus TOKENS
 * (`D:/Deska/packages/ui/src/tokens.css`), que es la fuente y no una aproximación: medidos de la
 * pantalla quedaban cerca y mal. Dos cosas que cambian de verdad:
 *
 * - el desenfoque lleva **saturación al 150 %**; sin eso el color de atrás pasa lavado y el
 *   vidrio parece plástico gris;
 * - el canto son DOS capas, un labio iluminado arriba y un anillo alrededor, «para que una
 *   esquina se lea como un espesor y no como un borde» (el comentario es de ellos).
 */
export const TEMA_DEL_LIENZO: React.CSSProperties = {
  ['--color-lienzo-fondo' as string]: '#0a0b0e',
  ['--color-lienzo-ventana' as string]: '#0e1013',
  ['--color-lienzo-contenido' as string]: '#07090c',
  ['--color-lienzo-vidrio' as string]: 'rgba(16, 18, 23, 0.74)',
  ['--lienzo-vidrio-desenfoque' as string]: 'blur(28px) saturate(150%)',
  ['--lienzo-vidrio-brillo' as string]:
    'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 46%, rgba(255,255,255,0) 70%)',
  ['--lienzo-vidrio-borde' as string]:
    'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.10)',
  ['--color-lienzo-acento' as string]: '#ff7a5c',
  ['--color-lienzo-halo' as string]: 'color-mix(in srgb, #ff7a5c 40%, transparent)',
  ['--lienzo-hairline' as string]: 'rgba(238, 241, 245, 0.06)',
  ['--lienzo-ease' as string]: 'cubic-bezier(0.16, 1, 0.3, 1)',
  background: 'var(--color-lienzo-fondo)'
}
