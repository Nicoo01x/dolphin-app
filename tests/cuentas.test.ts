import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  alCambiarDeCuenta,
  conCuentaDeClaude,
  cuentaAgotada,
  cuentaEnUso,
  cuentasDeClaude,
  elegirCuenta,
  entornoDeCuenta,
  esLimiteDeUso,
  leerCuentasDeClaude,
  olvidarCuentas,
} from "../src/nucleo/cuentas.js";

/**
 * Varias cuentas de Claude (dos suscripciones): Dolphin lee las que agregó el escritorio, corre con
 * la elegida y, si una llega a su límite, sigue con la próxima que tenga cupo. Todo con carpetas
 * de mentira: las cuentas reales no se leen.
 */

async function casaDePrueba(): Promise<{ casa: string; entorno: NodeJS.ProcessEnv }> {
  const casa = await mkdtemp(join(tmpdir(), "dolphin-cuentas-"));
  const datos = join(casa, "AppData", "Dolphin");
  await writeFile(join(casa, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "nico@personal.com" } }));
  for (const [id, email] of [["a1", "nico@trabajo.com"], ["b2", "nico@personal.com"], ["c3", null]] as const) {
    const home = join(datos, "claude-profiles", id, "home");
    await mkdir(home, { recursive: true });
    if (email) await writeFile(join(home, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: email } }));
  }
  return { casa, entorno: { APPDATA: join(casa, "AppData") } };
}

afterEach(() => olvidarCuentas());

describe("las cuentas de Claude", () => {
  it("lee la de siempre y las del escritorio; sin login o repetida no cuenta", async () => {
    const { casa, entorno } = await casaDePrueba();
    const cuentas = await leerCuentasDeClaude(entorno, casa);
    expect(cuentas.map((c) => [c.id, c.email])).toEqual([
      ["normal", "nico@personal.com"],
      ["a1", "nico@trabajo.com"],
    ]);
    expect(cuentas[1]!.home).toBe(join(casa, "AppData", "Dolphin", "claude-profiles", "a1", "home"));
  });

  it("una corrida con otra cuenta lleva su carpeta y saca las claves que la pisarían", () => {
    expect(entornoDeCuenta({ id: "normal", email: null, home: null })).toEqual({});
    expect(entornoDeCuenta({ id: "a1", email: "x", home: "/h" })).toMatchObject({ CLAUDE_CONFIG_DIR: "/h", ANTHROPIC_API_KEY: undefined, CLAUDE_CODE_OAUTH_TOKEN: undefined });
  });

  it("reconoce el límite de uso y no confunde otro error", () => {
    expect(esLimiteDeUso("Claude AI usage limit reached|1761580800")).toBe(true);
    expect(esLimiteDeUso("You've hit your limit · resets 3pm")).toBe(true);
    expect(esLimiteDeUso("5-hour limit reached ∙ resets 9pm")).toBe(true);
    expect(esLimiteDeUso("Error: ENOENT no such file")).toBe(false);
  });

  it("si una cuenta se queda sin cupo, la misma corrida sigue con la otra y avisa", async () => {
    const { casa, entorno } = await casaDePrueba();
    await cuentasDeClaude(true, entorno, casa);
    const cambios: string[] = [];
    alCambiarDeCuenta(({ a, porLimite }) => cambios.push(`${a.id}:${porLimite}`));
    const usadas: (string | undefined)[] = [];
    const resultado = await conCuentaDeClaude(
      async (env) => {
        usadas.push(env.CLAUDE_CONFIG_DIR);
        return usadas.length === 1 ? "usage limit reached" : "listo";
      },
      (r) => esLimiteDeUso(r),
    );
    expect(resultado).toBe("listo");
    expect(usadas).toEqual([undefined, join(casa, "AppData", "Dolphin", "claude-profiles", "a1", "home")]);
    expect(cambios).toEqual(["a1:true"]);
    expect(cuentaAgotada("normal")).toBe(true);
    expect(cuentaEnUso()?.id).toBe("a1");
  });

  it("sin otra con cupo devuelve lo que contestó; elegir a mano la vuelve a habilitar", async () => {
    const { casa, entorno } = await casaDePrueba();
    await cuentasDeClaude(true, entorno, casa);
    let vueltas = 0;
    const resultado = await conCuentaDeClaude(
      async () => {
        vueltas++;
        return "usage limit reached";
      },
      (r) => esLimiteDeUso(r),
    );
    expect(resultado).toBe("usage limit reached");
    expect(vueltas).toBe(2);
    expect(elegirCuenta("normal")?.id).toBe("normal");
    expect(cuentaAgotada("normal")).toBe(false);
    expect(elegirCuenta("no-existe")).toBeNull();
  });

  it("dos corridas que agotan la misma cuenta no marcan la siguiente sin haberla usado", async () => {
    const { casa, entorno } = await casaDePrueba();
    await cuentasDeClaude(true, entorno, casa);
    const usadas: (string | undefined)[] = [];
    let llegaron = 0;
    let liberar!: () => void;
    const ambas = new Promise<void>((resolve) => (liberar = resolve));
    const correr = async (env: Record<string, string | undefined>) => {
      usadas.push(env.CLAUDE_CONFIG_DIR);
      if (env.CLAUDE_CONFIG_DIR === undefined) {
        llegaron += 1;
        if (llegaron === 2) liberar();
        await ambas;
        return "usage limit reached";
      }
      return "listo";
    };

    const resultados = await Promise.all([conCuentaDeClaude(correr, esLimiteDeUso), conCuentaDeClaude(correr, esLimiteDeUso)]);
    expect(resultados).toEqual(["listo", "listo"]);
    expect(usadas.filter((x) => x === undefined)).toHaveLength(2);
    expect(usadas.filter((x) => x === join(casa, "AppData", "Dolphin", "claude-profiles", "a1", "home"))).toHaveLength(2);
    expect(cuentaAgotada("normal")).toBe(true);
    expect(cuentaAgotada("a1")).toBe(false);
  });
});
