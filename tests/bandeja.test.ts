import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import {
  cambiarEstado,
  firmaDe,
  leerBandeja,
  promptDeImplementacion,
  sumarAsuntos,
  type AsuntoNuevo,
} from "../src/nucleo/bandeja.js";

/**
 * La bandeja: ideas y errores que Dolphin encontró solo. Lo que importa es
 * que no haga ruido —el mismo asunto es uno solo— y que lo rechazado no
 * vuelva nunca.
 */

const idea = (titulo: string, extra: Partial<AsuntoNuevo> = {}): AsuntoNuevo => ({
  tipo: "idea",
  titulo,
  detalle: "Linear deja deshacer una acción con Ctrl+Z durante 10 segundos.",
  fuentes: [{ titulo: "Linear changelog", url: "https://linear.app/changelog" }],
  propuesta: "Un toast con «Deshacer» después de archivar.",
  origen: "scout",
  ...extra,
});

const error = (titulo: string, donde: string, extra: Partial<AsuntoNuevo> = {}): AsuntoNuevo => ({
  tipo: "error",
  titulo,
  detalle: "Toqué «Guardar» y no pasó nada: ni mensaje, ni navegación, ni cambio en la pantalla.",
  donde,
  pasos: ["Abrí /alta", "Tocá «Guardar» sin completar nada"],
  origen: "explorador",
  ...extra,
});

describe("la bandeja", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-bandeja-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("empieza vacía y guarda lo que se suma, abierto", async () => {
    expect((await leerBandeja(repo)).asuntos).toEqual([]);
    const { sumados } = await sumarAsuntos(repo, [idea("Deshacer con Ctrl+Z"), error("El botón Guardar no hace nada", "/alta")]);
    expect(sumados).toHaveLength(2);
    const { asuntos } = await leerBandeja(repo);
    expect(asuntos.map((a) => a.estado)).toEqual(["abierto", "abierto"]);
    expect(asuntos.map((a) => a.tipo)).toEqual(["idea", "error"]);
  });

  it("el mismo error encontrado otra vez es UNO solo, y se cuenta que se volvió a ver", async () => {
    await sumarAsuntos(repo, [error("El botón Guardar no hace nada", "/alta")]);
    // Otra pasada: mismo lugar, mismo error, con un número distinto adentro.
    const segunda = await sumarAsuntos(repo, [error("El botón Guardar no hace nada", "/alta")]);
    expect(segunda.sumados).toHaveLength(0);
    expect(segunda.yaEstaban).toBe(1);

    const { asuntos } = await leerBandeja(repo);
    expect(asuntos).toHaveLength(1);
    expect(asuntos[0]!.vecesVisto).toBe(1);
  });

  it("el mismo error en OTRA pantalla es otro asunto", async () => {
    await sumarAsuntos(repo, [error("El botón Guardar no hace nada", "/alta")]);
    const { sumados } = await sumarAsuntos(repo, [error("El botón Guardar no hace nada", "/clientes")]);
    expect(sumados).toHaveLength(1);
  });

  it("lo que cambia entre pasadas —números, mayúsculas, tildes— no hace a un asunto distinto", () => {
    const a = firmaDe({ tipo: "error", titulo: "La tabla desborda 130 px", donde: "/Facturas", detalle: "" });
    const b = firmaDe({ tipo: "error", titulo: "la tabla desborda 98 px", donde: "/facturas", detalle: "otro texto" });
    expect(a).toBe(b);
  });

  it("una idea rechazada no se vuelve a proponer aunque el scout la encuentre de nuevo", async () => {
    const { sumados } = await sumarAsuntos(repo, [idea("Deshacer con Ctrl+Z")]);
    await cambiarEstado(repo, sumados[0]!.id, "rechazado");

    const otraSemana = await sumarAsuntos(repo, [
      idea("Deshacer con Ctrl+Z", { detalle: "La misma idea, contada distinto.", fuentes: [{ titulo: "Notion", url: "https://notion.so" }] }),
    ]);
    expect(otraSemana.sumados).toHaveLength(0);
    expect(otraSemana.rechazados).toBe(1);

    const { asuntos } = await leerBandeja(repo);
    expect(asuntos).toHaveLength(1);
    expect(asuntos[0]!.estado).toBe("rechazado");
  });

  it("cambiar el estado de un asunto que no existe no rompe nada", async () => {
    expect(await cambiarEstado(repo, "no-existe", "rechazado")).toBeNull();
  });

  it("el pedido para implementar una idea lleva la idea, las fuentes, la propuesta y cuándo está terminada", async () => {
    const { sumados } = await sumarAsuntos(repo, [idea("Deshacer con Ctrl+Z")]);
    const prompt = promptDeImplementacion(sumados[0]!);
    expect(prompt).toContain("Implementá esta idea en el proyecto: Deshacer con Ctrl+Z");
    expect(prompt).toContain("https://linear.app/changelog");
    expect(prompt).toContain("Un toast con «Deshacer»");
    expect(prompt).toContain("Está terminado cuando:");
  });

  it("el pedido para arreglar un error lleva los pasos para reproducirlo y pide un test", async () => {
    const { sumados } = await sumarAsuntos(repo, [error("El botón Guardar no hace nada", "/alta", { evidencia: "TypeError: x is undefined" })]);
    const prompt = promptDeImplementacion(sumados[0]!);
    expect(prompt).toContain("Arreglá este error");
    expect(prompt).toContain("1. Abrí /alta");
    expect(prompt).toContain("2. Tocá «Guardar» sin completar nada");
    expect(prompt).toContain("TypeError: x is undefined");
    expect(prompt).toContain("hay un test que reproduce el error");
  });
});
