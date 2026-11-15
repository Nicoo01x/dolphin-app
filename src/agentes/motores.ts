import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anotarAgregados } from "../nucleo/cambios.js";
import { objetosJson } from "../nucleo/json.js";
import { armarPrompt, leerContrato, pedidoDeCorreccion } from "./claude.js";
import { correrConPrompt, noPasaTalCual, prepararComando } from "./ejecutar.js";
import { medirForma } from "../nucleo/forma.js";
import { FalloDelAgente } from "../nucleo/tipos.js";
import type { Agente, Tokens, Trabajo, Universo } from "../nucleo/tipos.js";

/**
 * Los motores de CLI, declarados en una tabla.
 *
 * Claude, Codex y Antigravity tienen su propio módulo porque de ellos se lee
 * el costo, los tokens y los eventos de cada turno. Los demás agentes de
 * terminal se parecen mucho entre sí: un comando, el pedido, y que editen los
 * archivos de la carpeta donde corren. Para esos, una fila alcanza, y sumar el
 * próximo es una fila más y no un módulo más.
 *
 * Ninguno de estos informa plata, así que el costo queda desconocido —un cero
 * haría pasar por gratis lo que no se midió— y el portón los mide igual que a
 * los caros: por lo que escribieron.
 *
 * **Hasta dónde se probó cada uno** está en `probado`, y se puede ver con
 * `dolphin motores`. Es un dato honesto y no un detalle: las banderas de estos
 * CLI cambian seguido, y es mejor decir «esta la leí en la documentación pero
 * no la corrí» que hacer como que todas valen lo mismo.
 */

export type ComoLlegaElPedido = "argumento" | "entrada";

/** Hasta dónde se verificó la fila. */
export type Probado =
  /** Corrido en una máquina nuestra. */
  | "acá"
  /** Las banderas salen de la documentación oficial del CLI, sin correrlo. */
  | "documentación"
  /** Ni una ni la otra: si lo usás y hay que ajustarlo, se agradece el aviso. */
  | "no";

export interface ContextoDeArgumentos {
  /** El pedido, o el aviso de dónde leerlo. Vacío cuando va por la entrada estándar. */
  readonly prompt: string;
  readonly ruta: string;
  readonly modelo?: string;
  /** Permisos «todo»: sin preguntar nada. Siempre dentro de un worktree. */
  readonly todo: boolean;
}

export interface DefinicionDeMotor {
  /** Lo que se escribe en `--agente`. */
  readonly nombre: string;
  /** El binario que se busca en el PATH. */
  readonly cmd: string;
  /** Una línea para `dolphin motores`. */
  readonly queEs: string;
  readonly pedido: ComoLlegaElPedido;
  readonly probado: Probado;
  args(ctx: ContextoDeArgumentos): string[];
  /**
   * Dónde está lo que contestó el agente. Por defecto, la salida cruda: sirve
   * para leer el contrato de superficie, que es opcional, así que si el formato
   * cambia no se rompe nada —se pierde el contrato, no el trabajo.
   */
  respuesta?(crudo: string): string;
  tokens?(crudo: string): Tokens | undefined;
  /** Si la corrida falló, el motivo en una línea. */
  falla?(crudo: string, codigo: number | null): string | undefined;
}

/** El campo de texto de una salida JSON, si se puede leer. */
function campoDeJson(crudo: string, ...claves: readonly string[]): string {
  for (const objeto of objetosJson(crudo)) {
    if (typeof objeto !== "object" || objeto === null) continue;
    for (const clave of claves) {
      const valor = (objeto as Record<string, unknown>)[clave];
      if (typeof valor === "string" && valor.trim() !== "") return valor;
    }
  }
  return crudo;
}

/**
 * El motivo de una falla, leído del JSON que estos CLI escriben.
 *
 * Importa más de lo que parece: `gemini` sin clave contesta
 * `{"error":{"message":"you must specify the GEMINI_API_KEY","code":41}}`, y
 * quedarse con la última línea de la salida dejaba el mensaje en «salió con
 * 41: }». Lo que la persona necesita leer es qué le falta configurar.
 */
export function fallaDeJson(crudo: string): string | undefined {
  for (const objeto of objetosJson(crudo)) {
    if (typeof objeto !== "object" || objeto === null) continue;
    const error = (objeto as Record<string, unknown>)["error"];
    if (typeof error === "string" && error.trim() !== "") return error.trim().slice(0, 200);
    if (typeof error === "object" && error !== null) {
      const mensaje = (error as Record<string, unknown>)["message"];
      if (typeof mensaje === "string" && mensaje.trim() !== "") return mensaje.trim().slice(0, 200);
    }
  }
  return undefined;
}

export const MOTORES_DE_CLI: readonly DefinicionDeMotor[] = [
  {
    nombre: "gemini",
    cmd: "gemini",
    queEs: "Gemini CLI, de Google",
    pedido: "argumento",
    probado: "acá",
    // `gemini --help` en esta máquina: -p es el modo headless, -o json la salida,
    // y --approval-mode auto_edit acepta las ediciones sin preguntar.
    //
    // **--skip-trust es obligatorio**: medido acá, en una carpeta que no está en
    // su lista de confiadas gemini avisa «Approval mode overridden to default
    // because the current folder is not trusted» y vuelve a pedir permiso por
    // cada edición. Un worktree recién abierto nunca va a estar confiado, así
    // que sin esto el motor no escribe una línea en ninguna rama.
    args: ({ prompt, modelo, todo }) => [
      "-o",
      "json",
      "--skip-trust",
      "--approval-mode",
      todo ? "yolo" : "auto_edit",
      ...(modelo ? ["-m", modelo] : []),
      "-p",
      prompt,
    ],
    respuesta: (crudo) => campoDeJson(crudo, "response"),
    falla: (crudo) => fallaDeJson(crudo),
  },
  {
    nombre: "opencode",
    cmd: "opencode",
    queEs: "OpenCode, el agente de terminal open source",
    pedido: "argumento",
    probado: "acá",
    // `opencode run --help` en esta máquina: el mensaje es posicional, --dir elige
    // la carpeta y --format json saca los eventos crudos.
    args: ({ prompt, ruta, modelo }) => [
      "run",
      "--format",
      "json",
      "--dir",
      ruta,
      ...(modelo ? ["-m", modelo] : []),
      prompt,
    ],
  },
  {
    nombre: "copilot",
    cmd: "copilot",
    queEs: "GitHub Copilot CLI",
    pedido: "argumento",
    probado: "documentación",
    // docs.github.com/copilot/reference/copilot-cli-reference/cli-programmatic-reference:
    // -p corre un pedido y sale; --allow-all-tools no pregunta por cada herramienta.
    // Sin eso, un modo no interactivo se queda esperando un permiso que nadie va a dar.
    args: ({ prompt }) => ["-p", prompt, "--allow-all-tools"],
  },
  {
    nombre: "cursor",
    cmd: "cursor-agent",
    queEs: "Cursor CLI (cursor-agent)",
    pedido: "argumento",
    probado: "documentación",
    // cursor.com/docs/cli: -p es el modo no interactivo y --output-format json
    // solo vale con -p. **--force es obligatorio**: sin él, -p propone los cambios
    // y no escribe nada, y una rama sin un archivo tocado no es una rama.
    args: ({ prompt, modelo }) => [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--force",
      ...(modelo ? ["--model", modelo] : []),
    ],
    respuesta: (crudo) => campoDeJson(crudo, "result", "response"),
    falla: (crudo) => fallaDeJson(crudo),
  },
  {
    nombre: "droid",
    cmd: "droid",
    queEs: "Droid, de Factory",
    pedido: "argumento",
    probado: "documentación",
    // docs.factory.ai/droid-exec/overview: `droid exec` es la corrida de una sola
    // vez. **--auto es obligatorio**: sin él la corrida es de solo lectura y no
    // escribe una línea.
    args: ({ prompt, todo }) => ["exec", "-o", "json", "--auto", todo ? "high" : "medium", prompt],
    respuesta: (crudo) => campoDeJson(crudo, "result", "response", "output"),
    falla: (crudo) => fallaDeJson(crudo),
  },
  {
    nombre: "amp",
    cmd: "amp",
    queEs: "Amp, de Sourcegraph",
    pedido: "entrada",
    probado: "no",
    // El pedido por la entrada estándar, que es lo que menos supone: no pude
    // verificar las banderas de amp ni correrlo. Si lo usás y hay que ajustarlo,
    // es una fila de esta tabla.
    args: () => ["-x"],
  },
  {
    nombre: "qwen",
    cmd: "qwen",
    queEs: "Qwen Code",
    pedido: "argumento",
    probado: "no",
    // Qwen Code es un fork de Gemini CLI, así que se le pasan las banderas de
    // Gemini; no pude verificarlo corriéndolo.
    args: ({ prompt, modelo, todo }) => [
      "--skip-trust",
      ...(todo ? ["-y"] : []),
      ...(modelo ? ["-m", modelo] : []),
      "-p",
      prompt,
    ],
    falla: (crudo) => fallaDeJson(crudo),
  },
];

export function motorDeCli(nombre: string): DefinicionDeMotor | undefined {
  return MOTORES_DE_CLI.find((m) => m.nombre === nombre);
}

export interface OpcionesDeMotorDeCli {
  readonly modelo?: string;
  readonly contexto?: string;
  readonly permisos?: "editar" | "todo";
  readonly tope?: number;
  /** Otro binario, si el CLI no se llama como dice la tabla o no está en el PATH. */
  readonly cmd?: string;
}

/** El pedido no entra en una línea de comandos, o el shell no lo deja pasar tal cual. */
function vaPorArchivo(cmd: string, prompt: string): boolean {
  return prompt.length > 6000 || noPasaTalCual(cmd, prompt);
}

const AVISO_DEL_ARCHIVO =
  "El pedido completo está en el archivo .dolphin-pedido.md de esta carpeta: leelo entero y hacé lo que dice.";

export function agenteDeCli(def: DefinicionDeMotor, opciones: OpcionesDeMotorDeCli = {}): Agente {
  const cmd = opciones.cmd ?? def.cmd;

  const correr = async (prompt: string, universo: Universo, modeloDelEnfoque?: string, senal?: AbortSignal) => {
    const modelo = modeloDelEnfoque ?? opciones.modelo;
    const porEntrada = def.pedido === "entrada";
    // Un pedido largo va a un archivo del worktree que el agente lee. Anotado
    // como agregado: no entra al diff ni al commit (ver cambios.ts).
    const porArchivo = !porEntrada && vaPorArchivo(cmd, prompt);
    const archivo = join(universo.ruta, ".dolphin-pedido.md");
    if (porArchivo) {
      await writeFile(archivo, prompt, "utf8");
      await anotarAgregados(universo.ruta, [".dolphin-pedido.md"]).catch(() => {});
    }

    const listo = prepararComando(
      cmd,
      def.args({
        prompt: porEntrada ? "" : porArchivo ? AVISO_DEL_ARCHIVO : prompt,
        ruta: universo.ruta,
        ...(modelo ? { modelo } : {}),
        todo: opciones.permisos === "todo",
      }),
    );
    if (!listo) throw new Error(`no encontré «${cmd}» en el PATH: instalá ${def.queEs} o sumá su carpeta al PATH`);

    const { salida, codigo } = await correrConPrompt(
      listo.cmd,
      listo.args,
      porEntrada ? prompt : "",
      universo.ruta,
      opciones.tope ?? 600_000,
      universo.entorno,
      listo.verbatim,
      undefined,
      senal,
    ).finally(() => (porArchivo ? rm(archivo, { force: true }).catch(() => {}) : undefined));

    const falla = def.falla?.(salida, codigo) ?? fallaPorCodigo(def, salida, codigo);
    // Pudo haber trabajado antes de fallar, y ninguno de estos dice cuánto costó.
    if (falla) throw new FalloDelAgente(falla, 0, true);

    return {
      respuesta: def.respuesta?.(salida) ?? salida,
      tokens: def.tokens?.(salida),
      modelo: modelo ?? def.nombre,
    };
  };

  const cerrar = async (universo: Universo, respuesta: string, tokens: Tokens | undefined, modelo: string): Promise<Trabajo> => {
    const forma = await medirForma(universo.ruta);
    // Un agente que no tocó un archivo contestó en vez de trabajar: no puede
    // cruzar el portón intacto y ganar por ser «el más simple».
    if (forma.archivos === 0) throw new FalloDelAgente("no tocó ningún archivo: contestó en vez de trabajar", 0, true);
    const contrato = leerContrato(respuesta);
    return {
      forma,
      gastado: 0,
      costoDesconocido: true,
      modelo,
      ...(tokens ? { tokens } : {}),
      ...(contrato ? { contrato } : {}),
    };
  };

  return {
    nombre: opciones.modelo ? `${def.nombre} ${opciones.modelo}` : def.nombre,
    async trabajar(universo, tarea, enfoque, senal) {
      const hecho = await correr(armarPrompt(tarea, opciones.contexto, enfoque?.instruccion), universo, enfoque?.modelo, senal);
      return cerrar(universo, hecho.respuesta, hecho.tokens, hecho.modelo);
    },
    async corregir(universo, tarea, falla, enfoque) {
      const hecho = await correr(pedidoDeCorreccion(tarea, falla), universo, enfoque?.modelo);
      return cerrar(universo, hecho.respuesta, hecho.tokens, hecho.modelo);
    },
  };
}

/**
 * Sin un lector propio de fallas: un código de salida que no es 0 es una
 * corrida fallida. Se dice con lo último que escribió el CLI, que es donde
 * suele estar el motivo (un límite de uso, una sesión vencida).
 */
function fallaPorCodigo(def: DefinicionDeMotor, salida: string, codigo: number | null): string | undefined {
  if (codigo === 0 || codigo === null) return undefined;
  const ultima = salida
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .at(-1);
  return `${def.nombre} salió con ${codigo}${ultima ? `: ${ultima.slice(0, 180)}` : ""}`;
}
