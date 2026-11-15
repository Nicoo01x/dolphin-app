import type { Contrato, Falla } from "../nucleo/tipos.js";

/**
 * Lo que se le pide a un agente —escribir, corregir, seguir— y el contrato que deja al final de su
 * respuesta. Lo comparten todos los motores (ver otros.ts).
 */

export function armarPrompt(tarea: string, contexto?: string, enfoque?: string): string {
  return [
    tarea,
    contexto ? `\n${contexto}` : "",
    enfoque ? `\nCómo encararlo en este intento: ${enfoque}` : "",
    "\nTrabajás dentro de un worktree descartable: hacé los cambios directamente en los archivos.",
    "No hagas commit, no crees ramas y no toques git.",
    "Si el repo tiene convenciones (CLAUDE.md, tests, estilo), seguilas.",
    "Terminá cuando el cambio esté completo, no antes.",
    "",
    "IMPORTANTE — las tres últimas líneas de tu respuesta tienen que ser exactamente estas,",
    "sin negritas, sin viñetas y sin nada después, porque las lee una máquina:",
    "SUPERFICIES: las rutas de la app que cambian, tal como van en la URL (/, /alta, /facturas#nueva), separadas por coma (o: ninguna)",
    "RESUMEN: en una línea, qué cambia de cara a quien usa el producto",
    "NOTA: algo de este repo que le serviría saber a quien trabaje después (cómo se corre algo, una trampa que encontraste), o: ninguna",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * El contrato de superficie: qué parte del producto tocó este universo.
 *
 * Sin esto el escalón de pantalla prueba a ciegas —abre la home y tantea—,
 * que es la diferencia entre encontrar el bug y encontrar nada. Se parsea
 * de la respuesta y no de un archivo, para no ensuciar el diff con basura
 * que después contaría como «archivos tocados» al elegir al más simple.
 */
export function leerContrato(respuesta: string): Contrato | undefined {
  const superficies = buscar(respuesta, "SUPERFICIES");
  const resumen = buscar(respuesta, "RESUMEN");
  // La nota del agente para quien venga después: va al corto plazo de la memoria (ver notas.ts).
  const nota = buscar(respuesta, "NOTA");

  if (!superficies && !resumen) return undefined;

  const rutas = (superficies ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !NADA.test(s));

  return {
    superficies: rutas,
    ...(resumen ? { resumen } : {}),
    ...(nota && !NADA.test(nota) ? { nota: nota.slice(0, 300) } : {}),
  };
}

const NADA = /^(ninguna|ninguno|nada|n\/a|-)\.?$/i;

function buscar(texto: string, etiqueta: string): string | undefined {
  // El modelo casi nunca escribe la línea pelada: la adorna con negritas,
  // la pone como viñeta o la mete en una cita. Un `startsWith` estricto
  // descarta el contrato en silencio y el tester vuelve a probar a ciegas,
  // que es el bug que más caro sale porque no se nota.
  const patron = new RegExp(`^[\\s>*_\\-•]*\\*{0,2}${etiqueta}\\*{0,2}\\s*:\\s*(.+)$`, "i");

  for (const linea of texto.split("\n").reverse()) {
    const encontrado = patron.exec(linea.trim());
    if (!encontrado) continue;

    // Solo el adorno: negritas, código y lo que envuelve los extremos. Borrar
    // todos los «_» dejaba «/mis_facturas» en «/misfacturas» (un 404) y una
    // nota con «DATABASE_URL» en «DATABASEURL».
    const valor = (encontrado[1] ?? "")
      .replace(/\*\*|`/g, "")
      .replace(/^[\s*_]+|[\s*_]+$/g, "")
      .trim();
    if (valor !== "") return valor;
  }
  return undefined;
}

/** La evidencia completa puede ser kilométrica: al agente le sirve el final,
 *  que es donde los tests escriben qué se rompió. */
function recortarEvidencia(texto: string): string {
  return texto.length > 4000 ? `…${texto.slice(-4000)}` : texto;
}

/** El veredicto, con su evidencia, y lo que se deshizo de la configuración: lo comparten los dos pedidos. */
function veredictoDe(falla: Falla, deshecho: readonly string[]): string[] {
  return [
    `El veredicto fue: ${falla.detalle}`,
    ...(falla.evidencia ? ["", "La salida completa del verificador:", "```", recortarEvidencia(falla.evidencia), "```"] : []),
    ...(deshecho.length > 0
      ? ["", `Se deshizo lo que cambiaste en ${deshecho.join(", ")}: esa configuración la ejecuta Claude sin preguntar y la tarea no la pidió. No la vuelvas a tocar.`]
      : []),
  ];
}

/** El pedido para corregir de cero: el veredicto entero y la tarea, en el mismo worktree. Lo usan todos los motores. */
export function pedidoDeCorreccion(tarea: string, falla: Falla, deshecho: readonly string[] = []): string {
  return [
    `Tu cambio en este repo no pasó la fase «${falla.verificador}».`,
    "",
    ...veredictoDe(falla, deshecho),
    "",
    `La tarea original era: ${tarea}`,
    "",
    "Corregí el problema con el cambio MÁS CHICO posible. No rehagas el trabajo: arreglá lo que el veredicto señala.",
  ].join("\n");
}

/** Al retomar la sesión el agente ya tiene la tarea y su trabajo a la vista: alcanza con el veredicto. */
export function pedidoAlRetomar(falla: Falla, deshecho: readonly string[] = []): string {
  return [
    `El portón rebotó tu cambio en la fase «${falla.verificador}».`,
    "",
    ...veredictoDe(falla, deshecho),
    "",
    "Corregí el problema con el cambio MÁS CHICO posible, sobre lo que ya hiciste. No rehagas el trabajo.",
    "Terminá con las mismas tres líneas de antes: SUPERFICIES, RESUMEN y NOTA.",
  ].join("\n");
}

/** Lo que se le manda al retomar una sesión que se cortó por silencio: el pedido ya lo tiene. */
export const PEDIDO_AL_SEGUIR = [
  "Se cortó tu corrida porque estuviste un rato sin escribir nada.",
  "Seguí donde quedaste, sobre lo que ya hiciste: no empieces de nuevo.",
  "Cuando termines, cerrá la respuesta como se te pidió al principio.",
].join("\n");
