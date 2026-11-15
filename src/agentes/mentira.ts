import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Agente, Forma } from "../nucleo/tipos.js";
import { decirVoz } from "../nucleo/voces.js";

/**
 * El agente de mentira: no gasta un peso. Sirve para probar el circuito
 * entero —worktrees, portón, elección, cola— sin tokens.
 *
 * Cada rama escribe algo de un tamaño distinto, para que elegir tenga de
 * dónde agarrarse; y el nombre del archivo sale de la tarea, así dos
 * tareas distintas tocan archivos distintos y la cola las puede entregar
 * juntas.
 */
export const agenteDeMentira: Agente = {
  nombre: "mentira",
  async trabajar(universo, tarea) {
    const n = Number.parseInt(universo.id.replace("u", ""), 10) || 1;
    const lineas = Array.from({ length: n * 3 }, (_, i) => `// ${universo.id} línea ${i + 1}`);
    const nombre = (tarea ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    // Cuenta lo que hace, como uno de verdad: así su terminal en vivo se ve sin gastar nada.
    const archivo = `dolphin-${nombre || universo.id}.txt`;
    decirVoz(universo.ruta, "pensando", "Primero veo cómo está armado el repo y después escribo lo mínimo.");
    decirVoz(universo.ruta, "texto", `Voy con: **${tarea}**`);
    decirVoz(universo.ruta, "herramienta", "TodoWrite");
    decirVoz(universo.ruta, "tareas", `[~] Leer el repo\n[ ] Escribir ${archivo}\n[ ] Dejarlo para el portón`);
    decirVoz(universo.ruta, "herramienta", "Read package.json");
    decirVoz(universo.ruta, "resultado", "Leyó 1 renglón");
    await writeFile(join(universo.ruta, archivo), lineas.join("\n"), "utf8");
    decirVoz(universo.ruta, "herramienta", `Write ${archivo}`);
    decirVoz(universo.ruta, "diff", [`${lineas.length} agregados, 0 quitados`, ...lineas.slice(0, 6).map((l) => `+ ${l}`), ...(lineas.length > 6 ? [`… +${lineas.length - 6} renglones`] : [])].join("\n"));
    decirVoz(universo.ruta, "herramienta", "TodoWrite");
    decirVoz(universo.ruta, "tareas", `[x] Leer el repo\n[x] Escribir ${archivo}\n[~] Dejarlo para el portón`);

    await new Promise((r) => setTimeout(r, 80 + n * 40));
    decirVoz(universo.ruta, "texto", "Listo: lo dejo para el `portón`.");

    const forma: Forma = {
      archivos: 1,
      agregadas: lineas.length,
      quitadas: 0,
      dependenciasNuevas: n % 4 === 0 ? 1 : 0,
    };
    return { forma, gastado: 0, modelo: "demo" };
  },
};
