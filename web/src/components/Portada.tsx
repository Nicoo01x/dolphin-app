"use client";

import { motion } from "motion/react";
import { REPO } from "@/lib/contenido";

// Entra con movimiento y sin opacidad: el titular es lo más grande que pinta, y si nace invisible
// no cuenta como pintado hasta que cargue el JS (en un celular eran más de 5 s).
const entrar = (i: number) => ({
  initial: { y: 16 },
  animate: { y: 0 },
  transition: { duration: 0.9, delay: 0.04 + i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
});

/**
 * La portada, armada como la de Linear (la referencia que eligió Nico el 01/11): aire arriba, el
 * titular enorme pegado a la izquierda en dos líneas, una sola línea de bajada, y debajo la
 * captura del producto ocupando todo el ancho.
 *
 * El titular dice QUÉ ES, no contra qué pelea (Nico, 09/11/2026: «es como todo tu workspace en
 * un solo lado»). El de antes —«tus agentes escriben código, Dolphin se encarga de que sirva»—
 * nombraba un problema; alguien que cae en la página todavía no sabe si tiene ese problema, pero
 * sí sabe cuántos programas tiene abiertos para hacer una sola cosa.
 *
 * Lo que la bajada enumera es lo que hay adentro de esa ventana, y es lo que la demo de acá abajo
 * muestra andando. El orden importa: primero qué es, después vealo.
 *
 * Lo que había antes —rótulo en versales, titular en serif, el mar en píxeles y tres avisos de
 * bots— se fue entero: era una portada bonita de algo que no se entendía qué era.
 *
 * El tablero que estaba acá abajo se mudó el 09/11/2026 a su propia banda con paisaje (ver
 * `Tareas`), junto con la demo del chat: lo que se toca va sobre una foto.
 */
export function Portada() {
  return (
    <section className="px-6 pt-[72px] pb-24 md:px-10 md:pt-[120px]">
      <div className="mx-auto w-full max-w-[1200px]">
        {/* El ancho da para la línea más larga de las dos: con menos, «sirva.» se caía sola a un
            tercer renglón. El corte lo decide el <br>, no el ancho de la caja. */}
        <motion.h1 {...entrar(0)} className="titulo-grande max-w-[30ch]">
          El IDE donde trabajan
          <br className="max-sm:hidden" /> tus agentes.
        </motion.h1>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3">
          <motion.p {...entrar(1)} className="max-w-[58ch] text-[17px] leading-[1.5] text-tenue">
            Cada uno en su rama, con un portón que la prueba antes de que llegue a la tuya. El
            editor, la terminal, git y el tablero, en la misma ventana.
          </motion.p>
          <motion.p {...entrar(2)} className="text-[15px] text-apagado">
            Open source · con la sesión que ya pagás
          </motion.p>
        </div>

        <motion.div {...entrar(3)} className="mt-10 flex flex-wrap gap-2">
          <a href="/docs/primeros-pasos" className="boton-tonal">
            Cómo se usa
          </a>
          <a href={REPO} className="boton-tonal">
            Ver el código
          </a>
        </motion.div>

      </div>
    </section>
  );
}
