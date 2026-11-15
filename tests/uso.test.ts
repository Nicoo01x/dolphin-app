import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { otroEscalon } from "../src/nucleo/router.js";
import type { Universo } from "../src/nucleo/tipos.js";
import { archivosDelDiff, decidirUso, verificadorDeUso } from "../src/tester/uso.js";
import { entornoDeUso, problemasDeConfigDeUso, reemplazar, type ConfigDeUso } from "../src/tester/uso-config.js";
import type { AppDeUso, Lanzar } from "../src/tester/uso-lanzar.js";
import { paginasPorCdp } from "../src/tester/uso-lanzar.js";
import {
  argumentosDeUso,
  configDelMcp,
  HERRAMIENTAS_DE_NAVEGADOR,
  leerInforme,
  pedidoAlModelo,
  resolverMcpDeNavegador,
  type CorrerUso,
  type InformeDeUso,
  type PedidoDeUso,
} from "../src/tester/uso-modelo.js";

/**
 * La fase `uso`: un modelo usa la app de la rama y cuenta qué vio. Acá no se
 * lanza ningún Electron ni se llama a ningún modelo: el lanzador y el modelo
 * son de mentira, y lo que se prueba es lo que decide el código y la correa.
 */

const correrGit = promisify(execFile);

const config: ConfigDeUso = {
  levantar: "pnpm dev",
  cwd: "escritorio",
  tipo: "electron",
  entorno: { DOLPHIN_DEV_USER_DATA_PATH: "{perfil}", REMOTE_DEBUGGING_PORT: "{puerto}" },
};

const informe = (cambios: Partial<InformeDeUso> = {}): InformeDeUso => ({
  lo_que_hice: ["abrí el chat", "pedí una imagen"],
  lo_que_vi: ["la imagen se ve en el chat"],
  funciona: "si",
  problemas: [],
  ...cambios,
});

describe("lo que decide el código", () => {
  it("«si» pasa, con lo que vio", () => {
    expect(decidirUso(informe(), "haiku")).toMatchObject({ paso: true });
    expect(decidirUso(informe(), "haiku").salteada).toBeUndefined();
  });

  it("«no» con un problema con evidencia corta, y el detalle es ese problema", () => {
    const r = decidirUso(
      informe({
        funciona: "no",
        problemas: [
          { que: "las imágenes no cargan", donde: "el chat", evidencia: "GET /img/1.png → 404" },
          { que: "otro", donde: "", evidencia: "la consola dice X" },
        ],
      }),
      "haiku",
    );
    expect(r.paso).toBe(false);
    expect(r.salteada).toBeUndefined();
    expect(r.detalle).toContain("las imágenes no cargan");
    expect(r.detalle).toContain("el chat");
    expect(r.detalle).toContain("GET /img/1.png → 404");
    expect(r.detalle).not.toContain("otro");
  });

  it("«no» sin evidencia no corta una rama: se saltea", () => {
    const r = decidirUso(informe({ funciona: "no", problemas: [{ que: "no me gustó", donde: "", evidencia: "" }] }), "haiku");
    expect(r).toMatchObject({ paso: true, salteada: true });
  });

  it("«no_pude_comprobarlo» se saltea con el motivo, no corta", () => {
    const r = decidirUso(informe({ funciona: "no_pude_comprobarlo", lo_que_vi: [] }), "haiku");
    expect(r).toMatchObject({ paso: true, salteada: true });
    expect(r.detalle).toContain("no pudo comprobarlo");
  });

  it("un «si» sin una sola cosa vista no prueba nada", () => {
    expect(decidirUso(informe({ lo_que_vi: [] }), "haiku")).toMatchObject({ paso: true, salteada: true });
  });
});

describe("el informe del modelo", () => {
  it("se lee aunque venga envuelto, y normaliza «sí»", () => {
    const texto = 'Listo:\n```json\n{"lo_que_hice":["a"],"lo_que_vi":["b"],"funciona":"sí","problemas":[{"que":"x","donde":"y","evidencia":"z"},{"donde":"sin que"}]}\n```';
    expect(leerInforme(texto)).toEqual({ lo_que_hice: ["a"], lo_que_vi: ["b"], funciona: "si", problemas: [{ que: "x", donde: "y", evidencia: "z" }] });
  });

  it("sin JSON o con un «funciona» que no existe, no hay informe", () => {
    expect(leerInforme("Anda perfecto")).toBeUndefined();
    expect(leerInforme('{"funciona":"quizás","lo_que_vi":[]}')).toBeUndefined();
  });

  it("el encargo lleva la tarea y los archivos, no el código, y pide mirar la consola y la red", () => {
    const pedido = pedidoAlModelo("Sumá imágenes al chat", ["escritorio/src/chat.tsx"]);
    expect(pedido).toContain("Sumá imágenes al chat");
    expect(pedido).toContain("- escritorio/src/chat.tsx");
    expect(pedido).toContain("browser_console_messages");
    expect(pedido).toContain("404");
    expect(pedido).toContain("no_pude_comprobarlo");
  });

  it("los archivos salen de las cabeceras del diff", () => {
    expect(archivosDelDiff("diff --git a/a.ts b/a.ts\n+x\ndiff --git a/dir/b.ts b/dir/b.ts\n")).toEqual(["a.ts", "dir/b.ts"]);
  });
});

describe("el entorno de la app", () => {
  it("reemplaza {perfil} y {puerto} (también {PUERTO}) solo donde la persona los puso", () => {
    const valores = { perfil: "C:\\tmp\\perfil-1", puerto: 9333 };
    expect(entornoDeUso(config, valores)).toEqual({ DOLPHIN_DEV_USER_DATA_PATH: "C:\\tmp\\perfil-1", REMOTE_DEBUGGING_PORT: "9333" });
    expect(reemplazar("http://localhost:{PUERTO}/{perfil}", valores)).toBe("http://localhost:9333/C:\\tmp\\perfil-1");
    expect(entornoDeUso({}, valores)).toEqual({});
  });

  it("una config a medias se dice por qué: electron sin {puerto}, web sin url, cwd afuera del universo", () => {
    expect(problemasDeConfigDeUso(config)).toEqual([]);
    expect(problemasDeConfigDeUso({ levantar: "x", tipo: "electron" }).join(" ")).toContain("{puerto}");
    expect(problemasDeConfigDeUso({ levantar: "x", tipo: "web" }).join(" ")).toContain("uso.url");
    expect(problemasDeConfigDeUso({ levantar: "x", tipo: "web", url: "http://localhost:{puerto}" })).toEqual([]);
    expect(problemasDeConfigDeUso({ ...config, cwd: "../afuera" }).join(" ")).toContain("DENTRO del universo");
    expect(problemasDeConfigDeUso({ tipo: "otro" }).length).toBe(2);
    expect(problemasDeConfigDeUso("hola")).toEqual(["«uso» tiene que ser un objeto"]);
  });
});

describe("cómo se invoca al modelo", () => {
  it("el navegador es la única herramienta de acción: sin escribir, sin shell, sin navegar", () => {
    const args = argumentosDeUso("haiku", 40, "C:\\tmp\\mcp.json");
    const linea = args.join(" ");
    expect(linea).toContain("--model haiku");
    expect(linea).toContain("--max-turns 40");
    expect(linea).toContain("--setting-sources user --strict-mcp-config");
    expect(linea).toContain("--permission-mode dontAsk");
    expect(args[args.indexOf("--mcp-config") + 1]).toBe("C:\\tmp\\mcp.json");
    // --tools va último y es solo leer.
    expect(args.slice(-2)).toEqual(["--tools", "Read"]);
    const permitidas = args[args.indexOf("--allowedTools") + 1]!.split(",");
    expect(permitidas).toEqual(expect.arrayContaining(["Read", "mcp__navegador__browser_snapshot", "mcp__navegador__browser_click", "mcp__navegador__browser_console_messages", "mcp__navegador__browser_network_requests"]));
    for (const prohibida of ["Bash", "Edit", "Write", "PowerShell", "mcp__navegador__browser_navigate", "mcp__navegador__browser_evaluate", "mcp__navegador__browser_run_code_unsafe", "mcp__navegador__browser_file_upload"]) {
      expect(permitidas).not.toContain(prohibida);
    }
    expect(HERRAMIENTAS_DE_NAVEGADOR.every((h) => h.startsWith("mcp__navegador__browser_"))).toBe(true);
  });

  it("el MCP se pega al puerto de depuración de esa app y guarda las capturas donde se le dice", () => {
    const c = configDelMcp({ comando: "node", args: ["cli.js"] }, "http://127.0.0.1:9333", "C:\\tmp\\capturas");
    expect(c).toEqual({ mcpServers: { navegador: { command: "node", args: ["cli.js", "--cdp-endpoint", "http://127.0.0.1:9333", "--output-dir", "C:\\tmp\\capturas"] } } });
  });

  it("encuentra @playwright/mcp en los node_modules de acá para arriba, y sin él dice que no está", async () => {
    const raiz = await mkdtemp(join(tmpdir(), "dolphin-mcp-"));
    try {
      const hondo = join(raiz, "a", "b");
      await mkdir(hondo, { recursive: true });
      expect(resolverMcpDeNavegador(hondo)).toBeUndefined();
      const paquete = join(raiz, "node_modules", "@playwright", "mcp");
      await mkdir(paquete, { recursive: true });
      await writeFile(join(paquete, "package.json"), JSON.stringify({ bin: { "playwright-mcp": "cli.js" } }));
      await writeFile(join(paquete, "cli.js"), "");
      expect(resolverMcpDeNavegador(hondo)).toEqual({ comando: process.execPath, args: [join(paquete, "cli.js")] });
    } finally {
      await borrarCarpeta(raiz).catch(() => {});
    }
  });
});

describe("el puerto de depuración", () => {
  let servidor: Server | undefined;
  afterEach(() => new Promise<void>((listo) => (servidor ? servidor.close(() => listo()) : listo())));

  it("cuenta las páginas de verdad, no las herramientas de desarrollo; sin nadie escuchando son cero", async () => {
    servidor = createServer((_q, r) => {
      r.writeHead(200, { "content-type": "application/json" });
      r.end(JSON.stringify([{ type: "page", url: "devtools://x" }, { type: "background_page", url: "chrome-extension://x" }, { type: "page", url: "file:///app/index.html" }]));
    });
    const puerto = await new Promise<number>((listo) => servidor!.listen(0, "127.0.0.1", () => listo((servidor!.address() as { port: number }).port)));
    expect(await paginasPorCdp(puerto)).toBe(1);
    await new Promise<void>((listo) => servidor!.close(() => listo()));
    servidor = undefined;
    expect(await paginasPorCdp(puerto)).toBe(0);
  });
});

describe("la fase, con un lanzador y un modelo de mentira", () => {
  let repo = "";
  let registro = "";
  let universo: Universo;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-uso-test-"));
    registro = join(repo, ".dolphin", "uso");
    await writeFile(join(repo, "chat.ts"), "export const a = 1;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correrGit("git", args, { cwd: repo, windowsHide: true });
    }
    // Lo que hizo la rama: sin commitear alcanza para que el diff lo vea.
    await writeFile(join(repo, "chat.ts"), "export const a = 2;\n");
    universo = { id: "u1", rama: "dolphin/u1", ruta: repo, nacido: Date.now() };
  });

  afterEach(async () => {
    await borrarCarpeta(repo).catch(() => {});
  });

  /** Un lanzador que cuenta, y recuerda el perfil que le dieron para ver después si se borró. */
  function lanzadorDeMentira(resultado: "andando" | "no-levanta" | "explota" = "andando") {
    const visto = { lanzadas: 0, detenidas: 0, perfil: "" };
    const lanzar: Lanzar = async ({ perfil }) => {
      visto.lanzadas += 1;
      visto.perfil = perfil;
      if (resultado === "no-levanta") return "la app se cerró antes de abrir su ventana (código 1)";
      if (resultado === "explota") throw new Error("spawn EPERM");
      const app: AppDeUso = {
        cdp: "http://127.0.0.1:9333",
        salida: () => "log de la app",
        detener: async () => {
          visto.detenidas += 1;
        },
      };
      return app;
    };
    return { lanzar, visto };
  }

  const modeloQueDice = (informeDelModelo: unknown, pedidos: PedidoDeUso[] = []): CorrerUso => async (pedido) => {
    pedidos.push(pedido);
    // Lo que el MCP deja en la carpeta de capturas: tiene que quedar en la evidencia.
    await writeFile(join(pedido.trabajo, "capturas", "page-1.png"), "png");
    return { texto: typeof informeDelModelo === "string" ? informeDelModelo : JSON.stringify(informeDelModelo), gastado: 0.02 };
  };

  const opciones = (extra: object) => ({ tarea: "Sumá imágenes al chat", modelo: "haiku", carpeta: registro, ...extra });

  it("un «si» pasa, gasta lo que costó el modelo y deja el informe y las capturas", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    const pedidos: PedidoDeUso[] = [];
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe(), pedidos) })).correr(universo);

    expect(r).toMatchObject({ paso: true, gastado: 0.02 });
    expect(r.salteada).toBeUndefined();
    expect(pedidos[0]!.cdp).toBe("http://127.0.0.1:9333");
    expect(pedidos[0]!.prompt).toContain("- chat.ts");
    const carpetas = await readdir(registro);
    expect(carpetas).toHaveLength(1);
    expect(carpetas[0]).toMatch(/-u1$/);
    expect((await readdir(join(registro, carpetas[0]!))).sort()).toEqual(["informe.json", "page-1.png"]);
    expect(JSON.parse(await readFile(join(registro, carpetas[0]!, "informe.json"), "utf8"))).toMatchObject({ modelo: "haiku", informe: { funciona: "si" } });
    expect(visto).toMatchObject({ lanzadas: 1, detenidas: 1 });
  });

  it("un «no» con evidencia corta la rama con el primer problema", async () => {
    const { lanzar } = lanzadorDeMentira();
    const modelo = modeloQueDice(informe({ funciona: "no", problemas: [{ que: "todas las imágenes dan 404", donde: "el chat", evidencia: "GET /media/1.png 404" }] }));
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: modelo })).correr(universo);
    expect(r.paso).toBe(false);
    expect(r.detalle).toContain("todas las imágenes dan 404");
    expect(r.detalle).toContain("GET /media/1.png 404");
  });

  it("«no_pude_comprobarlo» deja la fase salteada, no corta", async () => {
    const { lanzar } = lanzadorDeMentira();
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe({ funciona: "no_pude_comprobarlo" })) })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true });
  });

  it("un JSON inválido deja la fase salteada, con lo que contestó, y igual cobra lo gastado", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice("Mmm, creo que anda.") })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true, gastado: 0.02 });
    expect(r.evidencia).toContain("Mmm, creo que anda");
    expect(visto.detenidas).toBe(1);
  });

  it("la correa corre aunque el modelo tire: se mata la app y se borra el perfil", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    const tira: CorrerUso = async ({ trabajo }) => {
      await writeFile(join(visto.perfil, "Cookies"), "algo");
      await writeFile(join(trabajo, "mcp.json"), "{}");
      throw new Error("el CLI se cayó");
    };
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: tira })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true });
    expect(r.evidencia).toContain("el CLI se cayó");
    expect(visto.detenidas).toBe(1);
    await expect(access(visto.perfil)).rejects.toThrow();
  });

  it("la correa corre también cuando todo sale bien", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe()) })).correr(universo);
    expect(visto.detenidas).toBe(1);
    await expect(access(visto.perfil)).rejects.toThrow();
  });

  it("una app que no levanta, o un lanzador que explota, deja la fase salteada y el modelo ni se llama", async () => {
    for (const resultado of ["no-levanta", "explota"] as const) {
      const { lanzar, visto } = lanzadorDeMentira(resultado);
      const pedidos: PedidoDeUso[] = [];
      const r = await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe(), pedidos) })).correr(universo);
      expect(r).toMatchObject({ paso: true, salteada: true, gastado: 0 });
      expect(pedidos).toHaveLength(0);
      await expect(access(visto.perfil)).rejects.toThrow();
    }
  });

  it("si falta el navegador MCP la fase se saltea con el motivo y no lanza nada", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    const r = await verificadorDeUso(config, opciones({ lanzar, disponible: () => "falta @playwright/mcp, el navegador que maneja el modelo" })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true });
    expect(r.evidencia).toContain("@playwright/mcp");
    expect(visto.lanzadas).toBe(0);
  });

  it("una config a medias se saltea sin lanzar nada", async () => {
    const { lanzar, visto } = lanzadorDeMentira();
    const r = await verificadorDeUso({ levantar: "pnpm dev", tipo: "electron" }, opciones({ lanzar, correr: modeloQueDice(informe()) })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true });
    expect(r.evidencia).toContain("{puerto}");
    expect(visto.lanzadas).toBe(0);
  });

  it("el modelo que usa la app nunca es el que escribió la rama", async () => {
    const { lanzar } = lanzadorDeMentira();
    const pedidos: PedidoDeUso[] = [];
    const verificador = verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe(), pedidos) }));
    await verificador.correr(universo, { modelo: "haiku" });
    await verificador.correr(universo, { modelo: "sonnet" });
    expect(pedidos[0]!.modelo).toBe(otroEscalon("haiku"));
    expect(pedidos[0]!.modelo).not.toBe("haiku");
    expect(pedidos[1]!.modelo).toBe("haiku");
  });

  it("una rama sin cambios no tiene qué usar: se saltea", async () => {
    await correrGit("git", ["checkout", "--", "chat.ts"], { cwd: repo, windowsHide: true });
    const { lanzar, visto } = lanzadorDeMentira();
    const r = await verificadorDeUso(config, opciones({ lanzar, correr: modeloQueDice(informe()) })).correr(universo);
    expect(r).toMatchObject({ paso: true, salteada: true });
    expect(visto.lanzadas).toBe(0);
  });
});
