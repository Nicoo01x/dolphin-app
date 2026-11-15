import type { Issue } from "./git";

/**
 * La búsqueda de issues, escrita como en GitHub: `is:open label:bug assignee:@me`.
 *
 * Es un campo de texto y no cinco menús porque es lo que ya sabe escribir cualquiera que use
 * GitHub, se copia y se pega de una pestaña a la otra, y entra entero en una URL. Los botones de
 * arriba (abiertos, asignados a mí) y el menú de filtros no son otro estado: escriben acá.
 *
 * Filtra sobre los issues que el servidor ya trajo, así que no hay una llamada a `gh` por tecla.
 *
 * Lógica pura: se testea sin navegador.
 */

export interface Consulta {
  readonly estado: "abiertos" | "cerrados" | "todos";
  readonly etiquetas: readonly string[];
  readonly autores: readonly string[];
  /** Cada uno tal como se escribió; `@me` y `yo` se resuelven al mirar, no acá. */
  readonly asignados: readonly string[];
  readonly sinAsignar: boolean;
  /** Lo que no era un término: se busca en el número, el título, las etiquetas y la gente. */
  readonly texto: readonly string[];
}

/** Las consultas de los botones de arriba. */
export const ABIERTOS = "is:open";
export const CERRADOS = "is:closed";
export const MIOS = "is:open assignee:@me";

/** Parte en términos respetando las comillas, para que `label:"en el celular"` sea uno solo. */
export function partir(consulta: string): string[] {
  return consulta.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
}

const sinComillas = (valor: string) => valor.replace(/"/g, "").trim();

/** Dos consultas son la misma si tienen los mismos términos, sin importar el orden ni la caja. */
export function mismaConsulta(una: string, otra: string): boolean {
  const normal = (c: string) => partir(c).map((t) => t.toLowerCase()).sort().join(" ");
  return normal(una) === normal(otra);
}

/** Pone o saca un término. Es lo que hacen las casillas del menú de filtros. */
export function alternarTermino(consulta: string, termino: string): string {
  const partes = partir(consulta);
  const sin = partes.filter((p) => p.toLowerCase() !== termino.toLowerCase());
  return (sin.length < partes.length ? sin : [...partes, termino]).join(" ");
}

export const tieneTermino = (consulta: string, termino: string): boolean =>
  partir(consulta).some((p) => p.toLowerCase() === termino.toLowerCase());

export function leerConsulta(consulta: string): Consulta {
  // Sin `is:` se muestran los dos estados: un campo vacío no esconde nada.
  let estado: Consulta["estado"] = "todos";
  const etiquetas: string[] = [];
  const autores: string[] = [];
  const asignados: string[] = [];
  let sinAsignar = false;
  const texto: string[] = [];

  for (const parte of partir(consulta)) {
    const corte = parte.indexOf(":");
    const clave = corte > 0 ? parte.slice(0, corte).toLowerCase() : "";
    const valor = corte > 0 ? sinComillas(parte.slice(corte + 1)) : "";
    if (clave === "is") {
      if (/^(open|abierto|abiertos)$/i.test(valor)) estado = "abiertos";
      else if (/^(closed|cerrado|cerrados)$/i.test(valor)) estado = "cerrados";
      // `is:issue` y `is:pr` se ignoran a propósito: acá todo es un issue, y escribirlos (se
      // copian y pegan de GitHub todo el tiempo) no tiene por qué dejar la lista vacía.
      continue;
    }
    if ((clave === "label" || clave === "etiqueta") && valor) {
      etiquetas.push(valor);
      continue;
    }
    if ((clave === "author" || clave === "autor") && valor) {
      autores.push(valor);
      continue;
    }
    if ((clave === "assignee" || clave === "asignado") && valor) {
      asignados.push(valor);
      continue;
    }
    if ((clave === "no" || clave === "sin") && /^(assignee|asignado|asignados)$/i.test(valor)) {
      sinAsignar = true;
      continue;
    }
    // Cualquier otra cosa —incluido un `loquesea:x` que no entendemos— es texto: filtrar por algo
    // que no se entendió deja la lista vacía sin decir por qué.
    if (sinComillas(parte)) texto.push(sinComillas(parte).toLowerCase());
  }

  return { estado, etiquetas, autores, asignados, sinAsignar, texto };
}

const igual = (uno: string | undefined, otro: string) => (uno ?? "").toLowerCase() === otro.toLowerCase();

/** A quién apunta un `assignee:` : `@me` y `yo` son quien tenga la sesión de `gh`. */
const aQuien = (escrito: string, yo: string | undefined) => (/^(@me|yo|@yo)$/i.test(escrito) ? (yo ?? "\u0000nadie") : escrito);

/** Todo lo que diga la consulta tiene que dar: los términos se suman, los valores de uno se eligen. */
export function pasaLaConsulta(issue: Issue, consulta: Consulta, yo?: string): boolean {
  if (consulta.estado === "abiertos" && !issue.abierto) return false;
  if (consulta.estado === "cerrados" && issue.abierto) return false;
  if (consulta.sinAsignar && issue.asignados.length > 0) return false;
  if (consulta.etiquetas.some((e) => !issue.etiquetas.some((suya) => igual(suya, e)))) return false;
  if (consulta.autores.length > 0 && !consulta.autores.some((a) => igual(issue.autor?.login, aQuien(a, yo)) || igual(issue.autor?.nombre, a))) return false;
  if (consulta.asignados.length > 0 && !consulta.asignados.some((a) => issue.asignados.some((p) => igual(p.login, aQuien(a, yo)) || igual(p.nombre, a)))) return false;
  if (consulta.texto.length > 0) {
    const donde = [`#${issue.numero}`, issue.titulo, issue.etiquetas.join(" "), issue.autor?.login ?? "", issue.asignados.map((p) => `${p.nombre} ${p.login ?? ""}`).join(" ")]
      .join(" ")
      .toLowerCase();
    if (consulta.texto.some((palabra) => !donde.includes(palabra))) return false;
  }
  return true;
}

/** Los issues que pasan, de lo último que se movió a lo más viejo. */
export function filtrarIssues(issues: readonly Issue[], consulta: string, yo?: string): Issue[] {
  const leida = leerConsulta(consulta);
  return issues
    .filter((i) => pasaLaConsulta(i, leida, yo))
    .sort((a, b) => Date.parse(b.actualizado) - Date.parse(a.actualizado));
}
