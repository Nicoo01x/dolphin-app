import { Navegacion } from "./Navegacion";
import { Pie } from "./Pie";

/**
 * Lo que comparten todas las páginas: la barra de arriba y el pie, sobre el negro del sitio.
 *
 * Hasta el 31/10 acá iba el océano, fijo detrás de todo, y el profundímetro que lo acompañaba. El
 * mar ahora es una estampa (`laminas/Mar`) que se pone donde suma: el fondo es negro liso y el
 * texto se lee sin vidrios ni sombras.
 */
export function Escena({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navegacion />
      <main id="contenido">{children}</main>
      <Pie />
    </>
  );
}
