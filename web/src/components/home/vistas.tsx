"use client";

import { Avatar, BotonDibujado, Fila, Filas, Indicador, Tarjeta, useSecuencia, type Estado } from "./piezas";

/**
 * Las cuatro vistas de la portada: el tablero, los agentes en paralelo, el portón y el editor.
 *
 * Los datos son los de la demo de siempre —el repo `tienda`, «exportar los pedidos a CSV con filtro
 * por fecha», «2 tests en rojo · carrito.test.ts»— para que la web, las capturas de
 * `docs/terminal/` y la demo cuenten el mismo proyecto.
 */

interface Ficha {
  readonly titulo: string;
  readonly linea: string;
  readonly estado: Estado;
}

const COLUMNAS: readonly { readonly nombre: string; readonly fichas: readonly Ficha[]; readonly clase: string }[] = [
  { nombre: "Ideas", clase: "max-lg:hidden", fichas: [{ titulo: "Avisar cuando falta stock", linea: "la propuso el explorador", estado: "espera" }] },
  {
    nombre: "Para hacer",
    clase: "max-md:hidden",
    fichas: [
      { titulo: "Que el carrito acepte cupones", linea: "para esta noche", estado: "espera" },
      { titulo: "Login con el mail validado", linea: "lo anotó un agente", estado: "espera" },
    ],
  },
  {
    nombre: "Haciendo",
    clase: "",
    fichas: [
      // Las mismas tres que la vista «Agentes»: el tablero y los agentes son el mismo momento.
      { titulo: "Exportar los pedidos a CSV", linea: "Claude Code · plan de US$ 1,00", estado: "curso" },
      { titulo: "Arreglar el redondeo del IVA", linea: "Codex · tus scripts", estado: "curso" },
      { titulo: "Paginar el listado de clientes", linea: "Gemini CLI · escribiendo", estado: "curso" },
    ],
  },
  {
    nombre: "Para revisar",
    clase: "",
    fichas: [{ titulo: "Entrar con Google", linea: "pasó 8 de 8 · US$ 0,42", estado: "hecho" }],
  },
  { nombre: "Hecho", clase: "max-lg:hidden", fichas: [{ titulo: "Ordenar los pedidos por fecha", linea: "integrada · a3f9c21", estado: "hecho" }] },
];

export function VistaTablero() {
  return (
    <Tarjeta nombre="tienda · tablero" meta="3 trabajando" className="w-full max-w-[1000px]">
      <div className="grid grid-cols-2 gap-2 p-3 shadow-[inset_0_1px_0_rgb(11_13_16/0.06)] md:grid-cols-3 lg:grid-cols-5">
        {COLUMNAS.map((c) => (
          <div key={c.nombre} className={`min-w-0 rounded-[14px] bg-lienzo-2 p-2 ${c.clase}`}>
            <p className="px-1.5 pt-1 pb-2 text-[13px] font-medium text-tenue">
              {c.nombre} <span className="text-apagado tabular-nums">{c.fichas.length}</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {c.fichas.map((f) => (
                <li key={f.titulo} className="rounded-[var(--radius-control)] bg-white p-2.5 shadow-[0_1px_2px_rgb(11_13_16/0.06)]">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">
                      <Indicador estado={f.estado} chico />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug font-medium text-espuma">{f.titulo}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-tenue">{f.linea}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

export function VistaAgentes() {
  return (
    <Tarjeta nombre="tienda · 3 tareas en paralelo" meta="00:07" className="w-full max-w-[560px]">
      <Filas>
        <Fila
          titulo="Exportar los pedidos a CSV"
          texto="Claude Code · dolphin/exportar-csv · puerto 3101"
          estado="curso"
          pasos={[{ en: 2200, estado: "hecho", texto: "Claude Code · pasó el portón · US$ 0,96" }]}
        />
        <Fila titulo="Arreglar el redondeo del IVA" texto="Codex · dolphin/redondeo-iva · puerto 3102" estado="curso" />
        <Fila titulo="Paginar el listado de clientes" texto="Gemini CLI · dolphin/paginar · puerto 3103" estado="curso" />
      </Filas>
    </Tarjeta>
  );
}

export function VistaPorton() {
  return (
    <Tarjeta icono={<Avatar letra="C" />} nombre="dolphin/redondeo-iva · Codex" meta="portón" className="w-full max-w-[560px]">
      <Filas>
        <Fila titulo="configuración, política, seguridad, memoria" texto="4 fases gratis · pasaron en 4,3 s" estado="hecho" />
        <Fila
          titulo="tus scripts"
          texto="typecheck, test y lint"
          estado="curso"
          pasos={[
            { en: 1200, estado: "rebote", texto: "2 tests en rojo · carrito.test.ts" },
            { en: 2800, estado: "curso", texto: "vuelve al agente con el motivo" },
            { en: 4400, estado: "hecho", texto: "pasó en 48 s" },
          ]}
        />
        <Fila titulo="pantalla" texto="cinco personas usan la app de la rama" estado="espera" />
        <Fila titulo="visión y revisión" texto="pagan un modelo · corren al final" estado="espera" />
      </Filas>
    </Tarjeta>
  );
}

/** El código de ejemplo: el carrito de la tienda, antes de que el agente lo toque. */
const CODIGO = [
  "export function aplicarCupon(carrito: Carrito, cupon: Cupon) {",
  "  if (!cupon.activo) {",
  '    throw new ErrorDeCupon("El cupón no está activo")',
  "  }",
  "  const descuento = (carrito.subtotal * cupon.porcentaje) / 100",
  "  return { ...carrito, descuento }",
  "}",
];
const AGREGADO = ["  if (cupon.vence < new Date()) {", '    throw new ErrorDeCupon("El cupón venció")', "  }"];

export function VistaEditor() {
  // El cuadrito de Ctrl+K escribe y después propone: la secuencia corre una vez, al verlo.
  const { ref, actual } = useSecuencia<HTMLDivElement>({ estado: "curso" }, [{ en: 1600, estado: "hecho" }]);
  const propuso = actual.estado === "hecho";
  return (
    <Tarjeta
      icono={<span aria-hidden className="grid size-[22px] flex-none place-items-center rounded-full bg-lienzo-3 text-[10px] font-medium text-tinta">TS</span>}
      nombre="src/carrito/cupones.ts"
      meta="Ctrl+K"
      className="w-full max-w-[640px]"
    >
      <div ref={ref} className="relative overflow-hidden pt-3 pb-4 font-codigo text-[12.5px] leading-[22px] shadow-[inset_0_1px_0_rgb(11_13_16/0.06)] sm:text-[13px]">
        {CODIGO.slice(0, 4).map((l, i) => (
          <Linea key={i} n={i + 1} texto={l} />
        ))}
        {propuso ? AGREGADO.map((l, i) => <Linea key={`a${i}`} n={5 + i} texto={l} agregada />) : null}
        {CODIGO.slice(4).map((l, i) => (
          <Linea key={`b${i}`} n={(propuso ? 8 : 5) + i} texto={l} />
        ))}

        {/* El cuadrito de Ctrl+K, flotando sobre el código como en la app. */}
        <div className="mx-3 mt-3 rounded-[var(--radius-control)] bg-white p-2.5 font-texto shadow-[0_0_0_1px_rgb(11_13_16/0.06),0_8px_24px_-8px_rgb(11_13_16/0.25)] sm:mx-10">
          <p className="rounded-[8px] bg-lienzo-2 px-3 py-2 text-[13.5px] text-espuma">que rechace los cupones vencidos</p>
          <div className="mt-2 flex items-center gap-2 px-1">
            <Indicador estado={propuso ? "hecho" : "curso"} chico />
            <span className="flex-1 truncate text-[12.5px] text-tenue">{propuso ? "+3 líneas" : "Escribiendo…"}</span>
            {propuso ? (
              <>
                <BotonDibujado>Descartar</BotonDibujado>
                <BotonDibujado fuerte>Aceptar</BotonDibujado>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

function Linea({ n, texto, agregada = false }: { readonly n: number; readonly texto: string; readonly agregada?: boolean }) {
  return (
    <div className={`flex gap-4 pr-4 whitespace-pre ${agregada ? "bg-paso/10" : ""}`}>
      <span aria-hidden className="w-8 flex-none text-right text-apagado tabular-nums select-none">
        {n}
      </span>
      <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-pre ${agregada ? "text-paso" : "text-tinta"}`}>{texto}</span>
    </div>
  );
}
