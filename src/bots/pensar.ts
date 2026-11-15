import { rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  consolidarMemoria,
  guardarHabilidad,
  leerBot,
  recordarEnBot,
  anotarHistorial,
  type Bot,
} from "./almacen.js";
import { correrPorDefecto, esFalloDeCupo, pedidoDeMotor } from "./pensar-motor.js";
import { crearCheckpoint } from "./checkpoints.js";
import { consumirTraspaso, leerTraspaso } from "./motor.js";
import { buscarEnBot, textoDeBusqueda } from "./memoria.js";
import { leerPolitica } from "../nucleo/politica.js";
import { bloques, promptDe } from "./pensar-bloques.js";
import { antesDeArrancar, casaDeCupo } from "../nucleo/cupo.js";
import { pasarALaSiguiente } from "../nucleo/cuentas.js";
import { guardarPendienteDePresupuesto, marcarAvisoDePresupuesto, marcarAvisoDeUmbral, puedeCorrer } from "./presupuesto.js";
import { confirmando, esperaDePermiso, guardarPendiente, herramientaDePermiso, leerPendiente, rutaPendiente } from "./pendiente.js";

export interface PedidoDeCorrida {
  readonly bot: Bot;
  readonly prompt: string;
  readonly cmd: string;
  readonly args: readonly string[];
  readonly permiso: "solo-lectura" | "permisos";
  readonly entorno: Readonly<Record<string, string>>;
  readonly modelo?: string;
  readonly senal?: AbortSignal;
  readonly demo?: boolean;
}
export type CorrerBot = (pedido: PedidoDeCorrida) => Promise<string>;
export interface PensarDeps {
  readonly correr?: CorrerBot;
  readonly ahora?: () => Date;
  readonly senal?: AbortSignal;
  readonly demo?: boolean;
  /** Quién le habla: la persona, o una rutina (así el historial no le atribuye a la persona lo que pidió el reloj). */
  readonly quien?: "vos" | "rutina";
  readonly rutina?: { readonly modelo?: string; readonly vueltas?: number; readonly habilidades?: readonly string[]; readonly herramientas?: readonly string[] };
  readonly checkpoint?: (bot: Bot) => Promise<unknown>;
  readonly casa?: string;
}
export interface ResultadoDePensar {
  readonly texto: string;
  readonly recordo: string[];
  readonly habilidades: string[];
  readonly pidePermiso?: string;
  readonly consulto?: string[];
  readonly nada: boolean;
  readonly cupoHasta?: string;
  /** El presupuesto cortó la corrida: lo pedido no se terminó. */
  readonly pausado?: boolean;
}
export { leerPendiente, rechazarPendiente, type Pendiente } from "./pendiente.js";

async function interpretar(
  bot: Bot,
  mensaje: string,
  deps: PensarDeps,
  profundidad: number,
  pila: readonly string[],
  forzarPermisos = false,
  limite?: string,
  permisoEfectivo: Bot["permiso"] = bot.permiso,
): Promise<ResultadoDePensar> {
  // Al confirmar no se anota de nuevo: el pedido ya está en el historial desde la primera vez. Lo que
  // le pide otro bot queda como nota del sistema, no como algo que dijo la persona.
  if (!forzarPermisos) await anotarHistorial(bot.id, profundidad > 0 ? "sistema" : (deps.quien ?? "vos"), mensaje, deps.ahora?.() ?? new Date());
  const traspaso = await leerTraspaso(bot);
  const prompt = await promptDe(bot, limite ? `${mensaje}\n\nHACÉ SOLO ESTO, SIN AGREGAR OTRAS TAREAS: ${limite}` : mensaje, deps);
  const puedeEscribir = forzarPermisos || permisoEfectivo === "libre" || permisoEfectivo === "carpeta";
  const soloLectura = !puedeEscribir;
  const correr = deps.correr ?? correrPorDefecto;
  let respaldoUsado = false;
  let corrio = false;
  let pausado = false;
  let cupoHasta: string | undefined;
  const correrMotor = async (objetivo: Bot, pedidoPrompt: string, permitirRespaldo = true, saltarCupo = false): Promise<string> => {
    const momento = deps.ahora?.() ?? new Date();
    const presupuesto = await puedeCorrer(objetivo, momento);
    if (!presupuesto.puede) {
      pausado = true;
      if (presupuesto.requiereConfirmacion) {
        await guardarPendienteDePresupuesto(bot, mensaje, momento);
        const nuevoAviso = await marcarAvisoDeUmbral(objetivo, momento);
        if (nuevoAviso) await anotarHistorial(bot.id, "sistema", `Pausé el bot: ${presupuesto.motivo}. Espera «seguí» para continuar.`, momento);
        return `Pausé la corrida porque ${presupuesto.motivo}. Respondé «seguí» para continuar.`;
      }
      const avisar = await marcarAvisoDePresupuesto(objetivo, momento);
      if (avisar) await anotarHistorial(bot.id, "sistema", `No corro más este mes: ${presupuesto.motivo}.`, momento);
      return `No corro más este mes: ${presupuesto.motivo}.`;
    }
    const cupo = saltarCupo ? { sigue: true as const } : await antesDeArrancar({ agente: objetivo.motor, largo: "corto", ahora: momento, casa: casaDeCupo(deps.casa) });
    if (!cupo.sigue) {
      if (cupo.alternativa === "otra-cuenta" && objetivo.motor === "claude" && pasarALaSiguiente()) return correrMotor(objetivo, pedidoPrompt, permitirRespaldo, true);
      if (permitirRespaldo && objetivo.respaldo && objetivo.respaldo !== objetivo.motor) {
        const respaldo = { ...objetivo, motor: objetivo.respaldo };
        const puedeRespaldo = await antesDeArrancar({ agente: respaldo.motor, largo: "corto", ahora: momento, casa: casaDeCupo(deps.casa) });
        if (puedeRespaldo.sigue) {
          respaldoUsado = true;
          await anotarHistorial(bot.id, "sistema", `El motor ${objetivo.motor} no tiene cupo; uso ${objetivo.respaldo}.`, momento);
          return correrMotor(respaldo, pedidoPrompt, false);
        }
      }
      cupoHasta = cupo.hasta.toISOString();
      return `No hay cupo de ${objetivo.motor} hasta ${cupo.hasta.toLocaleString("es-AR")}.`;
    }
    // El checkpoint protege el modo «carpeta», que edita sin pedir confirmación; «libre» ya fue
    // autorizado explícitamente por la persona y no debe disputar el índice de su worktree.
    if (!soloLectura && objetivo.permiso === "carpeta") await (deps.checkpoint ?? crearCheckpoint)(objetivo);
    const politica = objetivo.permiso === "carpeta" ? await leerPolitica(objetivo.carpeta) : undefined;
    const pedido = await pedidoDeMotor(objetivo, pedidoPrompt, soloLectura, deps.senal, deps.demo, {
      ...(deps.rutina?.modelo ? { modelo: deps.rutina.modelo } : {}),
      ...(deps.rutina?.vueltas ? { vueltas: deps.rutina.vueltas } : {}),
      ...(deps.rutina?.herramientas ? { herramientas: deps.rutina.herramientas } : {}),
      ...(politica ? { prohibidos: politica.comandosProhibidos } : {}),
    });
    try {
      const respuesta = await correr(pedido);
      corrio = true;
      if (deps.correr) {
        const texto = typeof respuesta === "string" ? respuesta : String(respuesta);
        // Los runners inyectados no pasan por correrPorDefecto, así que cuentan como suscripción.
        const { registrarCorrida } = await import("./presupuesto.js");
        await registrarCorrida(objetivo, undefined, momento);
        return texto;
      }
      return respuesta;
    } catch (error) {
      if (!permitirRespaldo || respaldoUsado || !objetivo.respaldo || objetivo.respaldo === objetivo.motor || !esFalloDeCupo(error)) throw error;
      respaldoUsado = true;
      await anotarHistorial(bot.id, "sistema", `El motor ${objetivo.motor} llegó a su cupo; reintento una vez con ${objetivo.respaldo}.`, deps.ahora?.() ?? new Date());
      const { respaldo: _respaldo, ...sinRespaldo } = objetivo;
      return correrMotor({ ...sinRespaldo, motor: objetivo.respaldo }, pedidoPrompt, false);
    }
  };
  const salida = await correrMotor(bot, prompt);
  if (corrio) await consumirTraspaso(bot, traspaso);
  let hecho = bloques(salida);
  if (hecho.busquedas.length) {
    const consultas = await Promise.all(hecho.busquedas.map(async (consulta) => textoDeBusqueda(consulta, await buscarEnBot(bot.id, consulta))));
    hecho = bloques(await correrMotor(bot, `${prompt}\n\n<<pedir bot="memoria">>${consultas.join("\n\n")}<</pedir>>`, false));
  }
  const consultados: string[] = [];
  if (hecho.pedidos.length && profundidad < 2) {
    const respuestas: string[] = [];
    for (const solicitud of hecho.pedidos) {
      if (solicitud.bot === bot.id || pila.includes(solicitud.bot)) continue;
      const otro = await leerBot(solicitud.bot).catch(() => undefined);
      if (!otro) continue;
      const respuesta = await interpretar(otro, solicitud.tarea, deps, profundidad + 1, [...pila, bot.id], false, undefined, permisoMasBajo(permisoEfectivo, otro.permiso));
      consultados.push(solicitud.bot);
      respuestas.push("Consulta a " + otro.nombre + ":\n" + respuesta.texto);
    }
    if (respuestas.length) {
      hecho = bloques(await correrMotor(bot, prompt + "\n\n" + respuestas.join("\n\n"), false));
    }
  }
  // La memoria y las habilidades son archivos del propio bot, no de tu repo: las cura con cualquier
  // permiso menos «leer» (con «preguntar», el de por defecto, no aprendía nada hasta un «dale»).
  let habilidadesResultado = hecho.habilidades.map((x) => x.nombre);
  if (puedeEscribir || permisoEfectivo === "preguntar") {
    for (const consolidacion of hecho.consolidaciones) {
      try {
        await consolidarMemoria(bot.id, consolidacion);
      } catch (error) {
        await anotarHistorial(bot.id, "sistema", `No consolidé la memoria: ${error instanceof Error ? error.message : String(error)}.`, deps.ahora?.() ?? new Date());
      }
    }
    for (const recuerdo of hecho.recuerdos) await recordarEnBot(bot.id, recuerdo, deps.ahora?.() ?? new Date());
    const guardadas: string[] = [];
    for (const habilidad of hecho.habilidades) {
      const nombre = habilidad.nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "habilidad";
      const descripcion = habilidad.descripcion.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
      if (!descripcion) {
        await anotarHistorial(bot.id, "sistema", `Salteé la habilidad «${nombre}»: necesita una descripción.`, deps.ahora?.() ?? new Date());
        continue;
      }
      try {
        const guardada = await guardarHabilidad(bot.id, nombre, descripcion, habilidad.cuerpo);
        guardadas.push(guardada.nombre);
      } catch (error) {
        await anotarHistorial(bot.id, "sistema", `No guardé la habilidad «${nombre}»: ${error instanceof Error ? error.message : String(error)}.`, deps.ahora?.() ?? new Date());
      }
    }
    habilidadesResultado = guardadas;
  }
  if (hecho.chequeoIntentos) await anotarHistorial(bot.id, "sistema", "Ignoré un intento del bot de crear o cambiar el chequeo de una rutina.", deps.ahora?.() ?? new Date());
  let pidePermiso = hecho.permiso;
  if (pidePermiso && permisoEfectivo === "preguntar" && profundidad === 0 && !forzarPermisos) {
    const creado = deps.ahora?.() ?? new Date();
    const herramienta = herramientaDePermiso(pidePermiso);
    const guardado = await guardarPendiente(bot, { id: randomUUID(), mensaje, quiere: pidePermiso, ...(herramienta ? { herramienta } : {}), creado: creado.toISOString(), vence: new Date(creado.getTime() + esperaDePermiso).toISOString() });
    if (!guardado) {
      hecho.texto = (hecho.texto + "\nYa hay un pedido esperando tu «dale»; no reemplacé lo que estaba aprobado.").trim();
      pidePermiso = undefined;
    }
  }
  if (pidePermiso && (permisoEfectivo === "leer" || profundidad > 0)) {
    pidePermiso = undefined;
    hecho.texto = (hecho.texto + "\nNo pude hacer eso: esta consulta no tiene permiso para tocar nada.").trim();
  }
  // Si lo único que dijo fue el pedido de permiso, eso es lo que se lee; y un latido sin novedad no deja
  // una burbuja vacía en la charla.
  if (!hecho.texto && pidePermiso) hecho.texto = `Para esto necesito tu permiso: ${pidePermiso}`;
  if (hecho.texto) await anotarHistorial(bot.id, "bot", hecho.texto, deps.ahora?.() ?? new Date());
  return {
    texto: hecho.texto,
    recordo: hecho.recuerdos,
    habilidades: habilidadesResultado,
    ...(pidePermiso ? { pidePermiso } : {}),
    ...(consultados.length ? { consulto: consultados } : {}),
    nada: hecho.nada,
    ...(cupoHasta ? { cupoHasta } : {}),
    ...(pausado ? { pausado: true } : {}),
  };
}

export function pensar(bot: Bot, mensaje: string, deps: PensarDeps = {}): Promise<ResultadoDePensar> {
  return interpretar(bot, mensaje.trim(), deps, 0, [bot.id]);
}

/** `alReclamar` corre recién cuando este «dale» se quedó con el pedido: si otro lo atendió, no pasa nada. */
export async function confirmar(bot: Bot, deps: PensarDeps = {}, id?: string, alReclamar?: () => Promise<void>): Promise<ResultadoDePensar> {
  if (confirmando.has(bot.id)) return { texto: "Ese pedido ya fue atendido por otro «dale».", recordo: [], habilidades: [], nada: false };
  confirmando.add(bot.id);
  try {
  const reclamado = `${rutaPendiente(bot)}.${process.pid}.${randomUUID()}.reclamado`;
  const actual = await leerPendiente(bot);
  if (!actual || (id && actual.id !== id)) return { texto: "Ese pedido ya no está pendiente.", recordo: [], habilidades: [], nada: false };
  if (bot.permiso !== "preguntar") {
    await rm(rutaPendiente(bot), { force: true });
    return { texto: "No puedo confirmar: el bot ya no está en modo «preguntar».", recordo: [], habilidades: [], nada: false };
  }
  try {
    await rename(rutaPendiente(bot), reclamado);
  } catch {
    return { texto: "Ese pedido ya fue atendido por otro «dale».", recordo: [], habilidades: [], nada: false };
  }
  try {
    await alReclamar?.().catch(() => {});
    return await interpretar(bot, actual.mensaje, deps, 0, [bot.id], true, actual.quiere, "libre");
  } finally {
    await rm(reclamado, { force: true });
  }
  } finally {
    confirmando.delete(bot.id);
  }
}

function permisoMasBajo(a: Bot["permiso"], b: Bot["permiso"]): Bot["permiso"] {
  const orden = { leer: 0, preguntar: 1, carpeta: 2, libre: 3 } as const;
  return orden[a] <= orden[b] ? a : b;
}
