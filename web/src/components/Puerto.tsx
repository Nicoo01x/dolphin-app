"use client";

import { motion } from "motion/react";
import { Instalar } from "./Instalar";

/**
 * El cierre: el titular, el comando para instalar y nada más.
 *
 * Hasta el 01/11 arriba iba la última estampa del mar —el abismo, con el puntero convertido en
 * linterna— y la página entera era un arco del amanecer a los 10.994 m. Ese arco se fue con el
 * rediseño: lo último que tiene que ver alguien que llegó hasta acá es el comando, no una
 * ilustración. El pie va aparte (Pie.tsx).
 */
export function Puerto() {
  return (
    <section className="relative px-6 pt-28 md:px-10 md:pt-36" aria-labelledby="puerto-titulo">
      <div className="mx-auto max-w-[1200px]">
        <div className="relative z-10 max-w-xl pb-32">
          <motion.h2
            id="puerto-titulo"
            initial={{ y: 20 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="titulo-grande"
          >
            Probalo sin gastar un token.
          </motion.h2>
          <p className="bajada mt-6">La demo corre con un agente de mentira: se ve todo el flujo sin llamar a ningún modelo.</p>
          <div className="mt-10">
            <div id="instalar" className="scroll-mt-24">
              <Instalar />
            </div>
          </div>
          <p className="mt-8 text-[15px] text-tenue">
            ¿Primera vez?{" "}
            <a
              href="/docs/primeros-pasos"
              className="text-espuma underline decoration-espuma/25 underline-offset-4 transition-colors hover:decoration-espuma"
            >
              Empezá por acá
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
