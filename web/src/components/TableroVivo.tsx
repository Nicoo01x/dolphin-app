"use client";

import { useCallback, useRef, useState } from "react";
import { COLUMNAS, TARJETAS_INICIALES, type Columna, type TarjetaDelTablero } from "@/lib/tablero";

/**
 * El tablero de Dolphin, andando, en la portada.
 *
 * Hasta el 01/11 acá iba una captura en PNG. Nico la miró y dijo «todo esto que sea interactivo»:
 * una foto de un tablero no prueba nada, y lo que el producto hace —mover una tarjeta y que el
 * equipo arranque— se entiende moviéndola.
 *
 * Es el tablero de verdad en forma y en contenido: las columnas son las del producto y las
 * tarjetas son las de este mismo repo. Lo único que no pasa es lo que pasaría en tu máquina —
 * soltar en «Haciendo» no larga ningún agente— y eso lo dice la línea de abajo, porque prometer
 * en la landing algo que el producto no hace acá es mentira.
 *
 * Sin librería de arrastre: son treinta líneas de eventos de puntero. Una dependencia de 40 KB
 * para esto no entra en el presupuesto de la página.
 */

/** Dónde está el puntero y qué columna hay debajo. Fuera del componente: no depende de React. */
function columnaBajoElPuntero(cajas: Map<Columna, DOMRect>, x: number, y: number): Columna | null {
  for (const [columna, caja] of cajas) {
    if (x >= caja.left && x <= caja.right && y >= caja.top && y <= caja.bottom) {
      return columna;
    }
  }
  return null;
}

type Arrastre = {
  readonly id: string;
  readonly desde: Columna;
  /** Dónde agarró el dedo dentro de la tarjeta, para que no salte al empezar. */
  readonly offset: { x: number; y: number };
  readonly tamano: { ancho: number; alto: number };
  readonly en: { x: number; y: number };
  readonly sobre: Columna | null;
};

export function TableroVivo() {
  const [tarjetas, setTarjetas] = useState<readonly TarjetaDelTablero[]>(TARJETAS_INICIALES);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const cajas = useRef(new Map<Columna, DOMRect>());
  const marco = useRef<HTMLDivElement>(null);
  /**
   * Si hay un arrastre en curso, en un ref y no en el estado.
   *
   * El handler de movimiento está puesto SIEMPRE y pregunta por esto, en vez de montarse recién
   * cuando `arrastre` deja de ser null: el estado se aplica en el render siguiente, así que los
   * primeros movimientos del puntero —los que pasan entre que apretás y que React vuelve a
   * dibujar— caían en un elemento sin handler y se perdían. Y como sale temprano, mover el mouse
   * por encima del tablero sin arrastrar nada no vuelve a dibujar nada.
   */
  const arrastrando = useRef(false);

  const medirColumnas = useCallback(() => {
    for (const el of marco.current?.querySelectorAll<HTMLElement>("[data-columna]") ?? []) {
      cajas.current.set(el.dataset.columna as Columna, el.getBoundingClientRect());
    }
  }, []);

  const agarrar = useCallback(
    (e: React.PointerEvent<HTMLElement>, tarjeta: TarjetaDelTablero) => {
      // Solo el botón principal, y nunca con el dedo en el medio de un scroll.
      if (e.button !== 0) {
        return;
      }
      const caja = e.currentTarget.getBoundingClientRect();
      e.currentTarget.setPointerCapture(e.pointerId);
      medirColumnas();
      arrastrando.current = true;
      setArrastre({
        id: tarjeta.id,
        desde: tarjeta.columna,
        offset: { x: e.clientX - caja.left, y: e.clientY - caja.top },
        tamano: { ancho: caja.width, alto: caja.height },
        en: { x: e.clientX, y: e.clientY },
        sobre: tarjeta.columna,
      });
    },
    [medirColumnas],
  );

  const mover = useCallback((e: React.PointerEvent) => {
    if (!arrastrando.current) {
      return;
    }
    const { clientX: x, clientY: y } = e;
    setArrastre((a) => (a ? { ...a, en: { x, y }, sobre: columnaBajoElPuntero(cajas.current, x, y) } : null));
  }, []);

  const soltar = useCallback(() => {
    if (!arrastrando.current) {
      return;
    }
    arrastrando.current = false;
    setArrastre((a) => {
      if (a?.sobre && a.sobre !== a.desde) {
        const destino = a.sobre;
        setTarjetas((previas) => previas.map((t) => (t.id === a.id ? { ...t, columna: destino } : t)));
      }
      return null;
    });
  }, []);

  const llevada = arrastre ? tarjetas.find((t) => t.id === arrastre.id) : undefined;

  return (
    <div ref={marco} className="select-none" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      {/* En pantalla ancha las cinco columnas se reparten el lugar y entran enteras; en el celular
          son de ancho fijo y se corren de costado, sin barra a la vista (ver `.sin-barra`). */}
      <div className="sin-barra flex gap-2 overflow-x-auto p-2 md:p-3">
        {COLUMNAS.map((columna) => {
          const suyas = tarjetas.filter((t) => t.columna === columna.id);
          const recibiendo = arrastre?.sobre === columna.id && arrastre.desde !== columna.id;
          return (
            <section
              key={columna.id}
              data-columna={columna.id}
              aria-label={columna.nombre}
              className={`flex w-[232px] flex-none flex-col gap-1.5 rounded-[var(--radius-caja)] p-2 transition-colors duration-150 md:w-auto md:min-w-0 md:flex-1 md:basis-0 ${
                recibiendo ? "bg-app-4" : "bg-app-3"
              }`}
            >
              <h3 className="flex items-center gap-2 px-1.5 py-1 text-[13px] font-medium text-app-tinta">
                <span aria-hidden="true" className="size-1.5 flex-none rounded-full" style={{ background: columna.punto }} />
                {columna.nombre}
                <span className="ml-auto rounded-full bg-app-4 px-1.5 text-[12px] text-app-apagado tabular-nums">{suyas.length}</span>
              </h3>
              {suyas.map((t) => (
                <article
                  key={t.id}
                  onPointerDown={(e) => agarrar(e, t)}
                  // Una tarjeta que se arrastra es un control: se puede agarrar con el teclado y
                  // moverla con las flechas, que es como la mueve alguien que no usa el mouse.
                  tabIndex={0}
                  role="button"
                  aria-label={`${t.texto}. En ${columna.nombre}. Flechas izquierda y derecha para moverla.`}
                  onKeyDown={(e) => {
                    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (paso === 0) {
                      return;
                    }
                    e.preventDefault();
                    const i = COLUMNAS.findIndex((c) => c.id === t.columna);
                    const destino = COLUMNAS[Math.min(COLUMNAS.length - 1, Math.max(0, i + paso))];
                    if (destino) {
                      setTarjetas((previas) => previas.map((x) => (x.id === t.id ? { ...x, columna: destino.id } : x)));
                    }
                  }}
                  className={`cursor-grab touch-none rounded-[var(--radius-fila)] bg-app-2 px-2.5 py-2 text-[13px] leading-snug text-app-tinta transition-[background-color,opacity] duration-150 hover:bg-app-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electrico ${
                    arrastre?.id === t.id ? "opacity-25" : ""
                  }`}
                >
                  {t.texto}
                  {(t.etiqueta || t.comentarios) && (
                    <div className="mt-2 flex items-center gap-2">
                      {t.etiqueta && (
                        <span className="rounded-full bg-app-4 px-1.5 py-px text-[11px] text-app-tenue">{t.etiqueta}</span>
                      )}
                      {t.comentarios && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] text-app-apagado tabular-nums">
                          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3">
                            <path
                              d="M2.5 3.5h11v8h-6l-3 2.5v-2.5h-2z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="sr-only">
                            {t.comentarios === 1 ? "1 comentario" : `${t.comentarios} comentarios`}
                          </span>
                          <span aria-hidden="true">{t.comentarios}</span>
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {/* La tarjeta que viaja con el dedo: va en el aire, con el tamaño que tenía, y apenas
          girada, que es lo que hace que se lea como «levantada» y no como «duplicada». */}
      {arrastre && llevada && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rotate-[1.5deg] rounded-[var(--radius-fila)] bg-app-4 px-2.5 py-2 text-[13px] leading-snug text-app-espuma shadow-[0_12px_32px_-8px_rgba(0,0,0,0.8)]"
          style={{
            left: arrastre.en.x - arrastre.offset.x,
            top: arrastre.en.y - arrastre.offset.y,
            width: arrastre.tamano.ancho,
          }}
        >
          {llevada.texto}
        </div>
      )}
    </div>
  );
}
