"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { teclasDePestanas } from "@/lib/pestanas";

/**
 * Un bot por dentro: la carpeta de verdad que deja `dolphin bots nuevo Vigía --plantilla vigia`,
 * archivo por archivo. bot.json y alma.md son los que escribe el código (almacen.ts y
 * plantillas.ts, al 28/10); la memoria, la habilidad, la charla, lo que vio el chequeo y el parte son
 * de ejemplo, con la forma exacta que tienen.
 */
const ARCHIVOS = [
  {
    nombre: "bot.json",
    nivel: 1,
    que: "Quién es para Dolphin: el motor, dónde trabaja, qué permiso y qué herramientas tiene, y sus rutinas.",
    contenido: `{
  "id": "vigia",
  "nombre": "Vigía",
  "motor": "claude",
  "carpeta": "D:/proyectos/tienda",
  "permiso": "leer",
  "herramientas": ["Read", "Grep", "Glob", "Bash(git status:*)", "Bash(git log:*)"],
  "rutinas": [
    {
      "id": "latido",
      "cuando": { "tipo": "cada", "minutos": 30 },
      "tarea": "Revisá el repo de tu carpeta: git status, últimos commits y tests rotos si hay un comando claro para correrlos. Avisá solo si algo cambió o se rompió.",
      "latido": true,
      "chequeo": "vigia",
      "proxima": "2026-10-28T11:30:00.000Z"
    }
  ],
  "creado": "2026-10-28T09:12:44.000Z"
}`,
  },
  {
    nombre: "alma.md",
    nivel: 1,
    que: "Quién es y cómo te habla. La cambiás y el próximo mensaje ya la usa.",
    contenido:
      "Sos el vigía de los repos de tu carpeta. Mirás con calma su estado: cambios, commits recientes y tests rotos si hay un comando para correrlos. Avisás solo cuando algo pide atención; si no, no interrumpís.",
  },
  {
    nombre: "memoria.md",
    nivel: 1,
    que: "Lo que aprendió de vos, una línea con fecha por recuerdo, hasta 2.200 caracteres. La escribe el bot cuando tiene permiso para escribir, o vos cuando quieras: es texto.",
    contenido: "2026-10-28 Los tests de la tienda se corren con npm test -- tienda.\n2026-10-28 No avisar por cambios en la carpeta docs/.",
  },
  {
    nombre: "habilidades/",
    nivel: 1,
    que: "Procedimientos para lo que va a volver a pedirse. Los escribe el bot, si puede escribir, o vos.",
    contenido: "revisar-tests.md",
  },
  {
    nombre: "revisar-tests.md",
    nivel: 2,
    que: "Una habilidad: nombre y descripción arriba, el procedimiento abajo. Entra entera al pedido cuando tu mensaje tiene palabras en común.",
    contenido: `---
name: revisar-tests
description: Cómo ver si un commit rompió los tests de la tienda
---
1. git log -1 --stat para ver qué cambió.
2. npm test -- tienda, y anotar cuáles fallan.
3. Si falla algo que el commit tocó, avisar con el archivo y la línea.`,
  },
  {
    nombre: "historial.jsonl",
    nivel: 1,
    que: "La charla, renglón por renglón: quién dijo qué y cuándo. Lee los últimos 12.",
    contenido: `{"cuando":"2026-10-28T10:00:02.114Z","quien":"rutina","texto":"Revisá el repo de tu carpeta y avisá solo si algo se rompió."}
{"cuando":"2026-10-28T10:01:37.520Z","quien":"bot","texto":"Después del último commit se rompieron 2 tests de la tienda. Es el redondeo del IVA, en src/precios.ts."}`,
  },
  {
    nombre: "vigia.json",
    nivel: 1,
    que: "Lo que vio el chequeo la última vez: el último commit y el git status. Si la vuelta siguiente da lo mismo, el modelo no se despierta.",
    contenido: `{"head":"9f2c1e7d4a…","status":" M src/precios.ts"}`,
  },
  {
    nombre: "partes/",
    nivel: 1,
    que: "Lo que deja cada rutina que tuvo algo para decir, un archivo por vez.",
    contenido: "2026-10-28T10-01-37-520Z-latido.md",
  },
] as const;

export function CarpetaDeBot() {
  const [activo, setActivo] = useState(0);
  const base = useId();
  const archivo = ARCHIVOS[activo]!;
  return (
    // Una sola superficie partida por un filete de 1 px: el listado y el archivo abierto son dos
    // mitades de la misma hoja, no dos tarjetas.
    <div className="grid gap-px bg-espuma/10 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="bg-lienzo pb-2 md:pr-8">
        <p className="border-b border-espuma/10 pb-3 font-codigo text-[13px] text-tinta/60">~/.dolphin/bots/vigia/</p>
        <div
          role="tablist"
          aria-label="Archivos del bot"
          aria-orientation="vertical"
          className="mt-3 flex flex-col"
          onKeyDown={teclasDePestanas(ARCHIVOS.length, activo, setActivo)}
        >
          {ARCHIVOS.map((a, i) => (
            <button
              key={a.nombre}
              id={`${base}-${i}`}
              type="button"
              role="tab"
              aria-selected={activo === i}
              aria-controls={`${base}-panel`}
              tabIndex={activo === i ? 0 : -1}
              onClick={() => setActivo(i)}
              className="relative rounded py-2 pr-3 text-left font-codigo text-[14px] transition-colors"
              style={{ paddingLeft: `${8 + (a.nivel - 1) * 20}px` }}
            >
              {activo === i && <motion.span layoutId={`${base}-archivo`} className="absolute inset-0 rounded bg-espuma" transition={{ type: "spring", stiffness: 420, damping: 38 }} />}
              <span className={`relative ${activo === i ? "text-lienzo" : a.nombre.endsWith("/") ? "text-espuma" : "text-tinta/80"}`}>
                {a.nivel > 1 && <span className={activo === i ? "text-lienzo/50" : "text-tinta/40"}>└ </span>}
                {a.nombre}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${activo}`} className="min-w-0 bg-lienzo md:pl-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={archivo.nombre} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <p className="border-b border-espuma/10 pb-3 font-codigo text-[13px] text-espuma">{archivo.nombre}</p>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-tinta/80">{archivo.que}</p>
            <pre className="mt-5 max-h-[340px] overflow-auto rounded border border-espuma/10 bg-lienzo-2 p-4 font-codigo text-[12.5px] leading-relaxed whitespace-pre-wrap text-tinta/90 [overflow-wrap:anywhere]">
              {archivo.contenido}
            </pre>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
