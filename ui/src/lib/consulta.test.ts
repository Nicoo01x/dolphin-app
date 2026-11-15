import { describe, expect, it } from "vitest";
import { alternarTermino, filtrarIssues, leerConsulta, mismaConsulta, partir, pasaLaConsulta, tieneTermino } from "./consulta";
import type { Issue } from "./git";

const issue = (x: Partial<Issue>): Issue => ({
  numero: 1,
  titulo: "El portón no corre en Windows",
  abierto: true,
  etiquetas: [],
  asignados: [],
  fecha: "2026-10-20T10:00:00Z",
  actualizado: "2026-10-20T10:00:00Z",
  url: "https://github.com/Nicoo01x/dolphin-app/issues/1",
  ...x,
});

describe("la búsqueda de issues, escrita como en GitHub", () => {
  it("un término con comillas no se parte en dos", () => {
    expect(partir('is:open label:"os:windows" label:"con espacio" roto')).toEqual(['is:open', 'label:"os:windows"', 'label:"con espacio"', "roto"]);
  });

  it("lee estado, etiquetas, gente y texto suelto", () => {
    const c = leerConsulta('is:open label:bug author:ana assignee:@me no:assignee portón');
    expect(c).toMatchObject({ estado: "abiertos", etiquetas: ["bug"], autores: ["ana"], asignados: ["@me"], sinAsignar: true, texto: ["portón"] });
  });

  it("un campo vacío muestra los dos estados: no esconde los cerrados sin avisar", () => {
    expect(leerConsulta("").estado).toBe("todos");
    const todos = filtrarIssues([issue({ numero: 1 }), issue({ numero: 2, abierto: false })], "");
    expect(todos.map((i) => i.numero).sort()).toEqual([1, 2]);
  });

  it("is:issue y is:pr se ignoran en vez de dejar la lista vacía", () => {
    // Se copian y pegan de GitHub todo el tiempo, y acá todo es un issue.
    expect(filtrarIssues([issue({})], "is:issue is:open")).toHaveLength(1);
    expect(filtrarIssues([issue({})], "is:pr")).toHaveLength(1);
  });

  it("un término que no entendemos se busca como texto, no filtra a cero", () => {
    expect(leerConsulta("milestone:v2").texto).toEqual(["milestone:v2"]);
    expect(filtrarIssues([issue({ titulo: "subir a milestone:v2" })], "milestone:v2")).toHaveLength(1);
  });

  it("los términos se suman y los valores de uno se eligen", () => {
    const uno = issue({ numero: 1, etiquetas: ["bug", "os:windows"] });
    const otro = issue({ numero: 2, etiquetas: ["bug"] });
    expect(filtrarIssues([uno, otro], "label:bug").map((i) => i.numero).sort()).toEqual([1, 2]);
    expect(filtrarIssues([uno, otro], "label:bug label:os:windows").map((i) => i.numero)).toEqual([1]);
  });

  it("assignee:@me es quien tenga la sesión de gh, y sin sesión no es nadie", () => {
    const mio = issue({ numero: 1, asignados: [{ nombre: "Nico", login: "Nicoo01x" }] });
    const ajeno = issue({ numero: 2, asignados: [{ nombre: "Ana", login: "ana" }] });
    expect(filtrarIssues([mio, ajeno], "assignee:@me", "nicoo01x").map((i) => i.numero)).toEqual([1]);
    // Sin saber quién soy, «mío» no puede ser todo: antes que mentir, nada.
    expect(filtrarIssues([mio, ajeno], "assignee:@me")).toEqual([]);
  });

  it("no:assignee son los que no agarró nadie", () => {
    const libre = issue({ numero: 1 });
    const tomado = issue({ numero: 2, asignados: [{ nombre: "Ana", login: "ana" }] });
    expect(filtrarIssues([libre, tomado], "no:assignee").map((i) => i.numero)).toEqual([1]);
  });

  it("el texto busca en el número, el título, las etiquetas y la gente", () => {
    const i = issue({ numero: 37083, titulo: "Dolphin abre powershell cada 2 s", etiquetas: ["os:windows"], autor: { nombre: "jkutasi", login: "jkutasi" } });
    for (const q of ["37083", "#37083", "powershell", "os:windows", "jkutasi", "POWERSHELL"]) expect(filtrarIssues([i], q), q).toHaveLength(1);
    expect(filtrarIssues([i], "macos")).toHaveLength(0);
  });

  it("ordena por lo último que se movió, no por cuándo nació", () => {
    const viejo = issue({ numero: 1, fecha: "2026-01-01T00:00:00Z", actualizado: "2026-10-31T00:00:00Z" });
    const nuevo = issue({ numero: 2, fecha: "2026-10-30T00:00:00Z", actualizado: "2026-10-30T00:00:00Z" });
    expect(filtrarIssues([nuevo, viejo], "").map((i) => i.numero)).toEqual([1, 2]);
  });

  it("los botones de arriba se prenden sin importar el orden ni la caja", () => {
    expect(mismaConsulta("is:open assignee:@me", "assignee:@ME is:open")).toBe(true);
    expect(mismaConsulta("is:open", "is:closed")).toBe(false);
  });

  it("una casilla del menú pone y saca su término sin tocar el resto", () => {
    expect(alternarTermino("is:open", "label:bug")).toBe("is:open label:bug");
    expect(alternarTermino("is:open label:bug", "label:bug")).toBe("is:open");
    expect(tieneTermino("is:open LABEL:bug", "label:bug")).toBe(true);
  });

  it("el estado cerrado deja afuera a los abiertos", () => {
    const abierto = issue({ numero: 1 });
    const cerrado = issue({ numero: 2, abierto: false });
    expect(filtrarIssues([abierto, cerrado], "is:closed").map((i) => i.numero)).toEqual([2]);
    expect(pasaLaConsulta(abierto, leerConsulta("is:closed"))).toBe(false);
  });
});
