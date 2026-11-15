"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { comoVa, DURACION, enElMomento, FASES, TAREA, type EstadoDeCelda, type Fase } from "@/lib/demo";
import { useQuieto } from "@/lib/quieto";

/**
 * La siembra cruzando el portón, acá mismo, sin instalar nada.
 *
 * Es lo que más cuesta explicar con palabras: que de tres ramas que arrancan juntas, una se corta
 * en sintaxis sin gastar un peso, otra rebota en los tests y vuelve corregida, y la que se entrega
 * es la que pasó todo con el diff más chico. Contado, suena a promesa; visto, se entiende en doce
 * segundos.
 *
 * El guion es el mismo que `dolphin tablero --demo` en la terminal, y hay un test en el repo que
 * falla si dejan de contar la misma historia (ver lib/demo.ts). Acá no corre ningún agente: esto
 * reproduce una grabación, y lo dice.
 *
 * Colores: el acento eléctrico es para lo que está pasando AHORA, el blanco para lo que pasó y el
 * apagado para lo que se cortó. Nada de verde y rojo: el sitio tiene un acento y es uno solo.
 */

/** La película va un poco más rápido que la siembra de verdad: doce segundos mirando una grilla es mucho. */
const VELOCIDAD = 1.5;

const NOMBRE_DE_FASE: Record<Fase, string> = { escribe: "escribe", sintaxis: "sintaxis", test: "test", peso: "peso" };

/** Qué se dibuja en una celda según cómo esté. El texto es para el lector de pantalla. */
const CELDA: Record<EstadoDeCelda, { marca: string; clase: string; dice: string }> = {
  nada: { marca: "·", clase: "text-tinta/25", dice: "sin empezar" },
  haciendo: { marca: "•", clase: "text-electrico animate-pulse", dice: "en eso" },
  corrigiendo: { marca: "↻", clase: "text-electrico animate-pulse", dice: "corrigiendo" },
  paso: { marca: "✓", clase: "text-espuma", dice: "pasó" },
  corta: { marca: "✕", clase: "text-tinta/45", dice: "se cortó" },
};

export function Demo() {
  const [t, setT] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const desde = useRef(0);
  const cuadro = useRef(0);

  // Sin movimiento: se muestra terminada y se reproduce a mano si la persona quiere. Una grilla
  // que se pinta sola es justo lo que molesta a quien pidió que las cosas no se muevan.
  const quieto = useQuieto();

  /**
   * Arranca el reloj desde donde está, o desde cero.
   *
   * `desdeCero` es un argumento y no «leer `t` después de ponerlo en 0» porque el estado de React
   * todavía vale lo de antes cuando esta función corre: con «De nuevo» al final, el reloj
   * arrancaba en el segundo 12 y la película duraba un parpadeo.
   */
  const correr = useCallback(
    (desdeCero = false) => {
      const inicio = desdeCero ? 0 : t;
      if (desdeCero) setT(0);
      desde.current = performance.now() - inicio / VELOCIDAD;
      setCorriendo(true);
    },
    [t],
  );

  useEffect(() => {
    if (!corriendo) return;
    const paso = () => {
      const ahora = (performance.now() - desde.current) * VELOCIDAD;
      if (ahora >= DURACION) {
        setT(DURACION);
        setCorriendo(false);
        return;
      }
      setT(ahora);
      cuadro.current = requestAnimationFrame(paso);
    };
    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
  }, [corriendo]);

  // Arranca sola cuando se la ve, una sola vez: es una demo, no un video que se pone a sonar.
  // Con «menos movimiento» no arranca nada y se muestra el final, que es la información completa.
  const caja = useRef<HTMLDivElement>(null);
  const yaArranco = useRef(false);
  useEffect(() => {
    if (quieto) {
      setT(DURACION);
      return;
    }
    const nodo = caja.current;
    if (!nodo || yaArranco.current) return;
    const mirando = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        mirando.disconnect();
        yaArranco.current = true;
        desde.current = performance.now();
        setCorriendo(true);
      },
      { threshold: 0.4 },
    );
    mirando.observe(nodo);
    return () => mirando.disconnect();
  }, [quieto]);

  const estado = enElMomento(t);
  const termino = t >= DURACION;

  return (
    <div ref={caja} className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-espuma/10 pb-3">
        <p className="text-[14px] text-apagado">La tarea</p>
        <p className="font-codigo text-[13px] text-tinta/70 tabular-nums">{(t / 1000).toFixed(1)} s</p>
      </div>
      <p className="mt-3 font-codigo text-[15px] text-espuma">{TAREA}</p>

      {/* La grilla: una fila por rama, una columna por fase. Una sola superficie partida por
          filetes, como el resto del sitio.
          `relative` no es decorativo: los textos `sr-only` de cada celda son `position: absolute`,
          y sin un ancestro posicionado ADENTRO del scroll se cuelgan del body, se escapan del
          recorte y le suman 55 px de desborde horizontal a la página entera en el teléfono. */}
      <div className="relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {/* El reparto a mano: con el ancho automático, el nombre y el enfoque se comían la
                  mitad de la tabla y las cuatro fases quedaban apretadas contra el diff. */}
              <th scope="col" className="w-[34%] border-b border-espuma/10 pb-2 text-[11px] font-normal text-tinta/55">
                rama
              </th>
              {FASES.map((f) => (
                <th
                  key={f}
                  scope="col"
                  className="w-[11%] border-b border-espuma/10 px-2 pb-2 text-center text-[11px] font-normal text-tinta/55"
                >
                  {NOMBRE_DE_FASE[f]}
                </th>
              ))}
              <th scope="col" className="border-b border-espuma/10 pb-2 text-right text-[11px] font-normal text-tinta/55">
                diff
              </th>
            </tr>
          </thead>
          <tbody>
            {estado.ramas.length === 0 && (
              <tr>
                <td colSpan={FASES.length + 2} className="py-6 text-[15px] text-tinta/55">
                  abriendo los worktrees…
                </td>
              </tr>
            )}
            {estado.ramas.map((r) => (
              <tr key={r.id} className={r.viva ? "" : "opacity-55"}>
                <th scope="row" className="border-b border-espuma/10 py-3 pr-4 align-middle font-normal">
                  <span className="font-codigo text-[15px] text-espuma">{r.id}</span>
                  <span className="ml-2 text-[13px] text-tinta/60">{r.enfoque}</span>
                  {r.modelo && <span className="ml-2 text-[12px] text-tinta/45">{r.modelo}</span>}
                </th>
                {FASES.map((f) => {
                  const celda = CELDA[r.celdas[f]];
                  return (
                    <td key={f} className="border-b border-espuma/10 px-2 py-3 text-center align-middle">
                      <span className={`font-codigo text-[17px] leading-none ${celda.clase}`} title={`${NOMBRE_DE_FASE[f]}: ${celda.dice}`}>
                        {celda.marca}
                      </span>
                      <span className="sr-only">
                        {NOMBRE_DE_FASE[f]}: {celda.dice}
                      </span>
                    </td>
                  );
                })}
                <td className="border-b border-espuma/10 py-3 text-right align-middle font-codigo text-[13px] tabular-nums text-tinta/70">
                  {r.forma ? `${r.forma.archivos} arch · +${r.forma.agregadas} −${r.forma.quitadas}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lo que se cortó, con su motivo: es la mitad de la gracia —muere gratis y se sabe por qué—. */}
      {estado.ramas.some((r) => r.porQue) && (
        <ul className="mt-4 flex flex-col gap-1">
          {estado.ramas
            .filter((r) => r.porQue)
            .map((r) => (
              <li key={r.id} className="font-codigo text-[13px] text-tinta/60">
                {r.id} · {r.porQue}
              </li>
            ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-espuma/10 pt-4">
        <p role="status" className="text-[15px] text-tinta/80">
          {comoVa(estado)}
          {estado.cosecha && <span className="ml-2 font-codigo text-[13px] text-tinta/55">· US$ {estado.cosecha.gastado.toFixed(2)}</span>}
        </p>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => (corriendo ? setCorriendo(false) : correr(termino))}
            className="rounded border border-espuma/15 px-4 py-2 text-[13px] text-tinta transition-colors hover:border-electrico hover:text-espuma"
          >
            {corriendo ? "Pausar" : termino ? "De nuevo" : "Reproducir"}
          </button>
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-tinta/55">
        Esto es una grabación de la misma siembra que corre <span className="font-codigo">dolphin tablero --demo</span> en la terminal: acá no se
        ejecuta ningún agente ni se gasta nada. Lo que de verdad cruza el portón son las ramas de tu repo, en tu máquina.
      </p>
    </div>
  );
}
