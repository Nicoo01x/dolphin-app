import "./nucleo/electron.js";
import { parseArgs } from "node:util";
import { crearBot, guardarBot, listarBots, leerBot, borrarBot, tomarLockDeBots, type Bot, type RutinaGuardada } from "./bots/almacen.js";
import { confirmar, pensar } from "./bots/pensar.js";
import { plantilla } from "./bots/plantillas.js";
import { proximaCorrida, siguienteIdDeRutina } from "./bots/rutinas.js";
import { correrBots } from "./bots/servicio.js";
import { deshacerCheckpoint } from "./bots/checkpoints.js";
import { desinstalarServicio, estadoServicio, instalarServicio } from "./bots/servicio-instalador.js";
import { createInterface } from "node:readline/promises";
import { stdin as entrada, stdout as salida } from "node:process";
import { escucharWebhook } from "./bots-webhook.js";
import { C, pintar, tabla, titulo } from "./salida.js";
import { cambiarMotor } from "./bots/motor.js";
import { confirmarPresupuesto, leerPendienteDePresupuesto, puedeCorrer } from "./bots/presupuesto.js";
import { instantaneaDeBot, instantaneaDeManada } from "./bots/instantanea.js";
import { apartarBot, importarBot } from "./bots/mudanza.js";
import { leerHistorial } from "./bots/almacen.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    plantilla: { type: "string" },
    motor: { type: "string" },
    modelo: { type: "string" },
    carpeta: { type: "string" },
    permiso: { type: "string" },
    respaldo: { type: "string" },
    latido: { type: "boolean", default: false },
    token: { type: "string" },
    chat: { type: "string" },
    tz: { type: "string" },
    vueltas: { type: "string" },
    habilidad: { type: "string", multiple: true },
    herramienta: { type: "string", multiple: true },
    chequeo: { type: "string" },
    presupuesto: { type: "string" },
    corridas: { type: "string" },
    aviso: { type: "string" },
    "aviso-corridas": { type: "string" },
    entorno: { type: "string", multiple: true },
    evento: { type: "boolean", default: false },
    confiar: { type: "boolean", default: false },
    puerto: { type: "string", default: "4890" },
    host: { type: "string" },
    demo: { type: "boolean", default: false },
    // Para la app de escritorio (y cualquiera que lea la salida): un JSON por comando, sin colores.
    json: { type: "boolean", default: false },
    comando: { type: "string" },
    reemplazar: { type: "boolean", default: false },
  },
});

const [comando, primero, segundo, tercero] = positionals;
const error = (texto: string): never => {
  throw new Error(texto);
};
const exigir = (valor: string | undefined, texto: string): string => valor?.trim() || error(texto);
const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));
const comoJson = values.json;
const imprimirJson = (dato: unknown): void => {
  console.log(JSON.stringify(dato));
};
const leerEntrada = async (): Promise<string> => {
  const partes: string[] = [];
  for await (const parte of entrada) partes.push(String(parte));
  return partes.join("");
};

if ((!comando || comando === "lista" || comando === "listar") && comoJson) {
  imprimirJson(await instantaneaDeManada());
} else if (!comando || comando === "lista" || comando === "listar") {
  const servicio = await estadoServicio();
  const bots = await listarBots();
  console.log(
    titulo(
      "Bots",
      servicio.vivo ? `prendidos desde ${servicio.desde ? new Date(servicio.desde).toLocaleString("es-AR") : "ahora"}` : "apagados · prendelos con «dolphin bots correr» o «dolphin bots instalar»",
    ),
  );
  if (bots.length === 0) console.log(`  ${pintar("Todavía no hay bots. Creá uno con «dolphin bots nuevo vigía --plantilla vigia».", C.suave)}\n`);
  else
    console.log(
      tabla(bots, [
        { titulo: "", valor: (b) => ("error" in b ? pintar("×", C.rojo) : servicio.vivo ? pintar("●", C.verde) : pintar("○", C.tenue)) },
        { titulo: "bot", valor: (b) => ("error" in b ? b.id : `${b.nombre}${b.id !== b.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") ? pintar(`  ${b.id}`, C.tenue) : ""}`) },
        { titulo: "motor", valor: (b) => ("error" in b ? "" : pintar(b.motor, C.suave)) },
        { titulo: "permiso", valor: (b) => ("error" in b ? "" : pintar(b.permiso, b.permiso === "libre" ? C.rojo : b.permiso === "carpeta" ? C.amarillo : C.suave)) },
        {
          titulo: "próxima rutina",
          valor: (b) => {
            if ("error" in b) return pintar(`no se pudo leer: ${b.error}`, C.rojo);
            const proxima = [...b.rutinas].sort((x, y) => x.proxima.localeCompare(y.proxima))[0];
            return proxima ? `${new Date(proxima.proxima).toLocaleString("es-AR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}${pintar(`  ${proxima.tarea}`, C.tenue)}` : pintar("solo cuando le escribís", C.tenue);
          },
          elastica: true,
        },
      ]) + "\n",
    );
} else if (comando === "nuevo") {
  const nombre = exigir(primero, "falta el nombre del bot");
  const p = values.plantilla ? plantilla(values.plantilla) : undefined;
  if (values.plantilla && !p) error(`no conozco la plantilla «${values.plantilla}»`);
  const motor = values.demo ? "mentira" : (values.motor as Bot["motor"] | undefined);
  const permiso = values.permiso as Bot["permiso"] | undefined;
  const bot = await crearBot({
    nombre,
    ...(motor ? { motor } : {}),
    ...(values.modelo ? { modelo: values.modelo } : {}),
    ...(values.respaldo ? { respaldo: values.respaldo as Exclude<Bot["motor"], "mentira"> } : {}),
    ...(values.carpeta ? { carpeta: values.carpeta } : {}),
    ...(permiso ? { permiso } : {}),
    ...(p ? { alma: p.alma, rutinas: p.rutinas, permiso: permiso ?? p.permiso, herramientas: p.herramientas } : {}),
    ...((values.presupuesto || values.corridas || values.aviso || values["aviso-corridas"]) ? { presupuesto: { ...(values.presupuesto ? { usdPorMes: Number(values.presupuesto) } : {}), ...(values.corridas ? { corridasPorMes: Number(values.corridas) } : {}), ...(values.aviso ? { avisoUsd: Number(values.aviso) } : {}), ...(values["aviso-corridas"] ? { avisoCorridasPorMes: Number(values["aviso-corridas"]) } : {}) } } : {}),
    ...(values.entorno?.length ? { entorno: values.entorno } : {}),
  });
  if (comoJson) imprimirJson(await instantaneaDeBot(bot, await estadoServicio()));
  else console.log(`Creado ${bot.nombre} (${bot.id}) con ${bot.motor}.`);
} else if (comando === "historial") {
  const entradas = await leerHistorial(exigir(primero, "falta el id del bot"), 50);
  if (comoJson) imprimirJson(entradas);
  else for (const e of entradas) console.log(`${pintar(new Date(e.cuando).toLocaleString("es-AR"), C.tenue)}  ${e.quien}: ${e.texto}`);
} else if (comando === "hablar") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  const texto = exigir([segundo, tercero, ...positionals.slice(4)].filter(Boolean).join(" ") || (comoJson && !entrada.isTTY ? (await leerEntrada()).trim() : ""), "falta el mensaje");
  const resultado = await pensar(bot, texto);
  if (comoJson) imprimirJson({ texto: resultado.texto, nada: resultado.nada, ...(resultado.pidePermiso ? { pidePermiso: resultado.pidePermiso } : {}), ...(resultado.pausado ? { pausado: true } : {}) });
  else console.log(resultado.texto || (resultado.nada ? "Nada para avisar." : "Sin respuesta."));
  if (resultado.pidePermiso && !comoJson) console.log(`Permiso: ${resultado.pidePermiso}`);
} else if (comando === "dale") {
  const resultado = await confirmar(await leerBot(exigir(primero, "falta el id del bot")));
  if (comoJson) imprimirJson({ texto: resultado.texto, nada: resultado.nada });
  else console.log(resultado.texto || "Listo.");
} else if (comando === "motor") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  if (segundo !== "claude" && segundo !== "codex") error("el motor debe ser claude o codex");
  const cambio = await cambiarMotor(bot, segundo as "claude" | "codex");
  console.log(cambio.cambio ? `El bot ${bot.id} ahora usa ${segundo}; dejé el paquete de traspaso limpio.` : `El bot ${bot.id} ya usa ${segundo}.`);
} else if (comando === "seguir") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  const pendiente = await leerPendienteDePresupuesto(bot);
  if (!pendiente && (await puedeCorrer(bot)).requiereConfirmacion) {
    await confirmarPresupuesto(bot);
    console.log("Sigo: los disparos que esperaban salen en la próxima vuelta del servicio.");
  } else if (!pendiente) console.log("No hay una corrida de presupuesto esperando «seguí».");
  else {
    await confirmarPresupuesto(bot);
    const resultado = await pensar(bot, pendiente.mensaje);
    console.log(resultado.texto || "Seguí con la corrida.");
  }
} else if (comando === "disparar") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  const mensaje = [segundo, tercero, ...positionals.slice(4)].filter(Boolean).join(" ") || (!entrada.isTTY ? (await leerEntrada()).trim() : "");
  const { encolarDisparo } = await import("./bots/disparos.js");
  const vueltas = values.vueltas ? Number(values.vueltas) : undefined;
  if (values.vueltas && (!Number.isInteger(vueltas) || vueltas! < 1)) error("--vueltas debe ser un entero positivo");
  const disparo = await encolarDisparo(bot, exigir(mensaje, "falta el mensaje"), { ...(vueltas ? { vueltas } : {}), ...(values.modelo ? { modelo: values.modelo } : {}), ...(values.herramienta?.length ? { herramientas: values.herramienta } : {}) });
  console.log(`Disparo ${disparo.id} encolado para ${bot.id}.`);
} else if (comando === "rutina") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  const accion = exigir(segundo, "falta agregar o sacar");
  if (accion === "agregar") {
    const cuandoTexto = values.evento ? "evento" : exigir(tercero, "falta «diario HH:MM» o «cada N»");
    const tarea = exigir(values.evento ? positionals.slice(3).join(" ") : positionals.slice(4).join(" "), "falta la tarea");
    const diario = /^diario\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(cuandoTexto);
    const cada = /^cada\s+(\d+)$/.exec(cuandoTexto);
    const cuando: RutinaGuardada["cuando"] = values.evento
      ? { tipo: "evento" }
      : diario
      ? { tipo: "diario", hora: `${diario[1]}:${diario[2]}`, ...(values.tz ? { tz: values.tz } : {}) }
      : cada && Number(cada[1]) > 0
        ? { tipo: "cada", minutos: Number(cada[1]) }
        : error("cuándo debe ser «diario HH:MM» o «cada N»");
    const vueltas = values.vueltas ? Number(values.vueltas) : undefined;
    if (values.vueltas && (!Number.isInteger(vueltas!) || vueltas! < 1)) error("--vueltas debe ser un entero positivo");
    const sinProxima = {
      id: siguienteIdDeRutina(bot.rutinas),
      cuando,
      tarea,
      ...(values.latido ? { latido: true } : {}),
      ...(values.modelo ? { modelo: values.modelo } : {}),
      ...(vueltas ? { vueltas } : {}),
      ...(values.habilidad?.length ? { habilidades: values.habilidad } : {}),
      ...(values.chequeo ? { chequeo: values.chequeo } : {}),
      ...(values.evento ? { secreto: (await import("node:crypto")).randomBytes(32).toString("hex"), ...(values.confiar ? { confiar: true } : {}) } : {}),
    };
    const rutina = { ...sinProxima, proxima: proximaCorrida({ ...sinProxima, proxima: "" }, new Date()) };
    await guardarBot({ ...bot, rutinas: [...bot.rutinas, rutina] });
    console.log(`Rutina ${rutina.id} agregada; próxima: ${rutina.proxima || "cuando llegue un evento"}.`);
    if (rutina.cuando.tipo === "evento") console.log(`URL: http://127.0.0.1:4890/evento/${bot.id}/${rutina.id}\nSecreto (guardalo ahora): ${rutina.secreto}`);
  } else if (accion === "sacar") {
    const id = exigir(tercero, "falta el id de la rutina");
    const rutinas = bot.rutinas.filter((r) => r.id !== id);
    if (rutinas.length === bot.rutinas.length) error("esa rutina no existe");
    await guardarBot({ ...bot, rutinas });
    console.log(`Rutina ${id} sacada.`);
  } else error("la rutina necesita agregar o sacar");
} else if (comando === "telegram") {
  const bot = await leerBot(exigir(primero, "falta el id del bot"));
  const token = exigir(values.token, "falta --token");
  const chat = exigir(values.chat, "falta --chat");
  await guardarBot({ ...bot, telegram: { token, chat } });
  console.log(`Telegram conectado al bot ${bot.id}.`);
} else if (comando === "borrar") {
  await borrarBot(exigir(primero, "falta el id del bot"));
  console.log(`Bot ${primero} borrado.`);
} else if (comando === "deshacer") {
  const id = exigir(primero, "falta el id del bot");
  const rl = createInterface({ input: entrada, output: salida });
  const respuesta = await rl.question(`¿Deshacer el último checkpoint de ${id}? Escribí «sí»: `);
  rl.close();
  if (!/^s[ií]$/i.test(respuesta.trim())) error("deshacer cancelado");
  const checkpoint = await deshacerCheckpoint(id);
  console.log(`Checkpoint de ${id} restaurado (${checkpoint.creado}).`);
} else if (comando === "instalar") {
  // Con --comando (la app, en un servidor) el servicio se lleva el PATH de esta sesión: systemd no
  // lo hereda, y sin él el bot no encuentra a claude ni a codex.
  const unidad = await instalarServicio({ ...(values.comando ? { comando: values.comando, ...(process.env.PATH ? { entorno: { PATH: process.env.PATH } } : {}) } : {}) });
  if (comoJson) imprimirJson({ unidad });
  else console.log("Servicio de bots instalado: va a arrancar al iniciar sesión.");
} else if (comando === "importar") {
  const bot = await importarBot({ origen: exigir(primero, "falta la carpeta del bot que llegó"), carpeta: exigir(values.carpeta, "falta --carpeta, donde va a trabajar"), reemplazar: values.reemplazar });
  if (comoJson) imprimirJson(await instantaneaDeBot(bot, await estadoServicio()));
  else console.log(`Bot ${bot.id} listo en esta máquina; trabaja en ${bot.carpeta}.`);
} else if (comando === "apartar") {
  const guardado = await apartarBot(exigir(primero, "falta el id del bot"));
  if (comoJson) imprimirJson({ guardado });
  else console.log(`El bot ${primero} ya no corre en esta máquina; quedó guardado en ${guardado}.`);
} else if (comando === "desinstalar") {
  await desinstalarServicio();
  console.log("Servicio de bots desinstalado.");
} else if (comando === "correr") {
  const soltar = await tomarLockDeBots();
  if (!soltar) {
    console.error("ya hay un proceso de bots corriendo");
    process.exitCode = 1;
  } else {
    try {
      const servicio = correrBots();
      console.log("Bots prendidos. Ctrl+C para cortar.");
      await new Promise<void>((resolver) => {
        const parar = () => {
          servicio.detener();
          resolver();
        };
        process.once("SIGINT", parar);
        process.once("SIGTERM", parar);
      });
      // La vuelta en curso sigue escribiendo la cola de disparos: soltar el candado acá dejaría
      // arrancar a otro proceso contra los mismos archivos.
      await servicio.listo();
    } finally {
      await soltar();
    }
  }
} else if (comando === "webhook") {
  const puerto = Number(values.puerto ?? "4890");
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) error("--puerto debe ser un número entre 1 y 65535");
  const host = values.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") console.warn("Aviso: exponelo solo detrás de un túnel o nginx; lo más seguro es escuchar en 127.0.0.1.");
  const servidor = await escucharWebhook({ puerto, host });
  console.log(`Webhook de bots escuchando en http://${host}:${puerto}. Ctrl+C para cortar.`);
  await new Promise<void>((resolver) => {
    const parar = () => { servidor.close(() => resolver()); };
    process.once("SIGINT", parar);
    process.once("SIGTERM", parar);
  });
} else error(`no conozco «${comando}»`);

await pausa(0);
