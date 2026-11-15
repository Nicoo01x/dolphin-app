import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { memoriasRelevantes, leerMemoria, recordar, type Recuerdo } from "./nucleo/memoria.js";
import { leerPerfil } from "./nucleo/perfil.js";
import { fasesDeUnaRama, fasesQueCuestan, probarRama } from "./nucleo/porton-de-una-rama.js";
import { HERRAMIENTAS_DEL_TABLERO, llamarHerramientaDelTablero } from "./nucleo/tablero-mcp.js";

const argumentos = parseArgs({ options: { repo: { type: "string", default: process.cwd() } }, allowPositionals: true });
const repo = resolve(argumentos.values.repo ?? process.cwd());

interface PedidoRpc {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
}

const herramientas = [
  {
    name: "memoria_buscar",
    description: "Busca recuerdos relevantes del proyecto para una consulta.",
    inputSchema: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"] },
  },
  {
    name: "memoria_listar",
    description: "Lista todos los recuerdos del proyecto, incluidas las candidatas.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memoria_proponer",
    description: "Propone una regla externa como candidata; nunca la activa directamente.",
    inputSchema: {
      type: "object",
      properties: { dicho: { type: "string" }, porQue: { type: "string" }, patron: { type: "string" }, tipo: { type: "string" } },
      required: ["dicho", "porQue"],
    },
  },
  {
    name: "perfil_leer",
    description: "Lee el perfil permanente del proyecto.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "porton_fases",
    description:
      "Las fases que una rama de este repo va a cruzar, de la más barata a la más cara, incluidas las que nacieron de correcciones anteriores. Conviene mirarlas ANTES de escribir: así se sabe contra qué se mide el trabajo.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "porton_probar",
    description:
      "Cruza una rama por el portón y devuelve el resultado fase por fase, con el motivo del rebote en voz humana. Prueba el commit de la rama en un worktree propio y descartable: no toca el árbol de trabajo. Solo corre las fases gratis, así que no gasta.",
    inputSchema: { type: "object", properties: { rama: { type: "string" } }, required: ["rama"] },
  },
  // El tablero vive aparte (nucleo/tablero-mcp.ts): son cuatro herramientas con reglas propias
  // sobre qué se le concede a un asistente, y acá adentro se perdían entre las demás.
  ...HERRAMIENTAS_DEL_TABLERO,
] as const;

async function servirMcp(ruta: string): Promise<void> {
  const entrada = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const linea of entrada) {
    const pedido = parsear(linea);
    if (!pedido || !pedido.method || pedido.method.startsWith("notifications/")) continue;
    const respuesta = await atender(pedido, ruta).catch((error: unknown) => ({
      jsonrpc: "2.0",
      id: pedido.id ?? null,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    }));
    process.stdout.write(`${JSON.stringify(respuesta)}\n`);
  }
}

function parsear(linea: string): PedidoRpc | undefined {
  try {
    const pedido = JSON.parse(linea) as PedidoRpc;
    return pedido && typeof pedido === "object" ? pedido : undefined;
  } catch {
    return undefined;
  }
}

async function atender(pedido: PedidoRpc, ruta: string): Promise<Record<string, unknown>> {
  const id = pedido.id ?? null;
  if (pedido.method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "dolphin", version: "0.1.0" } } };
  }
  if (pedido.method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (pedido.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: herramientas } };
  if (pedido.method !== "tools/call") return { jsonrpc: "2.0", id, error: { code: -32601, message: `método no soportado: ${pedido.method}` } };

  const nombre = pedido.params?.name;
  const args = pedido.params?.arguments;
  if (typeof nombre !== "string" || (args !== undefined && (typeof args !== "object" || args === null))) {
    return { jsonrpc: "2.0", id, error: { code: -32602, message: "tools/call necesita name y arguments" } };
  }
  const datos = await llamarHerramienta(nombre, (args ?? {}) as Record<string, unknown>, ruta);
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(datos) }], structuredContent: datos } };
}

async function llamarHerramienta(nombre: string, args: Record<string, unknown>, repo: string): Promise<Record<string, unknown>> {
  const delTablero = await llamarHerramientaDelTablero(nombre, args, repo);
  if (delTablero) return delTablero;
  if (nombre === "memoria_buscar") {
    const consulta = typeof args.consulta === "string" ? args.consulta.trim() : "";
    if (!consulta) throw new Error("memoria_buscar necesita consulta");
    const memoria = await leerMemoria(repo);
    return { memoriasRelevantes: memoriasRelevantes(memoria, consulta) };
  }
  if (nombre === "memoria_listar") return { recuerdos: (await leerMemoria(repo)).recuerdos };
  if (nombre === "memoria_proponer") {
    const dicho = typeof args.dicho === "string" ? args.dicho : "";
    const porQue = typeof args.porQue === "string" ? args.porQue : "";
    if (!dicho.trim() || !porQue.trim()) throw new Error("memoria_proponer necesita dicho y porQue");
    const opciones: { origen: "untrusted"; porQue: string; candidato: true; patron?: string } = {
      origen: "untrusted",
      porQue,
      candidato: true,
      ...(typeof args.patron === "string" ? { patron: args.patron } : {}),
    };
    const recuerdo = await recordar(repo, dicho, opciones.patron, tipoDe(args.tipo), opciones);
    return { recuerdo, candidata: true, activa: recuerdo.activo };
  }
  if (nombre === "perfil_leer") return { perfil: await leerPerfil(repo) };
  if (nombre === "porton_fases") return { fases: await fasesDeUnaRama(repo), queCuestanYNoCorren: await fasesQueCuestan(repo) };
  if (nombre === "porton_probar") {
    const rama = typeof args.rama === "string" ? args.rama.trim() : "";
    if (!rama) throw new Error("porton_probar necesita rama");
    return { ...(await probarRama(repo, rama)) };
  }
  throw new Error(`herramienta desconocida: ${nombre}`);
}

function tipoDe(valor: unknown): Recuerdo["tipo"] | undefined {
  return valor === "regla" || valor === "error" || valor === "decision" || valor === "nota" ? valor : undefined;
}

if (argumentos.positionals[0] === "instalar") {
  console.log(`claude mcp add dolphin -- dolphin mcp --repo ${repo}`);
} else {
  await servirMcp(repo);
}

