import { describe, expect, it } from "vitest";
import { aInputLocal, cuandoCorre, instanteDe } from "../ui/src/lib/cuando.js";

/** Las horas del calendario, en palabras y en instantes. */

const ahora = new Date(2026, 9, 22, 14, 30, 0);

describe("cuándo corre un turno", () => {
  it("ahora no agenda nada", () => {
    expect(instanteDe("ahora", ahora)).toBeNull();
  });

  it("en una hora, esta noche y mañana a las 9", () => {
    expect(instanteDe("en-una-hora", ahora)!.getHours()).toBe(15);
    const noche = instanteDe("esta-noche", ahora)!;
    expect([noche.getDate(), noche.getHours()]).toEqual([22, 23]);
    const manana = instanteDe("manana", ahora)!;
    expect([manana.getDate(), manana.getHours(), manana.getMinutes()]).toEqual([23, 9, 0]);
  });

  it("pasadas las 23, «esta noche» es mañana a la noche", () => {
    const tarde = new Date(2026, 9, 22, 23, 30);
    expect(instanteDe("esta-noche", tarde)!.getDate()).toBe(23);
  });

  it("una hora elegida a mano, o nada si no se entiende", () => {
    expect(instanteDe("elegido", ahora, "2026-10-25T08:15")!.getHours()).toBe(8);
    expect(instanteDe("elegido", ahora, "cualquier cosa")).toBeNull();
  });

  it("se dice como lo diría una persona", () => {
    expect(cuandoCorre(new Date(2026, 9, 22, 14, 50), ahora)).toBe("en 20 min");
    expect(cuandoCorre(new Date(2026, 9, 22, 23, 0), ahora)).toBe("hoy 23:00");
    expect(cuandoCorre(new Date(2026, 9, 23, 9, 0), ahora)).toBe("mañana 09:00");
    expect(cuandoCorre(new Date(2026, 10, 12, 9, 0), ahora)).toBe("12/11 09:00");
  });

  it("el valor del campo de fecha y hora va en hora local", () => {
    expect(aInputLocal(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
  });
});
