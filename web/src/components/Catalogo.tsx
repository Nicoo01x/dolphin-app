"use client";

import { useMemo, useState } from "react";
import { Encabezado, Seccion } from "./Encabezado";

/**
 * El índice general: todo lo que hace Dolphin, capítulo por capítulo.
 *
 * Las seis funciones con nombre propio están arriba, con el delfín. Esto es el resto: el
 * inventario completo, que sale de leer el código del repo (`lib/funciones.ts`). Es largo a
 * propósito —la pregunta que contesta es «¿esto hace lo que necesito?»— y por eso se lee como un
 * sumario y no como una grilla de tarjetas: una banda por capítulo, tres columnas por renglón
 * (número y nombre · qué hace · dónde vive) y todo numerado, que es lo que hace que una lista de
 * ciento treinta y siete cosas se pueda escanear.
 *
 * La lista no va dentro de ninguna caja: lo que la ordena son los filetes. La lista se sale 16 px
 * para cada lado de la columna de texto y cada banda los recupera como padding, así los renglones
 * arrancan donde arranca el título y la banda de hover tiene aire a los costados.
 */

export interface FuncionDelCatalogo {
  readonly nombre: string;
  readonly queHace: string;
  readonly donde?: readonly string[];
  readonly comando?: string;
}

export interface CapituloDelCatalogo {
  readonly id: string;
  readonly titulo: string;
  readonly resumen: string;
  readonly funciones: readonly FuncionDelCatalogo[];
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;

export function Catalogo({ capitulos }: { capitulos: readonly CapituloDelCatalogo[] }) {
  // Cerrados menos el primero, en TODAS las pantallas.
  //
  // Antes abrían los ocho «para que se vea todo», y medido en la página publicada eso daba una
  // sección de 13.625 px con 29.000 caracteres: el 63 % del alto de la home entera, que mide
  // 21.463. El inventario completo no es lo que trae a alguien a una landing, y la bajada ya
  // decía «tocá un capítulo para abrirlo» mientras la página hacía lo contrario.
  //
  // Lo que se pierde no es el contenido —sigue entero en el HTML, buscable y indexable— sino la
  // obligación de scrollearlo. El primero abierto muestra la forma de la lista sin pedir un clic
  // para entender qué es esto.
  const [cerrados, setCerrados] = useState<ReadonlySet<string>>(
    () => new Set(capitulos.slice(1).map((c) => c.id))
  );
  const alternar = (id: string) =>
    setCerrados((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });

  const total = capitulos.reduce((n, c) => n + c.funciones.length, 0);

  /**
   * Buscar adentro del índice. Con ciento treinta y siete funciones, la pregunta que trae a alguien
   * acá es «¿hace tal cosa?», y la contesta en dos segundos; sin esto hay que abrir ocho capítulos
   * y leer. Busca en el nombre, en qué hace y en el comando, sin tildes ni mayúsculas, así «tunel»
   * encuentra «túnel».
   */
  const [busqueda, setBusqueda] = useState("");
  const buscado = busqueda.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const filtrados = useMemo(() => {
    if (!buscado) return capitulos;
    const entra = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(buscado);
    return capitulos
      .map((c) => ({ ...c, funciones: c.funciones.filter((f) => entra(f.nombre) || entra(f.queHace) || entra(f.comando ?? "") || entra((f.donde ?? []).join(" "))) }))
      .filter((c) => c.funciones.length > 0);
  }, [capitulos, buscado]);
  const encontradas = filtrados.reduce((n, c) => n + c.funciones.length, 0);

  return (
    <Seccion id="catalogo" etiqueta="catalogo-titulo">
      <div>
        <Encabezado
          id="catalogo-titulo"
          titulo="Todo lo que hace."
          bajada={`El inventario completo, sacado del código: ${capitulos.length} capítulos y ${total} funciones. Buscá la tuya, o abrí el capítulo.`}
        />

        {/* El buscador es un control, así que es una superficie un tono más honda y no una línea
            con un campo apoyado encima. */}
        <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-caja)] bg-lienzo-2 px-4 py-1">
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-[14px] text-apagado">Buscar</span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              type="search"
              name="buscar-funcion"
              placeholder="túnel, excel, telegram, rama…"
              className="min-w-0 flex-1 bg-transparent py-2.5 font-codigo text-[14px] text-espuma placeholder:text-apagado focus:outline-none"
            />
          </label>
          <span aria-live="polite" className="text-[13px] text-apagado tabular-nums">
            {buscado ? `${encontradas} de ${total}` : `${total} funciones`}
          </span>
        </div>

        {buscado && encontradas === 0 && (
          <p className="mt-10 text-[17px] text-tinta/75">
            No hay nada con «{busqueda.trim()}». Probá con otra palabra, o escribilo en{" "}
            <a href="/docs" className="text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
              la documentación
            </a>
            .
          </p>
        )}

        {/* Los capítulos, separados por aire y no por filetes: cada uno es una banda que se abre. */}
        <ol className="-mx-2 mt-8 flex flex-col gap-1.5 md:-mx-4">
          {filtrados.map((capitulo, i) => {
            // Buscando, los capítulos se abren solos: esconder lo que acabás de encontrar no tiene sentido.
            const abierto = Boolean(buscado) || !cerrados.has(capitulo.id);
            return (
              <li key={capitulo.id} className="overflow-hidden rounded-[var(--radius-ventana)] bg-lienzo-2/60">
                <button
                  type="button"
                  onClick={() => alternar(capitulo.id)}
                  aria-expanded={abierto}
                  aria-controls={`capitulo-${capitulo.id}`}
                  className="group grid w-full grid-cols-[2rem_1fr] items-start gap-x-4 px-4 py-7 text-left transition-colors hover:bg-lienzo-3/50 md:grid-cols-[3rem_1fr_auto] md:gap-x-8 md:px-6"
                >
                  <span className="pt-2 text-[17px] font-medium tracking-[-0.022em] text-tinta/60">{ROMANOS[i] ?? i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[clamp(24px,2.6vw,32px)] leading-[1.08] font-medium tracking-[-0.025em] text-espuma">{capitulo.titulo}</span>
                    <span className="mt-2 block max-w-2xl text-[15px] leading-relaxed text-tinta/75">{capitulo.resumen}</span>
                  </span>
                  <span className="col-span-2 mt-3 text-[12px] text-tinta/55 md:col-span-1 md:mt-2 md:text-right">
                    {String(capitulo.funciones.length).padStart(2, "0")} {capitulo.funciones.length === 1 ? "función" : "funciones"}
                    <span className="ml-3 inline-block transition-transform group-aria-expanded:rotate-180">↓</span>
                  </span>
                </button>

                {abierto && (
                  <ol id={`capitulo-${capitulo.id}`} className="flex flex-col gap-0.5 px-2 pb-8 md:px-4 md:pl-[6rem]">
                    {capitulo.funciones.map((f, j) => (
                      <li
                        key={f.nombre}
                        // Filas tonales con hover, no una retícula de filetes: con 130 funciones,
                        // las líneas hacían de esto una planilla. Columnas de ancho fijo
                        // (`minmax(0,…)`) y no `auto`: con `auto` la columna del comando se agranda
                        // con el comando más largo del capítulo y los tres renglones de al lado
                        // quedan desalineados entre sí.
                        className="grid grid-cols-1 gap-x-8 gap-y-1 rounded-[var(--radius-fila)] px-3 py-3 transition-colors hover:bg-lienzo-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.9fr)_minmax(0,1.1fr)] md:items-baseline"
                      >
                        <span className="flex items-baseline gap-3">
                          <span className="font-codigo text-[11px] text-apagado tabular-nums">
                            {ROMANOS[i] ?? i + 1}.{String(j + 1).padStart(2, "0")}
                          </span>
                          <span className="text-[20px] font-medium tracking-[-0.022em] leading-tight text-espuma">{f.nombre}</span>
                        </span>
                        <span className="text-[14px] leading-relaxed text-tinta/80">{f.queHace}</span>
                        <span className="font-codigo text-[12px] break-words text-apagado md:text-right">{f.comando ?? (f.donde ? f.donde.join(" · ") : "")}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Seccion>
  );
}
