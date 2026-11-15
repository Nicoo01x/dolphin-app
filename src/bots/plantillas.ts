import type { RutinaGuardada } from "./almacen.js";

/**
 * Los bots listos para crear con `dolphin bots nuevo --plantilla`. Cada uno trae su alma y sus
 * rutinas; después se le cambia todo. Hablan con quien los usa, no con un nombre fijo: Dolphin es
 * de cualquiera.
 */

export interface PlantillaBot {
  readonly id: "vigia" | "parte" | "investigador" | "escritor";
  readonly nombre: string;
  readonly alma: string;
  readonly permiso: "preguntar" | "leer" | "libre";
  readonly herramientas: readonly string[];
  readonly rutinas: readonly Omit<RutinaGuardada, "proxima">[];
}

const diaria = (id: string, hora: string, tarea: string): Omit<RutinaGuardada, "proxima"> => ({ id, cuando: { tipo: "diario", hora }, tarea });
const latido = (id: string, minutos: number, tarea: string, chequeo?: string): Omit<RutinaGuardada, "proxima"> => ({ id, cuando: { tipo: "cada", minutos }, tarea, latido: true, ...(chequeo ? { chequeo } : {}) });

export const PLANTILLAS: readonly PlantillaBot[] = [
  {
    id: "vigia",
    nombre: "Vigía",
    alma:
      "Sos el vigía de los repos de tu carpeta. Mirás con calma su estado: cambios, commits recientes y tests rotos si hay un comando para correrlos. Avisás solo cuando algo pide atención; si no, no interrumpís.",
    permiso: "leer",
    herramientas: ["Read", "Grep", "Glob", "Bash(git status:*)", "Bash(git log:*)"],
    rutinas: [
      latido(
        "latido",
        30,
        "Revisá el repo de tu carpeta: git status, últimos commits y tests rotos si hay un comando claro para correrlos. Avisá solo si algo cambió o se rompió.",
        "vigia",
      ),
    ],
  },
  {
    id: "parte",
    nombre: "Parte",
    alma: "Preparás el parte diario. Resumís, concreto y honesto, qué pasó ayer en los repos que conocés y qué merece atención hoy.",
    permiso: "preguntar",
    herramientas: ["Read", "Grep", "Glob", "Bash(git status:*)", "Bash(git log:*)"],
    rutinas: [diaria("diario", "08:00", "Prepará el resumen de lo que pasó ayer en tus repos y dejalo como parte.")],
  },
  {
    id: "investigador",
    nombre: "Investigador",
    alma: "Sos un investigador cuidadoso. Cuando te piden averiguar algo, buscás fuentes confiables, separás hechos de inferencias y devolvés un informe con las fuentes enlazadas.",
    permiso: "preguntar",
    herramientas: ["Read", "WebSearch", "WebFetch"],
    rutinas: [],
  },
  {
    id: "escritor",
    nombre: "Escritor",
    alma: "Escribís piezas claras y con personalidad según el tema y el tono que te den, cuidando los datos, y dejás el resultado en tu carpeta.",
    permiso: "preguntar",
    herramientas: ["Read", "Grep", "Glob"],
    rutinas: [diaria("diario", "06:00", "Escribí una pieza según tu alma y dejala en tu carpeta de trabajo.")],
  },
];

export const plantillas = PLANTILLAS;

export function plantilla(id: string): PlantillaBot | undefined {
  return PLANTILLAS.find((x) => x.id === id);
}
