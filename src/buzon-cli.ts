import { parseArgs } from "node:util";
import { esperarEstado, enviarMensaje, leerMensajes } from "./equipo/buzon.js";

const { values, positionals } = parseArgs({
  options: {
    repo: { type: "string" },
    equipo: { type: "string" },
    hasta: { type: "string" },
    tope: { type: "string", default: "600" },
  },
  allowPositionals: true,
});

const repo = values.repo ?? process.env.DOLPHIN_REPO ?? process.cwd();
const equipo = values.equipo ?? process.env.DOLPHIN_EQUIPO;
const companero = process.env.DOLPHIN_COMPANERO;

function exigirEntorno(): { equipo: string; companero: string } {
  if (!equipo || !companero) throw new Error("el buzón necesita DOLPHIN_EQUIPO y DOLPHIN_COMPANERO");
  return { equipo, companero };
}

async function main(): Promise<void> {
  const accion = positionals[0];
  if (accion === "enviar") {
    const { equipo, companero } = exigirEntorno();
    const para = positionals[1];
    const texto = positionals.slice(2).join(" ");
    if (!para || !texto.trim()) throw new Error('usá: dolphin buzon enviar @compañero "texto"');
    const mensaje = await enviarMensaje(repo, equipo, companero, para, texto);
    if (!mensaje) throw new Error("no se pudo enviar: el remitente ya alcanzó los 5 mensajes o el texto está vacío");
    console.log(`Mensaje enviado a @${mensaje.para}.`);
    return;
  }
  if (accion === "leer") {
    const { equipo, companero } = exigirEntorno();
    const mensajes = await leerMensajes(repo, equipo, companero);
    if (mensajes.length === 0) {
      console.log("No hay mensajes nuevos.");
      return;
    }
    for (const mensaje of mensajes) console.log(`de ${mensaje.de}: ${mensaje.texto}`);
    return;
  }
  if (accion === "esperar") {
    const { equipo, companero } = exigirEntorno();
    const hasta = values.hasta === "libre" || values.hasta === "terminado" ? values.hasta : undefined;
    const para = positionals[1];
    if (!para || !hasta) throw new Error("usá: dolphin buzon esperar @compañero --hasta libre|terminado --tope 600");
    const tope = Number(values.tope);
    const llego = await esperarEstado(repo, equipo, para, hasta, Number.isFinite(tope) ? tope : 600);
    console.log(llego ? `@${para.replace(/^@/, "")} está ${hasta}.` : `Se agotó el tope esperando a @${para.replace(/^@/, "")}.`);
    if (!llego) process.exitCode = 2;
    return;
  }
  throw new Error("usá: dolphin buzon enviar|leer|esperar …");
}

await main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

