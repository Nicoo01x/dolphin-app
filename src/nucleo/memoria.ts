import { join } from "node:path";
import { leerDiff } from "./diff.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { nuevoId } from "./ids.js";
import type { Origen } from "./notas.js";
import type { Cosecha, Verificador } from "./tipos.js";
import {
  jaccardDePalabras,
  normalizarTexto,
  relevanciaDeMemoria,
  type MemoriaRelevante,
  type TareaParaRelevancia,
  type UsosDeMemoria,
} from "./relevancia.js";

/**
 * La memoria de ingeniería de dolphin.
 *
 * Cada corrección que el dueño del repo le escribió una vez queda
 * guardada y se aplica PARA SIEMPRE, de dos maneras:
 *
 * - Con un patrón, es un VERIFICADOR más del portón: si una línea nueva
 *   del intento lo matchea, el intento se corta ahí, gratis, con la
 *   corrección original como explicación. Funciona en cualquier
 *   lenguaje, porque mira el diff y no el AST.
 * - Sin patrón, es una regla DICHA: viaja en el prompt de cada siembra,
 *   así el agente la tiene en cuenta antes de escribir.
 *
 * Vive en `.dolphin/memoria.json`, versionable con el repo si se quiere.
 */

export interface Recuerdo {
  readonly id: string;
  /** La corrección tal como se dijo: es lo que se muestra y lo que se inyecta. */
  readonly dicho: string;
  /** Regex (fuente, sin barras) que NO puede aparecer en líneas nuevas. */
  readonly patron?: string;
  /** regla = la dijo una persona · error = lo confirmó una siembra ·
   *  decision / nota = contexto del proyecto. Ausente = regla. */
  readonly tipo?: "regla" | "error" | "decision" | "nota";
  readonly creado: string;
  readonly activo: boolean;
  /** De dónde salió (ver notas.ts). Ausente: las reglas son del dueño y lo demás, del sistema. */
  readonly origen?: Origen;
  /** Por qué entró, cuando no lo dijo una persona: lo mismo que cuenta DREAMS.md. */
  readonly porQue?: string;
  /** Lo corrigió la persona durante una sesión: espera aprobación y no viaja. */
  readonly candidato?: boolean;
  /** Otra memoria activa que habla de la misma materia en sentido opuesto. */
  readonly conflictoCon?: string;
}

export interface Memoria {
  readonly recuerdos: readonly Recuerdo[];
}

const rutaMemoria = (repo: string) => join(repo, ".dolphin", "memoria.json");
const rutaUsos = (repo: string) => join(repo, ".dolphin", "memoria-usos.json");
const rutaDescartes = (repo: string) => join(repo, ".dolphin", "memoria-descartes.json");

export type MemoriaUsos = UsosDeMemoria;

export function leerMemoria(repo: string): Promise<Memoria> {
  return leerEstado(rutaMemoria(repo), { recuerdos: [] }, (datos) => {
    const recuerdos = (datos as { recuerdos?: Recuerdo[] } | null)?.recuerdos;
    return { recuerdos: Array.isArray(recuerdos) ? recuerdos : [] };
  });
}

// De una sola vez y en fila (ver escritura.ts): la consola la relee mientras una siembra aprende algo.
async function guardarMemoria(repo: string, memoria: Memoria): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaMemoria(repo), `${JSON.stringify(memoria, null, 2)}\n`);
}

export function leerUsos(repo: string): Promise<MemoriaUsos> {
  return leerEstado<MemoriaUsos>(rutaUsos(repo), {}, (datos) => {
    if (!datos || typeof datos !== "object") return {};
    return Object.fromEntries(
      Object.entries(datos as Record<string, unknown>).flatMap(([id, uso]) => {
        const u = uso as Partial<{ usos: number; ultimoUso: string }> | null;
        return typeof u?.usos === "number" && u.usos >= 0
          ? [[id, { usos: u.usos, ...(typeof u.ultimoUso === "string" ? { ultimoUso: u.ultimoUso } : {}) }]]
          : [];
      }),
    );
  });
}

async function guardarUsos(repo: string, usos: MemoriaUsos): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaUsos(repo), `${JSON.stringify(usos, null, 2)}\n`);
}

/** Suma una aparición en el prompt a cada recuerdo que efectivamente viajó. */
export function registrarUsos(repo: string, ids: readonly string[], ahora = new Date()): Promise<void> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return Promise.resolve();
  return enFila(rutaUsos(repo), async () => {
    const usos = await leerUsos(repo);
    const ultimoUso = ahora.toISOString();
    const nuevos = { ...usos };
    for (const id of unicos) nuevos[id] = { usos: (usos[id]?.usos ?? 0) + 1, ultimoUso };
    await guardarUsos(repo, nuevos);
  });
}

/**
 * Sin uso en 30 días: lo último que la usó (o, si nunca se usó, cuando entró) fue hace más de 30
 * días. Una regla de hoy no está «sin uso»: todavía no tuvo con qué usarse.
 */
export function sinUsoEn30Dias(uso: MemoriaUsos[string] | undefined, ahora = new Date(), creado?: string): boolean {
  const desde = uso && uso.usos > 0 && uso.ultimoUso ? uso.ultimoUso : creado;
  if (!desde) return true;
  const fecha = Date.parse(desde);
  return !Number.isFinite(fecha) || ahora.getTime() - fecha > 30 * 86_400_000;
}

export async function recordar(
  repo: string,
  dicho: string,
  patron?: string,
  tipo?: Recuerdo["tipo"],
  extra: {
    readonly origen?: Origen;
    readonly porQue?: string;
    readonly candidato?: boolean;
    readonly conflictoCon?: string;
  } = {},
): Promise<Recuerdo> {
  if (dicho.trim() === "") throw new Error("un recuerdo vacío no le sirve a nadie");
  if (patron !== undefined) {
    // Un patrón roto no puede entrar: rompería el portón para siempre.
    try {
      new RegExp(patron);
    } catch (error) {
      throw new Error(`el patrón no es una expresión regular válida: ${error instanceof Error ? error.message : error}`);
    }
  }

  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);

    // Lo ya sabido no se repite: la memoria crece con cosas nuevas, no con ecos.
    const repetido = memoria.recuerdos.find((r) => esDuplicado(r.dicho, dicho));
    if (repetido) return repetido;

    const activo = extra.candidato === true ? false : true;
    const conflictoCon = extra.conflictoCon ?? contradiceA(dicho, memoria.recuerdos);

    const recuerdo: Recuerdo = {
      id: nuevoId("m"),
      dicho: dicho.trim(),
      ...(patron !== undefined ? { patron } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      creado: new Date().toISOString(),
      activo,
      ...(extra.origen ? { origen: extra.origen } : {}),
      ...(extra.porQue ? { porQue: extra.porQue } : {}),
      ...(extra.candidato ? { candidato: true } : {}),
      ...(conflictoCon ? { conflictoCon } : {}),
    };
    await guardarMemoria(repo, { recuerdos: [...memoria.recuerdos, recuerdo] });
    return recuerdo;
  });
}

/** Una corrección de la sesión espera la decisión del dueño. */
export async function recordarCandidato(
  repo: string,
  dicho: string,
  porQue: string,
  patron?: string,
  tipo?: Recuerdo["tipo"],
): Promise<Recuerdo | null> {
  if (porQue.trim() === "") throw new Error("una candidata necesita saber por qué se propone");
  if (await fueDescartado(repo, dicho)) return null;
  return recordar(repo, dicho, patron, tipo, { origen: "sesion", porQue, candidato: true });
}

/** Aprueba una candidata, con una edición opcional antes de hacerla activa. */
export function aprobarCandidato(repo: string, id: string, dichoEditado?: string): Promise<Recuerdo | null> {
  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);
    const candidata = memoria.recuerdos.find((r) => r.id === id && r.candidato);
    if (!candidata) return null;
    const dicho = dichoEditado?.trim() || candidata.dicho;
    if (dicho === "") throw new Error("un recuerdo vacío no le sirve a nadie");
    const repetido = memoria.recuerdos.find((r) => r.id !== id && esDuplicado(r.dicho, dicho));
    if (repetido) {
      await guardarMemoria(repo, { recuerdos: memoria.recuerdos.filter((r) => r.id !== id) });
      return repetido;
    }
    const conflictoCon = contradiceA(dicho, memoria.recuerdos.filter((r) => r.id !== id));
    const { candidato: _candidato, conflictoCon: _conflictoAnterior, ...sinEstadoDeCandidata } = candidata;
    const aprobado: Recuerdo = {
      ...sinEstadoDeCandidata,
      dicho,
      activo: true,
      ...(conflictoCon ? { conflictoCon } : {}),
    };
    await guardarMemoria(repo, { recuerdos: memoria.recuerdos.map((r) => (r.id === id ? aprobado : r)) });
    return aprobado;
  });
}

/** Descarta una candidata y guarda su texto normalizado para no volver a ofrecerlo. */
export function descartarCandidato(repo: string, id: string): Promise<boolean> {
  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);
    const candidata = memoria.recuerdos.find((r) => r.id === id && r.candidato);
    if (!candidata) return false;
    const descartes = await leerDescartes(repo);
    await guardarDescartes(repo, [...new Set([...descartes, normalizarTexto(candidata.dicho)])]);
    await guardarMemoria(repo, { recuerdos: memoria.recuerdos.filter((r) => r.id !== id) });
    return true;
  });
}

export async function fueDescartado(repo: string, texto: string): Promise<boolean> {
  const normalizado = normalizarTexto(texto);
  if (normalizado === "") return false;
  return (await leerDescartes(repo)).includes(normalizado);
}

async function leerDescartes(repo: string): Promise<string[]> {
  return leerEstado<string[]>(rutaDescartes(repo), [], (datos) => {
    if (Array.isArray(datos)) return datos.filter((texto): texto is string => typeof texto === "string");
    const textos = (datos as { textos?: unknown } | null)?.textos;
    return Array.isArray(textos) ? textos.filter((texto): texto is string => typeof texto === "string") : [];
  });
}

async function guardarDescartes(repo: string, textos: readonly string[]): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaDescartes(repo), `${JSON.stringify(textos, null, 2)}\n`);
}

/** Edita un dicho ya guardado sin dejar que la memoria acumule ecos. */
export function editarDicho(repo: string, id: string, dicho: string): Promise<Recuerdo | null> {
  const limpio = dicho.trim();
  if (limpio === "") return Promise.reject(new Error("un recuerdo vacío no le sirve a nadie"));
  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);
    const actual = memoria.recuerdos.find((r) => r.id === id);
    if (!actual) return null;
    const repetido = memoria.recuerdos.find((r) => r.id !== id && esDuplicado(r.dicho, limpio));
    if (repetido) return repetido;
    const conflictoCon = contradiceA(limpio, memoria.recuerdos.filter((r) => r.id !== id));
    const { conflictoCon: _conflictoAnterior, ...sinConflicto } = actual;
    const editado = { ...sinConflicto, dicho: limpio, ...(conflictoCon ? { conflictoCon } : {}) };
    await guardarMemoria(repo, { recuerdos: memoria.recuerdos.map((r) => (r.id === id ? editado : r)) });
    return editado;
  });
}

function esDuplicado(a: string, b: string): boolean {
  return normalizarTexto(a) === normalizarTexto(b) || jaccardDePalabras(a, b) > 0.8;
}

function contradiceA(dicho: string, recuerdos: readonly Recuerdo[]): string | undefined {
  return recuerdos.find((r) => r.activo && !r.candidato && seContradicen(dicho, r.dicho))?.id;
}

function seContradicen(a: string, b: string): boolean {
  const aa = normalizarTexto(a);
  const bb = normalizarTexto(b);
  const opuesto = (aa.includes("siempre") && bb.includes("nunca")) || (aa.includes("nunca") && bb.includes("siempre"));
  if (opuesto && jaccardDePalabras(aa.replace(/\b(siempre|nunca)\b/g, ""), bb.replace(/\b(siempre|nunca)\b/g, "")) > 0.35) return true;
  const usa = (texto: string) => texto.match(/\b(?:usa|usa|usar|usá)\s+(.+)/)?.[1];
  const noUsa = (texto: string) => texto.match(/\bno\s+uses?\s+(.+)/)?.[1];
  const aUsa = usa(aa);
  const bUsa = usa(bb);
  const aNoUsa = noUsa(aa);
  const bNoUsa = noUsa(bb);
  return (aUsa !== undefined && bNoUsa !== undefined && jaccardDePalabras(aUsa, bNoUsa) > 0.5) ||
    (bUsa !== undefined && aNoUsa !== undefined && jaccardDePalabras(bUsa, aNoUsa) > 0.5);
}

export function prenderRecuerdo(repo: string, id: string, activo: boolean): Promise<boolean> {
  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);
    const hay = memoria.recuerdos.some((r) => r.id === id);
    if (!hay) return false;
    await guardarMemoria(repo, {
      recuerdos: memoria.recuerdos.map((r) => (r.id === id ? { ...r, activo } : r)),
    });
    return true;
  });
}

export function olvidarRecuerdo(repo: string, id: string): Promise<boolean> {
  return enFila(rutaMemoria(repo), async () => {
    const memoria = await leerMemoria(repo);
    const quedan = memoria.recuerdos.filter((r) => r.id !== id);
    if (quedan.length === memoria.recuerdos.length) return false;
    await guardarMemoria(repo, { recuerdos: quedan });
    return true;
  });
}

/**
 * Los recuerdos con patrón, como verificadores del portón. Corren gratis
 * y miran SOLO las líneas que el intento agregó: lo viejo del repo no es
 * culpa del intento.
 */
export function verificadoresDeMemoria(memoria: Memoria): Verificador[] {
  return memoria.recuerdos
    .filter((r) => r.activo && !r.candidato && r.patron !== undefined)
    .map((r) => ({
      nombre: `memoria: ${recortar(r.dicho, 34)}`,
      costo: "gratis" as const,
      async correr(universo) {
        // Entero: con el tope de la pantalla, una línea prohibida detrás de un lockfile largo no se veía.
        const diff = await leerDiff(universo.ruta, { ...(universo.base ? { base: universo.base } : {}), entero: true });
        if (diff.noSePudo) return { paso: true, salteada: true, detalle: `memoria: no pude leer el diff (${diff.porQue ?? "git no contestó"})`, gastado: 0 };
        if (!diff.hay) return { paso: true, detalle: "memoria: sin cambios que mirar", gastado: 0 };

        const regex = new RegExp(r.patron!);
        // Se recorre el diff sabiendo en qué archivo se está: lo que pase
        // dentro de .dolphin/ no es del intento (ahí vive esta misma
        // memoria, y un recuerdo no puede cortarse a sí mismo).
        let archivo = "";
        let culpable: string | undefined;
        for (const l of diff.texto.split("\n")) {
          if (l.startsWith("+++ ")) {
            archivo = l.slice(4).replace(/^b\//, "");
            continue;
          }
          if (archivo.startsWith(".dolphin/")) continue;
          if (l.startsWith("+") && regex.test(l.slice(1))) {
            culpable = l;
            break;
          }
        }

        if (culpable) {
          return {
            paso: false,
            detalle: `memoria: ${r.dicho}`,
            evidencia: `la línea nueva que lo pisa: ${culpable.slice(1).trim()}`,
            gastado: 0,
          };
        }
        return { paso: true, detalle: `memoria: respeta «${recortar(r.dicho, 40)}»`, gastado: 0 };
      },
    }));
}

/**
 * Lo que viaja al prompt del agente: TODAS las reglas de la casa, más lo
 * aprendido (errores confirmados, decisiones, notas) que se parezca a la
 * tarea de hoy. Mejor no escribirlo que corregirlo después.
 */
export interface OpcionesDeContextoDeMemoria {
  readonly rutas?: readonly string[];
  readonly usos?: MemoriaUsos;
  readonly topeTokens?: number;
}

export function memoriasRelevantes(
  memoria: Memoria,
  tarea: string | TareaParaRelevancia = "",
  opciones: OpcionesDeContextoDeMemoria = {},
): readonly MemoriaRelevante[] {
  const contexto = typeof tarea === "string" ? { texto: tarea, ...(opciones.rutas ? { rutas: opciones.rutas } : {}) } : tarea;
  return relevanciaDeMemoria(contexto, memoria, {
    ...(opciones.topeTokens !== undefined ? { topeTokens: opciones.topeTokens } : {}),
    ...(opciones.usos !== undefined ? { usos: opciones.usos } : {}),
  });
}

export function contextoDeMemoria(memoria: Memoria, tarea?: string | TareaParaRelevancia, opciones: OpcionesDeContextoDeMemoria = {}): string {
  const activas = (tarea === undefined
    ? memoria.recuerdos.filter((r) => r.activo && !r.candidato && (r.tipo ?? "regla") === "regla")
    : memoriasRelevantes(memoria, tarea, opciones).map((r) => r.recuerdo));
  if (activas.length === 0) return "";

  const reglas = activas.filter((r) => (r.tipo ?? "regla") === "regla");
  const resto = activas.filter((r) => (r.tipo ?? "regla") !== "regla");

  // La selección ya hizo el ranking y el corte; acá solo conserva la forma
  // del contexto que los agentes ya conocen.
  const afines = resto;

  const partes: string[] = [];
  if (reglas.length > 0) {
    partes.push(
      "Reglas de la casa, aprendidas de correcciones anteriores en este repo. Respetalas todas:",
      ...reglas.map((r) => `- ${r.dicho}`),
    );
  }
  if (afines.length > 0) {
    partes.push(
      "",
      "Y esto ya pasó en este repo con tareas parecidas — tenelo en cuenta:",
      ...afines.map((r) => `- ${r.dicho}`),
    );
  }
  return partes.join("\n");
}

/**
 * Lo que una cosecha enseña sola: si NADIE pasó y la mayoría se cortó en
 * la misma fase, eso es un error confirmado del repo — queda recordado
 * sin que nadie escriba nada, y vuelve cuando una tarea se le parezca.
 */
export async function aprenderDeCosecha(repo: string, cosecha: Cosecha): Promise<Recuerdo | null> {
  if (cosecha.ganador || cosecha.candidatos.length < 2) return null;

  const cortes = new Map<string, number>();
  for (const c of cosecha.candidatos) {
    if (!c.vivo && c.murioEn) cortes.set(c.murioEn, (cortes.get(c.murioEn) ?? 0) + 1);
  }
  const [peor] = [...cortes.entries()].sort((a, b) => b[1] - a[1]);
  if (!peor || peor[1] < Math.ceil(cosecha.candidatos.length / 2)) return null;

  const ejemplo = cosecha.candidatos.find((c) => c.murioEn === peor[0])?.porQue ?? "";
  const dicho = `La tarea «${recortar(cosecha.tarea, 80)}» se cortó entera en ${peor[0]} (${peor[1]} de ${cosecha.candidatos.length} universos). El motivo: ${recortar(ejemplo, 140)}`;
  return await recordar(repo, dicho, undefined, "error", { origen: "sistema" });
}

/**
 * Lo que enseña una corrección que se deshizo: arreglaba una fase y rompía
 * otra (ver puntos.ts). Queda como error confirmado y vuelve cuando una
 * tarea se le parezca: la próxima vez, el agente ya sabe qué no tocar.
 */
export async function aprenderDeLoDeshecho(repo: string, cosecha: Cosecha): Promise<Recuerdo[]> {
  const vistos = new Set<string>();
  const aprendidos: Recuerdo[] = [];
  for (const c of cosecha.candidatos) {
    for (const p of c.pasadas) {
      if (!p.deshecha || !p.rotaPor) continue;
      // Una vez por par de fases: diez ramas que rompen lo mismo son una sola lección.
      const clave = `${p.rotaPor}→${p.verificador}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const motivo = p.detalle.replace(/ \(lo rompió la corrección de «[^»]*»\)$/, "");
      const dicho = `En «${recortar(cosecha.tarea, 80)}», corregir «${p.rotaPor}» rompió «${p.verificador}» y se deshizo: ${recortar(motivo, 140)}`;
      aprendidos.push(await recordar(repo, dicho, undefined, "error", { origen: "sistema" }));
    }
  }
  return aprendidos;
}

const recortar = (texto: string, tope: number) => (texto.length > tope ? `${texto.slice(0, tope - 1)}…` : texto);
