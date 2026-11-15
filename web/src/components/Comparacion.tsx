import { Encabezado, Seccion } from "./Encabezado";
import { COLUMNAS, FILAS, type Cuanto } from "@/lib/comparacion";

/**
 * Qué hace Dolphin y qué no, al lado de las otras dos formas de trabajar con agentes.
 *
 * La tabla es de deska.dev, y lo que se copia no es el dibujo: es que la columna propia diga
 * «no» donde corresponde. Los datos y el porqué están en `lib/comparacion.ts`.
 *
 * La columna de Dolphin va sobre un tono más claro en vez de llevar un borde de acento: es la
 * misma regla que el resto de la página —la jerarquía la hacen las superficies, no las líneas—.
 *
 * En el celular NO se desplaza de costado: aprieta. Un `min-width` en la tabla le hacía crecer el
 * ancho a la página entera —medido: 117 px de scroll horizontal en toda la home— y encima un
 * scroller lateral adentro de una página que ya se desliza para abajo no lo encuentra nadie.
 * Desarmarla en doce bloques tampoco: se pierde lo único que una tabla hace bien, que es tener
 * dos celdas una al lado de la otra.
 */

/** Cómo se dibuja cada respuesta. El texto es el que lee un lector de pantalla. */
/* Tres FORMAS distintas, no tres colores: el verde se gasta solo en el sí. El «~» de la primera
   versión se leía como un tilde suelto en el medio de la celda. */
const MARCA: Record<Cuanto, { readonly marca: string; readonly clase: string; readonly dice: string }> = {
  si: { marca: "✓", clase: "text-[17px] text-paso", dice: "sí" },
  limitado: { marca: "◐", clase: "text-[14px] text-tenue", dice: "a medias" },
  no: { marca: "✕", clase: "text-[15px] text-tenue-2", dice: "no" },
};

function Celda({ cuanto, nota, propia }: { readonly cuanto: Cuanto; readonly nota?: string; readonly propia: boolean }) {
  const marca = MARCA[cuanto];
  return (
    <td className={`px-2 py-4 text-center align-middle md:px-4 ${propia ? "bg-lienzo-3" : ""}`}>
      <span className={marca.clase} aria-hidden="true">
        {marca.marca}
      </span>
      <span className="sr-only">{marca.dice}</span>
      {nota && <span className="mt-1 block text-[12px] leading-[1.35] text-apagado">{nota}</span>}
    </td>
  );
}

export function Comparacion() {
  return (
    <Seccion id="comparacion" etiqueta="comparacion-titulo" tonal>
      <Encabezado
        id="comparacion-titulo"
        titulo={
          <>
            Qué hace Dolphin.
            <br className="max-sm:hidden" /> Y qué no.
          </>
        }
        bajada="Las tres filas donde dice «no» son de verdad: con la máquina cerrada necesitás tu VPS, el tablero es de una persona y no hay nadie a quien llamar. Lo demás no lo hace ninguna de las otras dos formas."
      />
      <div className="mt-14">
        <table className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Dolphin comparado con un agente en la terminal y con los agentes que corren en la nube
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[36%] px-1 pb-4 text-[13px] font-medium text-apagado md:w-[42%]">
                <span className="sr-only">Qué se compara</span>
              </th>
              {COLUMNAS.map((columna, i) => (
                <th
                  key={columna}
                  scope="col"
                  className={`px-2 pb-4 text-center text-[12px] leading-[1.3] font-medium md:px-4 md:text-[13px] ${
                    i === 0 ? "rounded-t-caja bg-lienzo-3 text-espuma" : "text-apagado"
                  }`}
                >
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FILAS.map((fila) => (
              <tr key={fila.que} className="group">
                <th
                  scope="row"
                  className="px-1 py-4 pr-4 text-[14px] leading-[1.4] font-normal text-tinta md:pr-5 md:text-[15px]"
                >
                  {fila.que}
                </th>
                {fila.columnas.map((celda, i) => (
                  <Celda key={COLUMNAS[i]} cuanto={celda.cuanto} nota={celda.nota} propia={i === 0} />
                ))}
              </tr>
            ))}
            {/* Le cierra el tono a la columna propia: sin esta fila el rectángulo termina en seco. */}
            <tr aria-hidden="true">
              <td />
              <td className="h-3 rounded-b-caja bg-lienzo-3" />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}
