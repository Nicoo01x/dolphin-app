import { Demo } from "./Demo";
import { Encabezado, Seccion } from "./Encabezado";

/**
 * La sección donde se ve la siembra, en el sitio.
 *
 * Va justo después de «cómo funciona»: ahí la persona acaba de leer que tres ramas compiten y que
 * el portón corta la que no pasa, y lo único que falta es verlo. Antes del catálogo de funciones,
 * porque el inventario entero se lee distinto cuando ya entendiste qué hace el producto. (Sin el
 * número acá: lo cuenta `CUANTAS_FUNCIONES` y un comentario con una cifra se queda viejo solo.)
 */
export function EnVivo() {
  return (
    <Seccion id="demo" etiqueta="demo-titulo" tonal>
      <Encabezado
        id="demo-titulo"
        titulo="Tres ramas, un portón."
        bajada="La misma tarea escrita tres veces, cada una con su enfoque. Llega la que pasó todo con el diff más chico. Corre acá, sin instalar nada."
      />

      <div className="ventana-captura mt-14 bg-lienzo p-5 md:p-8">
        <Demo />
      </div>
    </Seccion>
  );
}
