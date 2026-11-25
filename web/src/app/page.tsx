import { Escena } from "@/components/Escena";
import { Preguntas } from "@/components/Preguntas";
import { Ademas } from "@/components/home/Ademas";
import { Carta } from "@/components/home/Carta";
import { Ciclo } from "@/components/home/Ciclo";
import { ElEditor } from "@/components/home/ElEditor";
import { Cierre } from "@/components/home/Cierre";
import { Nuevo } from "@/components/home/Nuevo";
import { PortadaReal } from "@/components/home/PortadaReal";
import { TraeTuAgente } from "@/components/home/TraeTuAgente";

/**
 * La home.
 *
 * Desde el 12/11/2026 (segunda pasada) muestra EL PRODUCTO REAL: toda imagen de producto es una
 * captura de la app de Dolphin, nunca una maqueta dibujada. Nico la puso al lado de la web de la
 * base («el nuestro ni imágenes reales tiene») y pidió su estructura sección por sección:
 *
 *   portada con la ventana y pestañas → el ciclo de trabajo → con qué agente → la grilla de doce →
 *   preguntas → cierre con la instalación.
 *
 * Lo propio se queda: la página clara, los óleos como fondo de cada captura, el castellano y el
 * contenido de Dolphin (tablero, portón, cola, revisiones, el inicio con la ola). Las capturas
 * salen de fixtures de la app de escritorio con una tienda de ejemplo y de la app de terminal con
 * el agente de mentira; qué es cada una y cómo regenerarla: `public/capturas/app-12-11/LEEME.md`.
 * La correspondencia con esa web, sección por sección: `docs/reforma/web-12-11/direccion.md`.
 *
 * Desde el 12/11/2026 (noche) la portada es un VIDEO de la app de escritorio con agentes de verdad
 * delegando issues de un proyecto de demostración (Tareas → «Comenzar» → Claude y Codex a la vez →
 * PR), y la home ya no tiene capturas de la app de terminal. Cómo se grabó:
 * `public/videos/app-12-11/LEEME.md`.
 *
 * Desde el 18/11/2026, después del editor va «Nuevo en la 1.7» (`home/Nuevo.tsx`): Delfines, correr
 * en tu servidor y el aviso de poca RAM, con capturas de fixtures de la app.
 *
 * Desde el 24/11/2026, entre la portada y el ciclo va la carta de dónde encaja Dolphin
 * (`home/Carta.tsx`), y el ciclo se recorre scrolleando en vez de con pestañas: las dos cosas vienen
 * de mirar aycode.ai con Nico.
 *
 * Salieron de la home (siguen en el repo): `PortadaConVistas`, `Escenas` y `TodoLoDemas`, las
 * tarjetas dibujadas de la primera pasada. Las escenas de `dolphin noche` y de la memoria se cayeron
 * porque no hay captura real de ellas sin correr un motor.
 */
export default function Inicio() {
  return (
    <Escena>
      <PortadaReal />
      <Carta />
      <Ciclo />
      <ElEditor />
      <Nuevo />
      <TraeTuAgente />
      <Ademas />
      <Preguntas />
      <Cierre />
    </Escena>
  );
}
