"use client";

import { useState, type ReactNode } from "react";
import { Avatar, BotonDibujado, Fila, Filas, Tarjeta } from "./piezas";
import { Lamina, PAISAJES, type Paisaje } from "./Lamina";

/**
 * Las seis escenas grandes de la home: un título que dice lo que gana quien lo usa, una oración, y
 * la pieza de la interfaz que lo muestra, flotando sobre su paisaje.
 *
 * Cada afirmación tiene su dibujo y cada dibujo sale de algo que el producto hace hoy en `master`
 * (la evidencia, archivo por archivo, en `docs/reforma/web-12-11/direccion.md`). Si una deja de
 * ser cierta, la escena se saca: la web no promete lo que el producto no cumple.
 *
 * La tarjeta va a un lado o al centro según dónde deja aire el cuadro, y alterna para que la página
 * tenga ritmo y no sea la misma lámina seis veces.
 */

function EscenaGrande({
  id,
  titulo,
  oracion,
  paisaje,
  foco,
  lado,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly oracion: ReactNode;
  readonly paisaje: Paisaje;
  readonly foco?: string;
  readonly lado: "izquierda" | "centro" | "derecha";
  readonly children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-20 px-4 pt-24 md:px-10 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="grid gap-x-16 gap-y-4 lg:grid-cols-2 lg:items-end">
          <h2 id={`${id}-titulo`} className="titulo-seccion max-w-[16ch]">
            {titulo}
          </h2>
          <p className="bajada max-w-[44ch]">{oracion}</p>
        </div>
        <Lamina paisaje={paisaje} foco={foco} lado={lado} className="mt-10 min-h-[520px] md:min-h-[600px]">
          {children}
        </Lamina>
      </div>
    </section>
  );
}

/** Un comando dentro de una oración: con su fuente, sin caja. */
function Cmd({ children }: { readonly children: ReactNode }) {
  return <code className="font-codigo text-[0.88em] text-espuma">{children}</code>;
}

export function EscenaMotores() {
  return (
    <EscenaGrande
      id="motores"
      titulo="Con la sesión que ya pagás."
      oracion="Dolphin corre el CLI que ya tenés, y si una cuenta de Claude se queda sin cupo sigue con la otra."
      paisaje={PAISAJES.andes}
      foco="70% 50%"
      lado="izquierda"
    >
      <Tarjeta nombre="dolphin motores" meta="4 de 10 en esta máquina" className="w-full max-w-[520px]">
        <Filas>
          <Fila
            titulo="Claude Code"
            texto="claude · cuenta 1"
            estado="curso"
            pasos={[{ en: 1800, estado: "hecho", texto: "cuenta 1 sin cupo · sigue con la cuenta 2" }]}
          />
          <Fila titulo="Codex" texto="codex · lee los tokens de cada turno" estado="hecho" />
          <Fila titulo="Gemini CLI" texto="gemini · en el PATH" estado="hecho" />
          <Fila titulo="OpenCode" texto="opencode · en el PATH" estado="hecho" />
          <Fila titulo="Copilot CLI" texto="copilot · no está en el PATH" estado="espera" />
        </Filas>
      </Tarjeta>
    </EscenaGrande>
  );
}

const PLAN = [
  { titulo: "la lógica", quien: "backend", costo: "US$ 0,60" },
  { titulo: "la pantalla", quien: "ux", costo: "US$ 0,20" },
  { titulo: "los tests", quien: "tests · después de la 1", costo: "US$ 0,20" },
] as const;

export function EscenaCosto() {
  // El «dale» se toca: largarlo pone a correr las tres tareas, como en la terminal.
  const [arranco, setArranco] = useState(false);
  return (
    <EscenaGrande
      id="costo"
      titulo="Sabés cuánto cuesta antes de arrancar."
      oracion="El líder parte el pedido, estima cada parte con lo que costó en tu repo y espera tu «dale»."
      paisaje={PAISAJES.lagoQuieto}
      foco="40% 60%"
      lado="derecha"
    >
      <Tarjeta nombre="exportar los pedidos a CSV con filtro por fecha" meta="plan del líder" className="w-full max-w-[500px]">
        <Filas>
          {PLAN.map((p, i) => (
            <Fila
              key={`${p.titulo}-${arranco}`}
              titulo={p.titulo}
              texto={arranco ? `${p.quien} · trabajando en su rama` : p.quien}
              estado={arranco ? "curso" : "espera"}
              numero={arranco ? undefined : i + 1}
              derecha={<span className="flex-none text-[14px] text-tinta tabular-nums">{p.costo}</span>}
            />
          ))}
        </Filas>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 shadow-[inset_0_1px_0_rgb(11_13_16/0.06)]">
          <p className="min-w-0 flex-1 text-[13.5px] text-tenue">
            Estimado <span className="font-medium text-espuma tabular-nums">US$ 1,00</span> · tope US$ 1,00
          </p>
          {arranco ? (
            <button type="button" onClick={() => setArranco(false)} className="boton-tonal h-11 px-4 text-[14px] sm:h-9">
              Volver al plan
            </button>
          ) : (
            <>
              <BotonDibujado>no</BotonDibujado>
              <button type="button" onClick={() => setArranco(true)} className="boton-pill h-11 px-5 text-[14px] sm:h-9">
                dale
              </button>
            </>
          )}
        </div>
      </Tarjeta>
    </EscenaGrande>
  );
}

/** Las ocho fases de verdad (`docs/porton.md`), con lo que tardan y si pagan. */
const FASES = [
  { nombre: "configuración", tarda: "0,2 s" },
  { nombre: "política", tarda: "0,1 s" },
  { nombre: "seguridad", tarda: "3 s" },
  { nombre: "memoria", tarda: "1 s" },
  { nombre: "tus scripts", tarda: "48 s" },
  { nombre: "pantalla", tarda: "1 m 10 s" },
  { nombre: "visión", tarda: "22 s", paga: true },
  { nombre: "revisión", tarda: "31 s", paga: true },
] as const;

export function EscenaPorton() {
  return (
    <EscenaGrande
      id="porton"
      titulo="Ocho fases antes de tu rama."
      oracion="Lo gratis corre primero; lo que rebota vuelve al agente con el motivo, y un modelo cobra recién al final."
      paisaje={PAISAJES.meandro}
      foco="80% 50%"
      lado="izquierda"
    >
      <Tarjeta icono={<Avatar letra="C" />} nombre="dolphin/redondeo-iva · Codex" meta="portón" className="w-full max-w-[540px]">
        <Filas>
          {FASES.map((f, i) => {
            const paga = "paga" in f && f.paga;
            const derecha = (
              <span className={`flex-none text-[12.5px] tabular-nums ${paga ? "font-medium text-espuma" : "text-apagado"}`}>
                {paga ? "paga" : "gratis"}
              </span>
            );
            if (i < 4) return <Fila key={f.nombre} titulo={f.nombre} texto={`pasó · ${f.tarda}`} estado="hecho" derecha={derecha} />;
            if (i === 4)
              return (
                <Fila
                  key={f.nombre}
                  titulo={f.nombre}
                  texto="typecheck, test y lint"
                  estado="curso"
                  derecha={derecha}
                  pasos={[
                    { en: 1000, estado: "rebote", texto: "2 tests en rojo · carrito.test.ts" },
                    { en: 2600, estado: "curso", texto: "el agente corrige con ese motivo" },
                    { en: 4200, estado: "hecho", texto: `pasó · ${f.tarda}` },
                  ]}
                />
              );
            const empieza = 4400 + (i - 5) * 1500;
            return (
              <Fila
                key={f.nombre}
                titulo={f.nombre}
                texto="espera a la anterior"
                estado="espera"
                derecha={derecha}
                pasos={[
                  { en: empieza, estado: "curso", texto: "corriendo" },
                  { en: empieza + 1200, estado: "hecho", texto: `pasó · ${f.tarda}` },
                ]}
              />
            );
          })}
        </Filas>
      </Tarjeta>
    </EscenaGrande>
  );
}

export function EscenaMemoria() {
  return (
    <EscenaGrande
      id="memoria"
      titulo="Lo que corregís una vez queda corregido."
      oracion="Una corrección con patrón se vuelve un chequeo del portón, y la próxima línea que la repita corta la rama."
      paisaje={PAISAJES.merced}
      foco="30% 50%"
      lado="derecha"
    >
      <Tarjeta nombre="memoria de tienda" meta="dolphin recordar" className="w-full max-w-[520px]">
        <Filas>
          <Fila titulo="Los importes van con coma decimal" texto="patrón toLocaleString('en' · chequeo del portón" estado="hecho" />
          <Fila titulo="Los textos de la pantalla, en castellano" texto="sin patrón · viaja como regla en cada pedido" estado="regla" />
          <Fila
            titulo="dolphin/exportar-csv"
            texto="fase memoria"
            estado="curso"
            pasos={[{ en: 1500, estado: "rebote", texto: "csv.ts:41 · los importes van con coma decimal" }]}
          />
        </Filas>
      </Tarjeta>
    </EscenaGrande>
  );
}

export function EscenaNoche() {
  return (
    <EscenaGrande
      id="noche"
      titulo="Anotás a la noche, revisás a la mañana."
      oracion={
        <>
          <Cmd>dolphin noche --hasta 07:00</Cmd> hace tu lista de a una tarea, cada una en su rama, y te deja el parte.
        </>
      }
      paisaje={PAISAJES.desfiladero}
      foco="50% 40%"
      lado="centro"
    >
      <Tarjeta nombre="Parte de la mañana" meta="07:00 · 3 tareas" className="w-full max-w-[560px]">
        <Filas>
          <Fila
            titulo="Que el carrito acepte cupones"
            texto="pasó el portón · dolphin/cupones · US$ 0,84"
            estado="hecho"
            derecha={<BotonDibujado fuerte>Aprobar</BotonDibujado>}
          />
          <Fila
            titulo="Exportar los pedidos a CSV"
            texto="pasó el portón · dolphin/exportar-csv · US$ 1,02"
            estado="hecho"
            derecha={<BotonDibujado fuerte>Aprobar</BotonDibujado>}
          />
          <Fila titulo="Avisar cuando falta stock" texto="rebotó en pantalla · el aviso no se ve a 390 px" estado="rebote" />
        </Filas>
      </Tarjeta>
    </EscenaGrande>
  );
}

export function EscenaSiembra() {
  return (
    <EscenaGrande
      id="siembra"
      titulo="Cuatro intentos, y queda el más simple."
      oracion={
        <>
          <Cmd>dolphin sembrar</Cmd> abre ramas con enfoques distintos y, entre las que pasan el portón, elige la que toca menos.
        </>
      }
      paisaje={PAISAJES.delaware}
      foco="60% 50%"
      lado="izquierda"
    >
      <Tarjeta nombre="sembrar · arreglar el redondeo del IVA" meta="--n 4" className="w-full max-w-[520px]">
        <Filas>
          <Fila
            titulo="la mínima"
            texto="escribiendo"
            estado="curso"
            pasos={[
              { en: 1400, estado: "hecho", texto: "pasó · 1 archivo, +6 −2" },
              { en: 3200, estado: "hecho", texto: "pasó · 1 archivo, +6 −2", marca: "elegida" },
            ]}
          />
          <Fila titulo="la de raíz" texto="escribiendo" estado="curso" pasos={[{ en: 2200, estado: "hecho", texto: "pasó · 3 archivos, +41 −18" }]} />
          <Fila titulo="test primero" texto="escribiendo" estado="curso" pasos={[{ en: 1800, estado: "hecho", texto: "pasó · cambió un test que ya existía" }]} />
          <Fila titulo="la defensiva" texto="escribiendo" estado="curso" pasos={[{ en: 1100, estado: "rebote", texto: "rebotó en tus scripts · lint" }]} />
        </Filas>
      </Tarjeta>
    </EscenaGrande>
  );
}
