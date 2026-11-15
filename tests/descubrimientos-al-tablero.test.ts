import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { cambiarEstado, leerBandeja, sumarAsuntos, type AsuntoNuevo } from "../src/nucleo/bandeja.js";
import { anotarDescubrimiento, detalleDeLaTarjeta, seAnoto } from "../src/nucleo/descubrimientos-al-tablero.js";
import { crearTarjeta, leerTablero } from "../src/nucleo/tarjetas.js";

/**
 * Lo que encuentra un robot se puede anotar en el tablero en vez de tirarlo o pagarlo: es la
 * tercera salida de la bandeja.
 */

const UNA_IDEA: AsuntoNuevo = {
  tipo: "idea",
  titulo: "mostrar cuánto falta para que termine la importación",
  detalle: "La barra no dice cuántos quedan y la gente la cierra.",
  propuesta: "Sumar el contador al componente de la barra.",
  fuentes: [{ titulo: "Linear", url: "https://linear.app" }],
  origen: "scout",
};

const UN_ERROR: AsuntoNuevo = {
  tipo: "error",
  titulo: "el login no valida el mail",
  detalle: "Con «hola@» entra igual y después no llega ningún correo.",
  donde: "/entrar",
  pasos: ["Abrir /entrar", "Escribir hola@", "Tocar Entrar"],
  evidencia: "POST /api/login → 200",
  captura: "login.png",
  origen: "explorador",
};

describe("los descubrimientos de la bandeja, al tablero", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-descubrimientos-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const sumarUno = async (asunto: AsuntoNuevo) => {
    await sumarAsuntos(repo, [asunto]);
    const [guardado] = (await leerBandeja(repo)).asuntos;
    return guardado!;
  };

  it("una idea queda como tarjeta en Ideas y sale de la bandeja", async () => {
    const asunto = await sumarUno(UNA_IDEA);
    const hecho = await anotarDescubrimiento(repo, asunto.id);

    expect(seAnoto(hecho)).toBe(true);
    if (!seAnoto(hecho)) return;
    expect(hecho.tarjeta.columna).toBe("ideas");
    expect(hecho.tarjeta.tipo).toBe("idea");
    expect(hecho.tarjeta.titulo).toBe(UNA_IDEA.titulo);
    expect(hecho.tarjeta.origen).toBe("bandeja/scout");
    expect(hecho.asunto.estado).toBe("anotado");

    const [enLaBandeja] = (await leerBandeja(repo)).asuntos;
    expect(enLaBandeja?.estado).toBe("anotado");
  });

  it("un error entra como bug, con cómo se sabría que está resuelto", async () => {
    const asunto = await sumarUno(UN_ERROR);
    const hecho = await anotarDescubrimiento(repo, asunto.id);
    if (!seAnoto(hecho)) throw new Error("tendría que haberse anotado");

    expect(hecho.tarjeta.tipo).toBe("bug");
    // En Ideas igual: lo encontró un robot, lo aprueba una persona.
    expect(hecho.tarjeta.columna).toBe("ideas");
    expect(hecho.tarjeta.terminado).toContain("/entrar");
  });

  it("la tarjeta se lleva lo que ya se averiguó, y no la captura", () => {
    const detalle = detalleDeLaTarjeta({ ...UN_ERROR, id: "a1", firma: "f", estado: "abierto", creado: new Date().toISOString() });
    expect(detalle).toContain("Con «hola@» entra igual");
    expect(detalle).toContain("Dónde: /entrar");
    expect(detalle).toContain("1. Abrir /entrar");
    expect(detalle).toContain("POST /api/login → 200");
    expect(detalle).toContain("asunto a1");
    expect(detalle).not.toContain("login.png");
  });

  it("una idea trae de dónde se la copió", async () => {
    const asunto = await sumarUno(UNA_IDEA);
    const hecho = await anotarDescubrimiento(repo, asunto.id);
    if (!seAnoto(hecho)) throw new Error("tendría que haberse anotado");
    expect(hecho.tarjeta.detalle).toContain("Cómo se haría acá: Sumar el contador");
    expect(hecho.tarjeta.detalle).toContain("Visto en: Linear (https://linear.app)");
  });

  it("si el tablero ya dice lo mismo, no se duplica, pero igual sale de la bandeja", async () => {
    const yaEstaba = await crearTarjeta(repo, { titulo: "El login no valida el mail" });
    const asunto = await sumarUno(UN_ERROR);

    const hecho = await anotarDescubrimiento(repo, asunto.id);
    expect(seAnoto(hecho)).toBe(false);
    if (seAnoto(hecho)) return;
    expect(hecho.porQue).toBe("ya-estaba");
    expect(hecho.tarjeta?.id).toBe(yaEstaba.id);

    expect(await leerTablero(repo)).toHaveLength(1);
    expect((await leerBandeja(repo)).asuntos[0]?.estado).toBe("anotado");
  });

  it("cuando se parece sin ser la misma, anota y avisa de la parecida", async () => {
    // Comparten tema y palabras, pero piden cosas distintas: dos tarjetas, con el aviso al lado.
    // (Si el título fuera el mismo cambiando «importación» por «exportación», `yaEstaAnotada` las
    // daría por la misma, que es justo lo que queremos que haga.)
    await crearTarjeta(repo, { titulo: "mostrar cuánto falta en la importación de clientes" });
    const asunto = await sumarUno(UNA_IDEA);
    const hecho = await anotarDescubrimiento(repo, asunto.id);
    if (!seAnoto(hecho)) throw new Error("tendría que haberse anotado");
    expect(hecho.parecidas[0]?.titulo).toContain("importación");
    expect(await leerTablero(repo)).toHaveLength(2);
  });

  it("uno que ya se está implementando no se anota: tiene una rama en camino", async () => {
    const asunto = await sumarUno(UNA_IDEA);
    await cambiarEstado(repo, asunto.id, "implementando");
    const hecho = await anotarDescubrimiento(repo, asunto.id);
    expect(seAnoto(hecho)).toBe(false);
    if (seAnoto(hecho)) return;
    expect(hecho.porQue).toBe("no-esta-abierto");
    expect(await leerTablero(repo)).toHaveLength(0);
  });

  it("un id que no está se dice, no explota", async () => {
    const hecho = await anotarDescubrimiento(repo, "no-existe");
    expect(seAnoto(hecho)).toBe(false);
    if (seAnoto(hecho)) return;
    expect(hecho.porQue).toBe("no-esta");
  });
});
