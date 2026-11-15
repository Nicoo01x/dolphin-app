import { costoMaximo, limpiarTareas, LIMITES, type TareaDelPlan } from "../nucleo/plan.js";

/**
 * El plan del líder se puede corregir antes del «dale», escribiendo como a una persona:
 *   «sacá 2»               → saca la tarea 2; la que la esperaba pasa a esperar lo que esperaba ella
 *   «sumá <tarea>»         → agrega una tarea al final
 *   «cambiá 2: <tarea>»    → reescribe el pedido de la 2
 * Los números son los de la lista que se muestra (desde 1). Es puro: la sesión muestra el
 * resultado y el «dale» arranca con el plan corregido.
 */

export type Edicion = { readonly tareas: TareaDelPlan[]; readonly hecho: string } | { readonly porQue: string };

const SACAR = /^(?:sac[aá]|sacar|quit[aá]|quitar|borr[aá]|borrar|elimin[aá])\s+(?:la\s+)?(?:tarea\s+)?(\d+)\s*$/i;
const SUMAR = /^(?:sum[aá]|sumar|agreg[aá]|agregar|añad[ií])\s*:?\s+([\s\S]+)$/i;
const CAMBIAR = /^(?:cambi[aá]|cambiar|reemplaz[aá])\s+(?:la\s+)?(?:tarea\s+)?(\d+)\s*:?\s+([\s\S]+)$/i;

/** Si el texto es una edición del plan, cómo queda; si no lo es, null (es otra cosa, como «dale»). */
export function editarPlan(tareas: readonly TareaDelPlan[], texto: string): Edicion | null {
  const limpio = texto.trim();
  const fuera = (n: number) => ({ porQue: `no hay tarea ${n}: el plan tiene ${tareas.length}` });

  const sacar = SACAR.exec(limpio);
  if (sacar) {
    const n = Number(sacar[1]);
    const cual = tareas[n - 1];
    if (!cual) return fuera(n);
    if (tareas.length === 1) return { porQue: "es la única tarea del plan: si no la querés, decime «no»" };
    const quedan = tareas
      .filter((t) => t.id !== cual.id)
      .map((t) => {
        if (t.dependeDe !== cual.id) return t;
        // Esperaba a la que se va: espera a lo que esperaba ella (o a nada).
        const { dependeDe: _, ...resto } = t;
        return cual.dependeDe ? { ...resto, dependeDe: cual.dependeDe } : resto;
      });
    return { tareas: quedan, hecho: `Saqué la ${n}: ${cual.titulo}.` };
  }

  const cambiar = CAMBIAR.exec(limpio);
  if (cambiar) {
    const n = Number(cambiar[1]);
    const cual = tareas[n - 1];
    if (!cual) return fuera(n);
    const nueva = cambiar[2]!.trim();
    // Pasa por la misma limpieza que el plan del líder: título, tipo y largo salen del pedido nuevo.
    // Los archivos eran los del pedido viejo: con otro pedido no se sabe, mejor ninguno que uno falso.
    const [rehecha] = limpiarTareas([{ ...cual, tarea: nueva, titulo: "", archivos: undefined }]);
    if (!rehecha) return { porQue: "el pedido nuevo vino vacío" };
    return { tareas: tareas.map((t) => (t.id === cual.id ? { ...rehecha, id: cual.id, ...(cual.dependeDe ? { dependeDe: cual.dependeDe } : {}) } : t)), hecho: `Cambié la ${n}: ${rehecha.titulo}.` };
  }

  const sumar = SUMAR.exec(limpio);
  if (sumar) {
    if (tareas.length >= LIMITES.tareas) return { porQue: `el plan ya tiene ${LIMITES.tareas} tareas, el máximo: sacá una antes` };
    const ids = new Set(tareas.map((t) => t.id));
    let id = `t${tareas.length + 1}`;
    for (let k = 2; ids.has(id); k++) id = `t${tareas.length + 1}-${k}`;
    // Las anteriores tal cual; la nueva, limpiada como cualquiera (y encadenada si dice qué archivos toca).
    const todas = limpiarTareas([...tareas, { id, tarea: sumar[1]!.trim(), escalon: "medio" }]);
    const nueva = todas.at(-1);
    if (!nueva || nueva.id !== id) return { porQue: "la tarea nueva vino vacía" };
    return { tareas: todas, hecho: `Sumé la ${todas.length}: ${nueva.titulo}.` };
  }

  return null;
}

/** El plan como se le muestra a la persona: numerado, con lo que espera cada una y el tope de gasto. */
export function lineasDelPlan(tareas: readonly TareaDelPlan[], conPlata: boolean): string[] {
  const numero = new Map(tareas.map((t, i) => [t.id, i + 1] as const));
  return [
    ...tareas.map((t, i) => {
      const espera = t.dependeDe && numero.has(t.dependeDe) ? ` (después de la ${numero.get(t.dependeDe)})` : "";
      return `${i + 1}. ${t.titulo}${conPlata ? ` · hasta US$ ${t.presupuesto.toFixed(2)}` : ""}${espera}`;
    }),
    ...(conPlata ? [`Tope del plan: US$ ${costoMaximo({ tareas }).toFixed(2)}.`] : []),
  ];
}
