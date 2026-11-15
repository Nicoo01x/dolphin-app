import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { cuerpoDeLaConsola, hostLocal, json } from "./servidor-comun.js";
import {
  borrarBot,
  borrarHabilidad,
  crearBot,
  guardarAlma,
  guardarBot,
  guardarHabilidad,
  leerAlma,
  leerBot,
  leerHistorial,
  leerMemoria,
  listarBots,
  listarHabilidades,
  olvidarEnBot,
  type Bot,
  type MotorDeBot,
  type PermisoDeBot,
  type RutinaGuardada,
} from "./bots/almacen.js";
import { confirmar, leerPendiente, pensar } from "./bots/pensar.js";
import { plantilla } from "./bots/plantillas.js";
import { proximaCorrida, siguienteIdDeRutina } from "./bots/rutinas.js";
import { validarZona } from "./bots/horarios.js";
import { deshacerCheckpoint } from "./bots/checkpoints.js";
import { estadoServicio } from "./bots/servicio-instalador.js";
import { leerGasto } from "./bots/presupuesto.js";

/**
 * La API de Dolphin bots para la consola. Los bots no son de un proyecto (viven en
 * ~/.dolphin/bots), así que estas rutas no miran el `?p=`. Todo lo que escribe pide el pase de la
 * consola, como el resto del servidor.
 *
 * En la demo, todo bot piensa con el motor de mentira aunque se haya creado con Claude: abrir la
 * consola de prueba nunca gasta cupo.
 */

const idValido = (id: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const motorValido = (motor: unknown): motor is MotorDeBot => motor === "claude" || motor === "codex" || motor === "mentira";
const permisoValido = (permiso: unknown): permiso is PermisoDeBot => permiso === "preguntar" || permiso === "leer" || permiso === "carpeta" || permiso === "libre";
const respaldoValido = (motor: unknown): motor is Exclude<MotorDeBot, "mentira"> => motor === "claude" || motor === "codex";
const porQue = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** El bot tal como lo ve la consola: sin el token de Telegram, con lo que espera tu «dale». */
async function publico(bot: Bot) {
  const { telegram, ...resto } = bot;
  const rutinas = resto.rutinas.map(({ secreto: _secreto, ...rutina }) => rutina);
  const pendiente = await leerPendiente(bot);
  return { ...resto, rutinas, telegram: Boolean(telegram), gasto: await leerGasto(bot.id), ...(pendiente ? { pendiente: { id: pendiente.id, quiere: pendiente.quiere } } : {}) };
}

/** Los DELETE sin cuerpo también piden el pase: borrar es escribir. */
function paseValido(pedido: IncomingMessage, respuesta: ServerResponse, token: string): boolean {
  // De esta máquina, o de afuera con el pase en la cabecera: lo mismo que cuerpoDeLaConsola.
  if (!hostLocal(pedido) && pedido.headers["x-dolphin-token"] !== token) {
    json(respuesta, 403, { ok: false, porQue: "solo desde esta máquina" });
    return false;
  }
  if (pedido.headers["x-dolphin-token"] !== token) {
    json(respuesta, 403, { ok: false, porQue: "falta el pase de la consola: refrescá la página" });
    return false;
  }
  return true;
}

/** «diario HH:MM», «cada N» o el objeto que manda la consola. */
function cuandoDesde(dato: unknown): RutinaGuardada["cuando"] {
  if (typeof dato === "string") {
    const diario = /^diario\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(dato.trim());
    if (diario) return { tipo: "diario", hora: `${diario[1]}:${diario[2]}` };
    const cada = /^cada\s+(\d+)$/.exec(dato.trim());
    if (cada && Number(cada[1]) > 0) return { tipo: "cada", minutos: Number(cada[1]) };
    throw new Error("la rutina va «diario HH:MM» o «cada N» minutos");
  }
  if (dato && typeof dato === "object") {
    const d = dato as Record<string, unknown>;
    if (d.tipo === "diario" && typeof d.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) {
      if (d.tz !== undefined && typeof d.tz !== "string") throw new Error("la zona horaria debe ser un nombre IANA");
      const tz = typeof d.tz === "string" ? validarZona(d.tz) : undefined;
      return { tipo: "diario", hora: d.hora, ...(tz ? { tz } : {}) };
    }
    if (d.tipo === "cada" && Number.isInteger(d.minutos) && Number(d.minutos) > 0) return { tipo: "cada", minutos: Number(d.minutos) };
    if (d.tipo === "evento") return { tipo: "evento" };
    throw new Error("no entiendo cuándo corre esa rutina");
  }
  throw new Error("falta cuándo corre la rutina");
}

function rutinaDesde(cuerpo: Record<string, unknown>, bot: Bot): RutinaGuardada {
  const tarea = typeof cuerpo.tarea === "string" ? cuerpo.tarea.trim() : "";
  if (!tarea) throw new Error("la rutina necesita una tarea");
  const cuando = cuandoDesde(cuerpo.cuando);
  // El id no se repite aunque se haya sacado una del medio: «rutina-3» no pisa a la «rutina-3» que quedó.
  const id = siguienteIdDeRutina(bot.rutinas, typeof cuerpo.id === "string" ? cuerpo.id : undefined);
  const sinProxima = {
    id,
    cuando,
    tarea,
    ...(cuerpo.latido === true ? { latido: true } : {}),
    ...(typeof cuerpo.modelo === "string" && cuerpo.modelo.trim() ? { modelo: cuerpo.modelo.trim() } : {}),
    ...(Number.isInteger(cuerpo.vueltas) && Number(cuerpo.vueltas) > 0 ? { vueltas: Number(cuerpo.vueltas) } : {}),
    ...(Array.isArray(cuerpo.habilidades) && cuerpo.habilidades.every((x) => typeof x === "string") ? { habilidades: cuerpo.habilidades as string[] } : {}),
    ...(typeof cuerpo.chequeo === "string" && cuerpo.chequeo.trim() ? { chequeo: cuerpo.chequeo } : {}),
    ...(cuando.tipo === "evento" ? { secreto: randomBytes(32).toString("hex"), ...(cuerpo.confiar === true ? { confiar: true } : {}) } : {}),
  };
  return { ...sinProxima, proxima: proximaCorrida({ ...sinProxima, proxima: "" }, new Date()) };
}

export async function rutaDeBots(ruta: string, pedido: IncomingMessage, respuesta: ServerResponse, token: string, demo = false): Promise<boolean> {
  if (ruta !== "/api/bots" && !ruta.startsWith("/api/bots/")) return false;
  const conMotor = (bot: Bot): Bot => (demo ? { ...bot, motor: "mentira" } : bot);

  if (ruta === "/api/bots") {
    if (pedido.method === "GET") {
      const bots = await listarBots();
      json(respuesta, 200, { bots: await Promise.all(bots.map((b) => ("error" in b ? b : publico(b)))), servicio: await estadoServicio() });
      return true;
    }
    if (pedido.method !== "POST") return json(respuesta, 405, { ok: false, porQue: "método no permitido" }), true;
    const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
    if (!datos) return true;
    try {
      const pedida = typeof datos.plantilla === "string" ? datos.plantilla : "";
      const p = pedida ? plantilla(pedida) : undefined;
      if (pedida && !p) throw new Error(`no conozco la plantilla «${pedida}»`);
      const bot = await crearBot({
        nombre: typeof datos.nombre === "string" ? datos.nombre : "",
        motor: demo ? "mentira" : motorValido(datos.motor) ? datos.motor : "claude",
        permiso: permisoValido(datos.permiso) ? datos.permiso : (p?.permiso ?? "preguntar"),
        ...(respaldoValido(datos.respaldo) ? { respaldo: datos.respaldo } : {}),
        ...(p ? { herramientas: p.herramientas } : {}),
        ...(datos.presupuesto !== undefined ? { presupuesto: presupuestoDesde(datos)! } : {}),
        ...(Array.isArray(datos.entorno) && datos.entorno.every((x) => typeof x === "string") ? { entorno: datos.entorno as string[] } : {}),
        ...(typeof datos.modelo === "string" && datos.modelo ? { modelo: datos.modelo } : {}),
        ...(typeof datos.carpeta === "string" && datos.carpeta.trim() ? { carpeta: datos.carpeta.trim() } : {}),
        ...(p ? { alma: p.alma, rutinas: p.rutinas } : {}),
      });
      json(respuesta, 201, { ok: true, bot: await publico(bot) });
    } catch (error) {
      json(respuesta, 400, { ok: false, porQue: porQue(error) });
    }
    return true;
  }

  const partes = /^\/api\/bots\/([^/]+)(?:\/(hablar|dale|deshacer|rutinas|habilidades|memoria))?(?:\/([^/]+))?$/.exec(ruta);
  if (!partes) return false;
  const id = decodeURIComponent(partes[1]!);
  if (!idValido(id)) return json(respuesta, 400, { ok: false, porQue: "ese bot no existe" }), true;
  const accion = partes[2];
  const extra = partes[3] ? decodeURIComponent(partes[3]) : "";

  try {
    const bot = await leerBot(id);

    if (!accion && pedido.method === "GET") {
      const [alma, memoria, habilidades, historial] = await Promise.all([leerAlma(id), leerMemoria(id), listarHabilidades(id), leerHistorial(id, 50)]);
      json(respuesta, 200, {
        bot: await publico(bot),
        alma,
        memoria: memoria
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        habilidades,
        historial,
      });
      return true;
    }

    if (!accion && pedido.method === "PUT") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      const sinRespaldo = datos.respaldo === null ? (({ respaldo: _respaldo, ...resto }) => resto)(bot) : bot;
      const cambiado: Bot = {
        ...sinRespaldo,
        ...(!demo && motorValido(datos.motor) ? { motor: datos.motor } : {}),
        ...(permisoValido(datos.permiso) ? { permiso: datos.permiso } : {}),
        ...(!demo && respaldoValido(datos.respaldo) ? { respaldo: datos.respaldo } : {}),
        ...(typeof datos.carpeta === "string" && datos.carpeta.trim() ? { carpeta: datos.carpeta.trim() } : {}),
        ...(datos.presupuesto !== undefined ? { presupuesto: presupuestoDesde(datos)! } : {}),
        ...(Array.isArray(datos.entorno) && datos.entorno.every((x) => typeof x === "string") ? { entorno: datos.entorno as string[] } : {}),
      };
      await guardarBot(cambiado);
      if (typeof datos.alma === "string") await guardarAlma(id, datos.alma);
      json(respuesta, 200, { ok: true, bot: await publico(cambiado) });
      return true;
    }

    if (!accion && pedido.method === "DELETE") {
      if (!paseValido(pedido, respuesta, token)) return true;
      await borrarBot(id);
      json(respuesta, 200, { ok: true });
      return true;
    }

    if (accion === "deshacer" && pedido.method === "POST") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      if (datos.confirmar !== true) return json(respuesta, 409, { ok: false, porQue: "confirmá el deshacer con {confirmar:true}" }), true;
      json(respuesta, 200, { ok: true, checkpoint: await deshacerCheckpoint(id) });
      return true;
    }

    if (accion === "hablar" && pedido.method === "POST") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      if (typeof datos.texto !== "string" || !datos.texto.trim()) return json(respuesta, 400, { ok: false, porQue: "el mensaje está vacío" }), true;
      const corte = new AbortController();
      respuesta.on("close", () => {
        if (!respuesta.writableFinished) corte.abort();
      });
      json(respuesta, 200, { ok: true, resultado: await pensar(conMotor(bot), datos.texto, { demo, senal: corte.signal }) });
      return true;
    }

    if (accion === "dale" && pedido.method === "POST") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      const corte = new AbortController();
      respuesta.on("close", () => {
        if (!respuesta.writableFinished) corte.abort();
      });
      const id = typeof datos.id === "string" ? datos.id : undefined;
      json(respuesta, 200, { ok: true, resultado: await confirmar(conMotor(bot), { demo, senal: corte.signal }, id) });
      return true;
    }

    if (accion === "rutinas" && pedido.method === "POST") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      const rutina = rutinaDesde(datos, bot);
      if (bot.rutinas.some((r) => r.id === rutina.id)) return json(respuesta, 409, { ok: false, porQue: "ya hay una rutina con ese nombre" }), true;
      await guardarBot({ ...bot, rutinas: [...bot.rutinas, rutina] });
      json(respuesta, 201, { ok: true, rutina });
      return true;
    }

    if (accion === "rutinas" && pedido.method === "DELETE" && extra) {
      if (!paseValido(pedido, respuesta, token)) return true;
      const rutinas = bot.rutinas.filter((r) => r.id !== extra);
      if (rutinas.length === bot.rutinas.length) return json(respuesta, 404, { ok: false, porQue: "esa rutina ya no está" }), true;
      await guardarBot({ ...bot, rutinas });
      json(respuesta, 200, { ok: true });
      return true;
    }

    if (accion === "habilidades" && extra && pedido.method === "PUT") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      const descripcion = typeof datos.descripcion === "string" ? datos.descripcion : "";
      const cuerpo = typeof datos.cuerpo === "string" ? datos.cuerpo : "";
      json(respuesta, 200, { ok: true, habilidad: await guardarHabilidad(id, extra, descripcion, cuerpo) });
      return true;
    }

    if (accion === "habilidades" && extra && pedido.method === "DELETE") {
      if (!paseValido(pedido, respuesta, token)) return true;
      await borrarHabilidad(id, extra);
      json(respuesta, 200, { ok: true });
      return true;
    }

    if (accion === "memoria" && pedido.method === "DELETE") {
      const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
      if (!datos) return true;
      if (typeof datos.linea !== "string" || !datos.linea.trim()) return json(respuesta, 400, { ok: false, porQue: "falta qué olvidar" }), true;
      await olvidarEnBot(id, datos.linea);
      json(respuesta, 200, { ok: true });
      return true;
    }

    json(respuesta, 405, { ok: false, porQue: "método no permitido" });
    return true;
  } catch (error) {
    const noEsta = (error as NodeJS.ErrnoException).code === "ENOENT";
    json(respuesta, noEsta ? 404 : 400, { ok: false, porQue: noEsta ? "ese bot no existe" : porQue(error) });
    return true;
  }
}

function presupuestoDesde(datos: Record<string, unknown>): NonNullable<Bot["presupuesto"]> | undefined {
  if (datos.presupuesto === undefined) return undefined;
  if (!datos.presupuesto || typeof datos.presupuesto !== "object") throw new Error("presupuesto inválido");
  const p = datos.presupuesto as { usdPorMes?: unknown; corridasPorMes?: unknown; avisoUsd?: unknown; avisoCorridasPorMes?: unknown };
  if ((p.usdPorMes !== undefined && (typeof p.usdPorMes !== "number" || !Number.isFinite(p.usdPorMes) || p.usdPorMes <= 0)) || (p.corridasPorMes !== undefined && (!Number.isInteger(p.corridasPorMes) || Number(p.corridasPorMes) <= 0)) || (p.avisoUsd !== undefined && (typeof p.avisoUsd !== "number" || !Number.isFinite(p.avisoUsd) || p.avisoUsd <= 0)) || (p.avisoCorridasPorMes !== undefined && (!Number.isInteger(p.avisoCorridasPorMes) || Number(p.avisoCorridasPorMes) <= 0))) throw new Error("presupuesto inválido");
  if (p.usdPorMes === undefined && p.corridasPorMes === undefined && p.avisoUsd === undefined && p.avisoCorridasPorMes === undefined) throw new Error("presupuesto vacío");
  return { ...(p.usdPorMes !== undefined ? { usdPorMes: p.usdPorMes as number } : {}), ...(p.corridasPorMes !== undefined ? { corridasPorMes: p.corridasPorMes as number } : {}), ...(p.avisoUsd !== undefined ? { avisoUsd: p.avisoUsd as number } : {}), ...(p.avisoCorridasPorMes !== undefined ? { avisoCorridasPorMes: p.avisoCorridasPorMes as number } : {}) };
}
