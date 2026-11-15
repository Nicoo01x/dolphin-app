"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { LaminaDeArchivo } from "./LaminaDeArchivo";
import { Logo } from "./Logo";
import { teclasDePestanas } from "@/lib/pestanas";
import { useQuieto } from "@/lib/quieto";

/**
 * Dolphin bots: cuatro bots de plantilla, cada uno con una charla corta que muestra lo que lo hace
 * distinto (pedir permiso, despertarse a una hora, aprender un procedimiento, recordar un gusto).
 * Las charlas son las de las plantillas que trae `dolphin bots nuevo`.
 */
const BOTS = [
  {
    id: "vigia",
    nombre: "Vigía",
    cuando: "cada 30 minutos",
    hace: "Mira tus repos y solo te escribe si algo se rompió.",
    charla: [
      { de: "bot", texto: "Después del último commit se rompieron 2 tests de la tienda. Es el redondeo del IVA, en src/precios.ts." },
      { de: "vos", texto: "¿cada cuánto mirás?" },
      { de: "bot", texto: "Cada 30 minutos. Si en git no cambió nada, no me despiertan: esa vuelta no gasta un token." },
    ],
  },
  {
    id: "parte",
    nombre: "Parte",
    cuando: "todos los días, 08:00",
    hace: "Te resume lo que pasó ayer antes de que abras la compu.",
    charla: [
      { de: "bot", texto: "Buen día. Ayer: 14 commits en 2 repos, 3 ramas listas para revisar y 1 test que tarda el doble que la semana pasada." },
      { de: "vos", texto: "¿cuál test?" },
      { de: "bot", texto: "cobros.test.ts: de 4 a 9 segundos desde el cambio de la base de prueba. Te dejo el detalle en el parte." },
    ],
  },
  {
    id: "investigador",
    nombre: "Investigador",
    cuando: "cuando le pedís",
    hace: "Averigua, compara y te devuelve un informe con fuentes.",
    charla: [
      { de: "vos", texto: "averiguá qué proveedor de correo nos conviene para 20 mil mails por mes" },
      { de: "bot", texto: "Comparé cinco con precios de hoy. Te dejo la tabla y las fuentes. Gana el segundo por costo y entregabilidad." },
      { de: "bot", texto: "Si querés, guardo cómo lo hice como habilidad y la próxima comparación sale más rápido. Decime «dale»." },
    ],
  },
  {
    id: "escritor",
    nombre: "Escritor",
    cuando: "todos los días, 06:00",
    hace: "Escribe la pieza del día con tu voz y te pregunta antes de dejarla.",
    charla: [
      { de: "bot", texto: "La nota de hoy está lista: «¿Cuándo conviene pasarse a responsable inscripto?». ¿La dejo en contenido/blog?" },
      { de: "vos", texto: "dale" },
      { de: "bot", texto: "Listo, quedó en contenido/blog. Y me anoté que los títulos van como pregunta." },
    ],
  },
] as const;

const PARTES = [
  ["Alma", "quién es, qué hace y cómo te habla"],
  ["Memoria", "lo que aprendió de vos, que él mismo ordena"],
  ["Habilidades", "procedimientos que escribe y mejora solo"],
  ["Rutinas", "a una hora, cada tanto, o un latido que solo avisa si hay algo"],
  ["Permiso", "solo mira, pregunta antes de tocar, o edita su carpeta con una foto para deshacer"],
  ["Manada", "le pasa trabajo a otro bot y usa lo que le devuelve"],
] as const;

export function Manada() {
  const [activo, setActivo] = useState(0);
  const [tocado, setTocado] = useState(false);
  const [encima, setEncima] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const visto = useInView(ref, { amount: 0.35 });
  const quieto = useQuieto();
  const base = useId();

  useEffect(() => {
    if (tocado || quieto || encima || !visto) return;
    const t = setInterval(() => setActivo((i) => (i + 1) % BOTS.length), 7000);
    return () => clearInterval(t);
  }, [tocado, quieto, encima, visto]);
  const elegir = (i: number) => {
    setActivo(i);
    setTocado(true);
  };
  const bot = BOTS[activo]!;

  return (
    <section id="bots" ref={ref} className="relative scroll-mt-24 px-6 py-28 md:px-10 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        {/* El encabezado abre con su lámina al costado, como una nota ilustrada. */}
        <div className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-2xl">
            <p className="text-[14px] text-apagado">Bots de plantilla</p>
            <h2 className="mt-5 titulo-seccion">Dolphin bots.</h2>
            <p className="mt-5 text-[19px] leading-relaxed text-tinta/85">
              Agentes siempre prendidos que te hablan por Telegram. Cada uno es una carpeta en tu máquina: la abrís y
              ves todo lo que es y todo lo que aprendió.
            </p>
            <a href="/bots" className="mt-5 inline-block text-[16px] text-espuma underline decoration-espuma/30 underline-offset-4 hover:decoration-espuma">
              Un bot por dentro, y frente a OpenClaw y Hermes
            </a>
          </div>
          <LaminaDeArchivo nombre="sifonoforos" alto="aspect-[5/4]" className="max-lg:max-w-md" />
        </div>

        <div
          className="mt-14 grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10"
          onPointerEnter={() => setEncima(true)}
          onPointerLeave={() => setEncima(false)}
        >
          <div
            role="tablist"
            aria-label="Bots de plantilla"
            aria-orientation="vertical"
            className="flex flex-col border-t border-espuma/10"
            onKeyDown={teclasDePestanas(BOTS.length, activo, elegir)}
          >
            {BOTS.map((b, i) => (
              <button
                key={b.id}
                id={`${base}-${b.id}`}
                type="button"
                role="tab"
                aria-selected={activo === i}
                aria-controls={`${base}-charla`}
                tabIndex={activo === i ? 0 : -1}
                onClick={() => elegir(i)}
                className="group relative border-b border-espuma/10 py-4 pr-1 pl-5 text-left"
              >
                {/* El elegido se marca con un canto del acento que se desliza de uno al otro: sobre el
                    azul noche, una caja alrededor del bot activo era una tarjeta más. */}
                {activo === i && (
                  <motion.span
                    layoutId={`${base}-bot`}
                    className="absolute inset-y-0 left-0 w-[2px] bg-electrico"
                    transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  />
                )}
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className={`text-[23px] font-medium tracking-[-0.022em] leading-none transition-colors ${activo === i ? "text-espuma" : "text-tinta/70 group-hover:text-tinta/95"}`}>
                    {b.nombre}
                  </span>
                  <span className="text-[13px] text-apagado">{b.cuando}</span>
                </span>
                <span className={`mt-2 block text-[15px] leading-snug transition-colors ${activo === i ? "text-tinta/85" : "text-tinta/60"}`}>{b.hace}</span>
              </button>
            ))}
          </div>

          {/* La charla, como en el celular: una sola superficie lisa y las burbujas encima. */}
          <div id={`${base}-charla`} role="tabpanel" aria-labelledby={`${base}-${bot.id}`} className="relative min-h-[420px] overflow-hidden bg-lienzo-2 p-5 md:p-7">
            <div className="flex items-center gap-3 border-b border-espuma/10 pb-4">
              <span className="grid size-10 flex-none place-items-center rounded-full bg-espuma text-lienzo">
                <Logo className="h-[16px] w-auto" />
              </span>
              <span>
                <span className="block text-[16px] font-medium text-espuma">{bot.nombre}</span>
                <span className="block text-[13px] text-apagado">por Telegram</span>
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.ol key={bot.id} className="flex flex-col gap-3 pt-5" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                {bot.charla.map((m, i) => (
                  <motion.li
                    key={i}
                    initial={quieto ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className={`max-w-[85%] rounded px-4 py-3 text-[15px] leading-snug ${
                      m.de === "vos" ? "self-end bg-espuma text-lienzo" : "self-start bg-lienzo text-tinta"
                    }`}
                  >
                    {m.texto}
                  </motion.li>
                ))}
              </motion.ol>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-16">
          <p className="border-b border-espuma/10 pb-3 text-[14px] text-apagado">La carpeta de un bot</p>
          {/* Una sola superficie partida por filetes de 1 px, no seis tarjetas. */}
          <dl className="grid gap-px bg-espuma/10 sm:grid-cols-2 lg:grid-cols-3">
            {PARTES.map(([nombre, texto], i) => (
              <motion.div
                key={nombre}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="bg-lienzo p-5"
              >
                <dt className="text-[23px] font-medium tracking-[-0.022em] leading-tight text-espuma">{nombre}</dt>
                <dd className="mt-1.5 text-[15px] leading-snug text-tinta/80">{texto}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
