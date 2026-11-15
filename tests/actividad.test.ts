import { describe, expect, it } from "vitest";
import { armarActividad, type FuentesDeActividad } from "../src/nucleo/actividad.js";
import type { Candidato, Cosecha } from "../src/nucleo/tipos.js";
import type { Asunto } from "../src/nucleo/bandeja.js";
import type { Turno } from "../src/nucleo/calendario.js";

/**
 * La actividad se arma de lo que ya está en `.dolphin/`: estos tests miran
 * que cada fuente diga lo que pasó en voz humana, con su hora real, y que
 * lo que no tiene hora no aparezca con una inventada.
 */

const candidato = (id: string, vivo: boolean, extra: Partial<Candidato> = {}): Candidato => ({
  universo: { id, rama: `dolphin/${id}`, ruta: `/tmp/${id}`, nacido: 0 },
  vivo,
  pasadas: vivo ? [{ verificador: "test", costo: "gratis", paso: true, detalle: "test: pasó", gastado: 0, ms: 10 }] : [],
  ...extra,
});

const cosecha = (cuando: string, candidatos: Candidato[], extra: Partial<Cosecha> = {}): Cosecha & { cuando: string } => ({
  tarea: "arreglá el IVA",
  candidatos,
  ...(candidatos.find((c) => c.vivo) ? { ganador: candidatos.find((c) => c.vivo)! } : {}),
  gastado: 0,
  muertosGratis: 0,
  ms: 1000,
  cuando,
  ...extra,
});

const vacias: FuentesDeActividad = { cosechas: [], asuntos: [], turnos: [], recuerdos: [] };

describe("la actividad del proyecto", () => {
  it("cuenta cómo le fue a cada siembra, con el logo de quien escribió y el link a la cosecha", () => {
    const actividad = armarActividad({
      ...vacias,
      cosechas: [
        { id: "a.json", cosecha: cosecha("2026-10-21T10:00:00.000Z", [candidato("u1", true, { modelo: "claude-sonnet-5-5" })]) },
        {
          id: "b.json",
          cosecha: cosecha("2026-10-21T11:00:00.000Z", [candidato("u1", false, { murioEn: "test", porQue: "test: ✖ suma el IVA" })]),
        },
        { id: "c.json", cosecha: cosecha("2026-10-21T12:00:00.000Z", [candidato("u1", true), candidato("u2", false), candidato("u3", true)]) },
      ],
    });

    expect(actividad.map((a) => a.titulo)).toEqual(["2 de 3 ramas pasaron", "Se cortó en test", "Pasó todas las fases"]);
    expect(actividad[1]).toMatchObject({ tono: "mal", nota: "test: ✖ suma el IVA", cosecha: "b.json" });
    expect(actividad[2]).toMatchObject({ tono: "bien", modelo: "claude-sonnet-5-5", sobre: "arreglá el IVA" });
  });

  it("de un pedido en vivo cuenta lo pedido, no el elemento que se tocó", () => {
    const enVivo = cosecha("2026-10-21T10:00:00.000Z", [candidato("u1", true)], {
      tarea: "Hacé este botón amarillo\n\nEs sobre un elemento de la app que se tocó en la pantalla. Así estaba:\n- selector: button",
    });
    const [a] = armarActividad({ ...vacias, cosechas: [{ id: "a.json", cosecha: enVivo }] });
    expect(a!.sobre).toBe("Hacé este botón amarillo");
  });

  it("una rama a la que se le salteó una fase no «pasó todas las fases»", () => {
    const salteada = candidato("u1", true, {
      pasadas: [
        { verificador: "test", costo: "gratis", paso: true, detalle: "test: pasó", gastado: 0, ms: 10 },
        { verificador: "revisión", costo: "barato", paso: true, salteada: true, detalle: "revisión: no contestó, se salteó", gastado: 0, ms: 10 },
      ],
    });
    const [a] = armarActividad({ ...vacias, cosechas: [{ id: "a.json", cosecha: cosecha("2026-10-21T10:00:00.000Z", [salteada]) }] });
    expect(a).toMatchObject({ titulo: "Pasó, pero se salteó revisión", tono: "neutro" });
  });

  it("una siembra sin ramas no dice «0 de 0»: dice que no se abrió ninguna", () => {
    const [a] = armarActividad({ ...vacias, cosechas: [{ id: "a.json", cosecha: cosecha("2026-10-21T10:00:00.000Z", []) }] });
    expect(a).toMatchObject({ titulo: "No se abrió ninguna rama", tono: "mal" });
  });

  it("una rama sin fases no «pasó»: terminó sin probar", () => {
    const sinFases = { ...candidato("u1", true), pasadas: [] };
    const [a] = armarActividad({ ...vacias, cosechas: [{ id: "a.json", cosecha: cosecha("2026-10-21T10:00:00.000Z", [sinFases]) }] });
    expect(a).toMatchObject({ titulo: "Terminó sin fases: no se probó nada", tono: "neutro" });
  });

  it("el PR, el merge y el descarte salen con su propia hora, después de la siembra", () => {
    const entregada = { rama: "dolphin/u1", commit: "abc", base: "def", ramaBase: "main" };
    const actividad = armarActividad({
      ...vacias,
      cosechas: [
        {
          id: "a.json",
          cosecha: cosecha("2026-10-21T10:00:00.000Z", [candidato("u1", true)], {
            entregada,
            pr: { url: "https://github.com/x/y/pull/1", en: "2026-10-21T10:05:00.000Z" },
            mergeadaEn: "2026-10-21T10:30:00.000Z",
          }),
        },
        {
          id: "b.json",
          cosecha: cosecha("2026-10-21T09:00:00.000Z", [candidato("u1", true)], { entregada, descartadaEn: "2026-10-21T09:10:00.000Z" }),
        },
      ],
    });
    expect(actividad.map((a) => a.tipo)).toEqual(["merge", "pr", "siembra", "descarte", "siembra"]);
    expect(actividad[0]!.titulo).toBe("Mergeaste dolphin/u1 en main");
    expect(actividad[1]!.nota).toBe("https://github.com/x/y/pull/1");
  });

  it("un PR de antes, sin hora, no aparece con una hora inventada", () => {
    const actividad = armarActividad({
      ...vacias,
      cosechas: [{ id: "a.json", cosecha: cosecha("2026-10-21T10:00:00.000Z", [candidato("u1", true)], { pr: { url: "https://x/pull/1" } }) }],
    });
    expect(actividad.map((a) => a.tipo)).toEqual(["siembra"]);
  });

  it("de la bandeja: la idea con dónde se vio, el error con dónde pasa, y el arreglo cuando volvió a probar", () => {
    const base = { origen: "explorador", firma: "f", estado: "abierto" as const, detalle: "d" };
    const asuntos: Asunto[] = [
      { ...base, id: "i1", tipo: "idea", titulo: "Un juez para desempatar", creado: "2026-10-21T08:00:00.000Z", fuentes: [{ titulo: "paper", url: "https://www.arxiv.org/abs/1" }] },
      { ...base, id: "e1", tipo: "error", titulo: "Tocar Guardar no hace nada", donde: "/alta", creado: "2026-10-21T09:00:00.000Z", resueltoEn: "2026-10-21T12:00:00.000Z" },
    ];
    const actividad = armarActividad({ ...vacias, asuntos });

    expect(actividad.map((a) => [a.tipo, a.tono])).toEqual([
      ["arreglo", "bien"],
      ["error", "mal"],
      ["idea", "neutro"],
    ]);
    expect(actividad[1]!.nota).toBe("en /alta");
    expect(actividad[2]!.nota).toBe("vista en arxiv.org");
  });

  it("del calendario solo lo que corrió: lo agendado es la agenda, no la actividad", () => {
    const base = { agente: "claude" as const, creado: "2026-10-20T00:00:00.000Z", cuando: "2026-10-22T09:00:00.000Z" };
    const turnos: Turno[] = [
      { ...base, id: "t1", tareas: ["revisá las dependencias", "subí la versión"], estado: "hecho", corrio: "2026-10-21T09:00:00.000Z", host: "vps" },
      { ...base, id: "t2", tareas: ["algo"], estado: "fallo", corrio: "2026-10-21T10:00:00.000Z", porQue: "no hay un host «vps»" },
      { ...base, id: "t3", tareas: ["mañana"], estado: "agendado" },
      { ...base, id: "t4", tareas: ["cancelado"], estado: "cancelado" },
    ];
    const actividad = armarActividad({ ...vacias, turnos });

    expect(actividad).toHaveLength(2);
    expect(actividad[0]).toMatchObject({ titulo: "Un turno del calendario no salió", tono: "mal", nota: "no hay un host «vps»" });
    expect(actividad[1]).toMatchObject({ titulo: "El calendario corrió un turno solo", sobre: "revisá las dependencias y 1 más", nota: "en vps" });
  });

  it("la actividad conserva la espera del cupo aunque después haya salido", () => {
    const actividad = armarActividad({
      ...vacias,
      turnos: [
        {
          id: "cupo",
          tareas: [],
          cuando: "2026-10-22T02:00:00.000Z",
          creado: "2026-10-22T02:00:00.000Z",
          agente: "codex",
          estado: "agendado",
          deLaBandeja: { tope: 2 },
          corridas: [{ cuando: "2026-10-22T06:00:00.000Z", salio: true, porQue: "1 de 1 pasaron el portón; Esperé al reinicio del cupo (93 % de la semana)" }],
        },
      ],
    });
    expect(actividad[0]!.nota).toContain("Esperé al reinicio del cupo (93 % de la semana)");
  });

  it("lo que aprendió la memoria, diciendo qué tipo de recuerdo es", () => {
    const actividad = armarActividad({
      ...vacias,
      recuerdos: [
        { id: "r1", dicho: "a los clientes se les escribe sin markdown", creado: "2026-10-21T10:00:00.000Z", activo: true },
        { id: "r2", dicho: "usamos Vitest", tipo: "decision", creado: "2026-10-21T11:00:00.000Z", activo: false },
      ],
    });
    expect(actividad.map((a) => a.titulo)).toEqual(["Anotó una decisión del proyecto", "Aprendió una regla"]);
    expect(actividad[0]!.nota).toBe("apagada");
  });

  it("lo más nuevo primero, con tope, y sin fechas rotas", () => {
    const recuerdos = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      dicho: `regla ${i}`,
      creado: `2026-10-21T1${i}:00:00.000Z`,
      activo: true,
    }));
    const actividad = armarActividad({ ...vacias, recuerdos: [...recuerdos, { id: "rota", dicho: "x", creado: "ayer", activo: true }] }, 3);
    expect(actividad.map((a) => a.sobre)).toEqual(["regla 9", "regla 8", "regla 7"]);
  });
});
