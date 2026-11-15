/**
 * El tinte de color de una sección del listado.
 *
 * El color que le ponés a un proyecto se veía en un cuadradito de 16 px —el glifo del repo— y la
 * sección seguía igual que las demás: servía para encontrar el ícono, no la sección. Acá tiñe el
 * botón entero, translúcido y flojo (Nico, 07/11: «que se ponga todo el botón en ese color pero
 * traslúcido, no tan fuerte»). Al 12 % el nombre conserva su contraste y la fila se sigue leyendo
 * como una fila, no como un bloque de color.
 *
 * Capa y no `background` del botón: el botón ya pinta tres fondos propios con clases —arrastre,
 * resalte al revelar y destino de drop— y un color en línea les ganaría a los tres. Siendo el
 * primer hijo, el ícono y el texto se dibujan encima; con `pointer-events-none` no se come ni el
 * clic ni el arrastre.
 */
export function SectionColorLayer({
  color
}: {
  color: string | undefined
}): React.JSX.Element | null {
  if (!color) {
    return null
  }
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-md"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    />
  )
}
