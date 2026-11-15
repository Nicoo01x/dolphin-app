import { describe, expect, it } from "vitest";
import {
  argumentosDelAgente,
  argumentosDelRelevo,
  comandoDelLanzador,
  correrCajaFiltrada,
  planDe64,
  RED_CON_SALIDA,
  RED_SIN_SALIDA,
  type PlanDeCaja,
} from "../src/nucleo/caja-filtrada.js";
import type { ProxySalida } from "../src/nucleo/proxy-salida.js";

/**
 * La caja con red filtrada, sin Docker de verdad: qué argumentos se arman, en qué orden se levanta
 * todo y que al final se desarma aunque el agente falle.
 */

const plan: PlanDeCaja = {
  caja: "docker",
  imagen: "dolphin-claude",
  worktree: "D:/tmp/dolphin-x/u1",
  cmd: "claude",
  args: ["-p", "hola"],
  claves: ["ANTHROPIC_API_KEY", "LANG"],
  fijas: { HOME: "/trabajo", PATH: "/usr/bin:/bin" },
  permitidos: ["api.anthropic.com"],
  log: "/tmp/salida.log",
};

describe("los argumentos", () => {
  it("el agente va a la red interna, con el proxy por el relevo y sin valores secretos en la línea", () => {
    const args = argumentosDelAgente(plan, "dolphin-salida-abc", "t0k");
    expect(args.slice(0, 5)).toEqual(["run", "--rm", "-i", "--network", RED_SIN_SALIDA]);
    expect(args).toContain("HTTPS_PROXY=http://dolphin:t0k@dolphin-salida-abc:3128");
    expect(args).toContain("http_proxy=http://dolphin:t0k@dolphin-salida-abc:3128");
    // La credencial del motor va por nombre: el valor viaja en el entorno, no en `ps`.
    expect(args).toContain("ANTHROPIC_API_KEY");
    expect(args.some((a) => a.startsWith("ANTHROPIC_API_KEY="))).toBe(false);
    expect(args).toContain("PATH=/usr/bin:/bin");
    expect(args).toContain("ALL");
    expect(args).toContain("D:/tmp/dolphin-x/u1:/trabajo");
    expect(args.slice(-3)).toEqual(["claude", "-p", "hola"]);
  });

  it("el relevo va al bridge, llega al host y corre solo el reenvío", () => {
    const args = argumentosDelRelevo(plan, "dolphin-salida-abc", 40123);
    expect(args.slice(0, 5)).toEqual(["run", "-d", "--rm", "--name", "dolphin-salida-abc"]);
    expect(args).toContain("host.docker.internal:host-gateway");
    expect(args.slice(args.indexOf("--entrypoint"), args.indexOf("--entrypoint") + 3)).toEqual(["--entrypoint", "node", "dolphin-claude"]);
    expect(args.slice(-2)).toEqual(["40123", "host.docker.internal"]);
    const conPodman = argumentosDelRelevo({ ...plan, caja: "podman" }, "r", 1);
    expect(conPodman).not.toContain("--add-host");
    expect(conPodman.at(-1)).toBe("host.containers.internal");
  });

  it("el lanzador lleva el plan entero en un argumento sin comillas ni espacios", () => {
    const { args } = comandoDelLanzador(plan);
    const ultimo = args.at(-1)!;
    expect(ultimo).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(planDe64(ultimo)).toEqual(plan);
    expect(args.at(-2)).toMatch(/caja-filtrada\.(ts|js)$/);
  });
});

describe("armar, correr y desarmar", () => {
  const proxyFalso = () => {
    const estado = { cerrado: false, direcciones: [] as string[] };
    const abrir = async (_o: unknown, direccion = "127.0.0.1"): Promise<ProxySalida> => {
      if (direccion === "172.17.0.1") throw new Error("EADDRNOTAVAIL");
      estado.direcciones.push(direccion);
      return { direccion, puerto: 40123, cerrar: async () => void (estado.cerrado = true) };
    };
    return { estado, abrir };
  };

  it("red, relevo conectado a la red interna, agente; y al final se borra el relevo y se cierra el proxy", async () => {
    const llamadas: string[][] = [];
    const { estado, abrir } = proxyFalso();
    const codigo = await correrCajaFiltrada(plan, {
      caja: async (args) => {
        llamadas.push([...args]);
        if (args[0] === "network" && args[1] === "inspect" && args[2] === RED_SIN_SALIDA) throw new Error("no existe");
        if (args[0] === "network" && args[1] === "inspect") return "172.17.0.1\n";
        if (args[0] === "logs") return "escuchando\n";
        return "";
      },
      agente: async (cmd, args) => {
        llamadas.push([cmd, ...args]);
        return 7;
      },
      abrirProxy: abrir,
      esperar: async () => undefined,
    });
    expect(codigo).toBe(7);
    // En Docker Desktop la puerta del bridge no es de esta máquina: escucha en el localhost.
    expect(estado.direcciones).toEqual(["127.0.0.1"]);
    const orden = llamadas.map((l) => l.slice(0, 3).join(" "));
    expect(orden).toContain(`network create --internal`);
    const relevo = llamadas.find((l) => l[0] === "run" && l[1] === "-d")!;
    expect(relevo).toContain("40123");
    const nombre = relevo[relevo.indexOf("--name") + 1]!;
    expect(llamadas).toContainEqual(["network", "connect", RED_SIN_SALIDA, nombre]);
    expect(orden.indexOf("network connect " + RED_SIN_SALIDA)).toBeLessThan(orden.findIndex((o) => o.startsWith("docker run --rm")));
    expect(llamadas.at(-1)).toEqual(["rm", "-f", nombre]);
    expect(estado.cerrado).toBe(true);
  });

  it("una red con el mismo nombre que no es interna no se usa: el agente no corre", async () => {
    const { estado, abrir } = proxyFalso();
    let corrio = false;
    const llamadas: string[][] = [];
    await expect(
      correrCajaFiltrada(plan, {
        caja: async (args) => {
          llamadas.push([...args]);
          if (args[0] === "network" && args[1] === "inspect" && args[2] === RED_SIN_SALIDA) return "false\n";
          return "";
        },
        agente: async () => {
          corrio = true;
          return 0;
        },
        abrirProxy: abrir,
        esperar: async () => undefined,
      }),
    ).rejects.toThrow(RED_CON_SALIDA);
    expect(corrio).toBe(false);
    expect(llamadas.some((l) => l[0] === "run")).toBe(false);
    expect(estado.cerrado).toBe(true);
  });

  it("si otro agente la creó a la vez, se acepta la suya si es interna", async () => {
    const { abrir } = proxyFalso();
    let inspecciones = 0;
    const codigo = await correrCajaFiltrada(plan, {
      caja: async (args) => {
        if (args[0] === "network" && args[1] === "inspect" && args[2] === RED_SIN_SALIDA) {
          if (inspecciones++ === 0) throw new Error("no existe");
          return "true\n";
        }
        if (args[0] === "network" && args[1] === "create") throw new Error("network with name dolphin-sin-salida already exists");
        if (args[0] === "logs") return "escuchando\n";
        return "";
      },
      agente: async () => 0,
      abrirProxy: abrir,
      esperar: async () => undefined,
    });
    expect(codigo).toBe(0);
  });

  it("si el relevo no arranca, el agente no corre sin filtro y igual se desarma todo", async () => {
    const { estado, abrir } = proxyFalso();
    let corrio = false;
    const llamadas: string[][] = [];
    await expect(
      correrCajaFiltrada(plan, {
        caja: async (args) => {
          llamadas.push([...args]);
          if (args[0] === "run") throw new Error("la imagen no tiene node");
          return "";
        },
        agente: async () => {
          corrio = true;
          return 0;
        },
        abrirProxy: abrir,
        esperar: async () => undefined,
      }),
    ).rejects.toThrow("la imagen no tiene node");
    expect(corrio).toBe(false);
    expect(llamadas.at(-1)?.slice(0, 2)).toEqual(["rm", "-f"]);
    expect(estado.cerrado).toBe(true);
  });
});
