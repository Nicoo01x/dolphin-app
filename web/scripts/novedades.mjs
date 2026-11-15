// node scripts/novedades.mjs (o npm run novedades)
//
// Arma las novedades desde el historial de git del repo: se queda con lo que una persona que usa
// Dolphin puede ver (las funciones nuevas), saca lo interno (renombres, CI, empaquetado, la web
// misma) y cuenta los arreglos de cada día. Escribe src/lib/novedades.ts, que se commitea: la web es
// estática y el build no corre git.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aca = dirname(fileURLToPath(import.meta.url));
const repo = resolve(aca, "..", "..");
const salida = join(aca, "..", "src", "lib", "novedades.ts");

const log = execFileSync("git", ["log", "--no-merges", "--format=%ad%x09%h%x09%s", "--date=short"], { cwd: repo, encoding: "utf8" });

/** Lo que es trabajo de adentro: no cambia nada que se vea al usar Dolphin. */
const INTERNO =
  /\b(migra|renombr|rebrand|dolphin|CI propio|casks|empaquet|procesos nativos|perfil de Electron|hooks de agentes|recursos Windows|daemon|protocolo y configuración|lint|fixtures|skills propias|identidad propia|variables|paquetes internos|@dolphin|plugins de lanzamiento|helper|aislar datos|datos de usuario|textos visibles|referencias visibles|lo que lee la persona dice)\b/i;
/** Commits sin tipo que no son una función: uniones, revisiones, la web, tests. */
const NO_ES_FUNCION = /^(Une|Unir|Merge|Arregla|Lo que encontró|Tests|La web|Los textos|El escritorio vuelve|Dolphin se puede empaquetar|README|rebrand)/i;

/**
 * Los asuntos que están escritos para quien programa Dolphin, dichos para quien lo usa. `null` los
 * saca (renombres de adentro, duplicados). Lo que no está acá sale tal cual dice el commit.
 */
const REESCRIBIR = {
  "Muestra la nueva configuración de bots": "La consola muestra el permiso, el respaldo y las rutinas nuevas de cada bot, con un botón para deshacer",
  "Instala servicio y chequea rutinas":
    "dolphin bots instalar deja a los bots prendidos como servicio, y un chequeo sin modelo decide si un latido despierta al bot",
  "Suma permisos y memoria de bots": "Permiso «carpeta» con foto para deshacer, motor de respaldo y una memoria con tope que se consolida y se busca",
  "Expone bots en consola y API": "Los bots, también en la consola",
  "Agrega Telegram y servicio de bots": "Cada bot con su Telegram, y dolphin bots correr los prende",
  "Agrega rutinas y partes de bots": "Los bots tienen rutinas y dejan su parte",
  "Limita la delegación entre bots": "Un bot le pide trabajo a otro, con un límite de dos saltos",
  "Aplica permisos de lectura a los bots": "Un bot puede quedar solo para leer",
  "Agrega pensamiento de bots": "Los bots piensan con Claude Code o Codex, con su memoria y sus habilidades",
  "Suma almacenamiento y plantillas de bots": "Dolphin bots: cada bot es una carpeta, y hay cuatro plantillas para empezar",
  "Actualiza los recursos y enlaces de documentación": null,
  "Renombra el ejemplo de plugins": null,
  "Unificar botones y chips pill": null,
  "Unifica el panel de sesión": null,
  "Sumar revisión cruzada al portón": null,
  "Precargar tareas en Nueva": null,
  "Integrar vistas en consola embebida": null,
  "Tocás un elemento de la app y Dolphin hace el cambio en una rama": null,
  "Integra controles de PR en panel de sesión": "Los controles del PR, en el panel de la sesión",
  "Comparte memoria con agentes": "La memoria del proyecto llega a los agentes de la app",
  "Detecta bucles de agentes": "Avisa cuando un agente se queda dando vueltas",
  "Detectar choques entre worktrees": "Avisa cuando dos worktrees tocan lo mismo",
  "Detectar trampas en las ramas": "Detecta las ramas que hacen trampa para pasar el portón",
  "Priorizar la memoria relevante": "Al pedido va primero la memoria que tiene que ver",
  "Gestionar candidatas desde la consola": "Las reglas candidatas se aprueban desde la consola",
  "Respetar el cupo en el autopiloto nocturno": "El autopiloto de la noche respeta el cupo",
  "Resolver issues con Dolphin": "Un issue se resuelve con Dolphin",
  "Llevar las vistas a la barra lateral": "Las vistas de la consola, en la barra lateral de la app",
  "Agrega tablero de orquestación": "El tablero de la orquestación",
  "Suma autopiloto nocturno de la bandeja": "El autopiloto de la noche toma lo de la bandeja",
  "Sumá estudio a la isla": "El estudio, en la isla",
  "Mover la isla y recordar su posición": "La isla se mueve y recuerda dónde la dejaste",
  "Embebida en la app habla con la letra de la app y sin línea de web pegada": "La consola adentro de la app usa su misma letra",
  "La app deja en ~/.dolphin/plan-uso.json cuánto queda de cada ventana del plan, para que el autopiloto no queme la noche":
    "La app anota cuánto queda de cada ventana del plan, para que el autopiloto no queme la noche",
  "Toda siembra arma su contexto en un solo lugar, y el CLI habla de ramas": "El CLI habla de ramas",
  "La pantalla lee las cosechas del núcleo": "La primera consola, leyendo las cosechas",
  "Diversidad de enfoques, contrato de superficie y aislamiento por universo": "Varias ramas con enfoques distintos, cada una aislada",
  "Núcleo de dolphin": "El primer Dolphin: una tarea, varias ramas y el portón",
  "Las ramas como lista de trabajo pro — y dos chips que no mienten": "Las ramas, como una lista de trabajo",
  "La marca dolphin gorda y cuadrada: bloques llenos de 2 columnas, 6 renglones, con el mismo brillo": "La marca de la terminal, más gorda y cuadrada",
};

const dias = new Map();
for (const linea of log.split(/\r?\n/).filter(Boolean)) {
  const [fecha, hash, ...resto] = linea.split("\t");
  const asunto = resto.join("\t").trim();
  const tipo = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/.exec(asunto);
  const dia = dias.get(fecha) ?? { fecha, cambios: [], arreglos: 0 };
  dias.set(fecha, dia);
  let texto;
  if (tipo) {
    const [, clase, alcance = "", cuerpo] = tipo;
    if (clase === "fix" && !/^web$/.test(alcance)) {
      dia.arreglos++;
      continue;
    }
    if (clase !== "feat" || /^(web|marca)$/.test(alcance)) continue;
    texto = cuerpo;
  } else {
    if (NO_ES_FUNCION.test(asunto)) continue;
    texto = asunto;
  }
  if (INTERNO.test(texto)) continue;
  texto = texto
    .replace(/\s*\((?:C\d+[^)]*|motor)\)\s*$/g, "")
    .replace(/\s*\(C\d+[^)]*\)/g, "")
    .replace(/\s+$/, "");
  texto = texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);
  if (texto in REESCRIBIR) {
    if (REESCRIBIR[texto] === null) continue;
    texto = REESCRIBIR[texto];
  }
  if (!dia.cambios.some((c) => c.texto === texto)) dia.cambios.push({ texto, hash });
}

const lista = [...dias.values()].filter((d) => d.cambios.length > 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
const cabeza = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

const ts = `// Generado por scripts/novedades.mjs desde git log (${cabeza}). No se edita a mano: se vuelve a correr.

export interface DiaDeNovedades {
  readonly fecha: string;
  readonly cambios: readonly { readonly texto: string; readonly hash: string }[];
  /** Los arreglos de ese día: se cuentan, no se listan. */
  readonly arreglos: number;
}

export const NOVEDADES: readonly DiaDeNovedades[] = ${JSON.stringify(lista, null, 2)};
`;
writeFileSync(salida, ts, "utf8");
console.log(`${lista.length} días, ${lista.reduce((s, d) => s + d.cambios.length, 0)} cambios → ${salida}`);
