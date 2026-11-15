/**
 * Los cinco números de Dolphin, apenas abajo de la portada.
 *
 * Es lo que hace deska.dev debajo de su titular (la referencia que eligió Nico): antes de
 * explicar nada, poner los hechos duros. Acá son números y no adjetivos, y cada uno se puede
 * verificar en el repo — por eso el comentario de al lado dice de dónde sale.
 *
 * UNA superficie tonal y ningún divisor, que es la regla del gusto de Nico para las tiras de
 * métricas: cinco tarjetitas con borde es justo la forma en que esto se vuelve genérico.
 *
 * No lleva marquesina. La de la referencia repite las mismas frases en loop para llenar el
 * ancho; un número que se mueve no se puede leer de un vistazo, que es lo único que esta tira
 * tiene que lograr.
 */

/** Un hecho: el número grande y de dónde sale. Nada de acá se escribe «aproximadamente». */
const HECHOS: readonly { readonly dato: string; readonly linea: string }[] = [
  // web/src/lib/funciones.ts, que se arma leyendo el código del repo.
  { dato: "141", linea: "funciones, cada una con su nombre en el catálogo" },
  // src/motores-cli.ts: 3 con lectura de costo + los 7 de la tabla de motores.
  { dato: "10", linea: "motores: Claude, Codex, Gemini, Cursor y seis más" },
  // docs/porton.md: las fases que corren en orden antes de que la rama llegue a la tuya.
  { dato: "8", linea: "fases que cruza una rama antes de que la veas" },
  // dolphin sembrar: el mismo pedido escrito en paralelo, se queda el que pasa el portón.
  { dato: "N", linea: "veces escrito el mismo pedido; queda el que pasa" },
  // No hay backend: el repo entero corre local. Lo que tu agente mande a su proveedor es suyo.
  { dato: "0", linea: "servidores nuestros en el medio" },
];

export function TiraDeHechos() {
  return (
    <section aria-label="Dolphin en números" className="px-6 md:px-10">
      <div className="mx-auto w-full max-w-[1200px]">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-9 rounded-ventana bg-lienzo-2 px-7 py-9 md:grid-cols-5 md:px-10">
          {HECHOS.map((hecho) => (
            <div key={hecho.dato}>
              <dt className="text-[34px] leading-none font-medium tracking-[-0.022em] text-espuma tabular-nums">
                {hecho.dato}
              </dt>
              <dd className="mt-2.5 max-w-[22ch] text-[13px] leading-[1.45] text-apagado">{hecho.linea}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
