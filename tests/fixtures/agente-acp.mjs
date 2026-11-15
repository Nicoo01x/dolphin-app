#!/usr/bin/env node
// Un agente ACP de mentira, para probar el cliente de Dolphin sin gastar un centavo.
//
// Habla el protocolo de verdad: JSON-RPC 2.0 por stdio, un mensaje por línea. Hace lo que haría un
// agente real —pedir permiso, leer un archivo, escribir otro, contar su plan y lo que va haciendo—
// y lo que hace lo decide el texto del pedido, para que cada test pida lo que necesita probar:
//
//   «escribí <ruta>»      escribe ese archivo con «hecho por el agente de mentira»
//   «leé <ruta>»          lo lee con fs/read_text_file y lo repite en su respuesta
//   «escapate»            intenta escribir fuera del worktree (tiene que rebotar)
//   «sin permiso»         pide permiso antes de tocar nada
//   «gasté»               manda un usage_update con un costo
//   «planificá»           manda un plan de tres pasos
//   «negate»              termina con stopReason refusal
//   «terminal»            intenta usar terminal/create, que no anunciamos
//   «basura»              escribe una línea que no es JSON antes de contestar
import { createInterface } from "node:readline";

const escribir = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const avisar = (sessionId, update) => escribir({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });

let siguienteId = 1000;
const esperando = new Map();
/** Le pide algo al cliente y espera su respuesta. */
const pedirAlCliente = (method, params) =>
  new Promise((listo, falla) => {
    const id = siguienteId++;
    esperando.set(id, { listo, falla });
    escribir({ jsonrpc: "2.0", id, method, params });
  });

let sesion = 0;

createInterface({ input: process.stdin }).on("line", async (linea) => {
  if (linea.trim() === "") return;
  const m = JSON.parse(linea);

  // Una respuesta del cliente a algo que pedimos.
  if (m.id !== undefined && m.method === undefined) {
    const pendiente = esperando.get(m.id);
    if (!pendiente) return;
    esperando.delete(m.id);
    if (m.error) pendiente.falla(new Error(m.error.message));
    else pendiente.listo(m.result);
    return;
  }

  if (m.method === "initialize") {
    // Con ACP_DE_MENTIRA=version-rara contesta otra versión: es lo que prueba que el cliente
    // no sigue hablando con un agente que no lo va a entender.
    escribir({
      jsonrpc: "2.0",
      id: m.id,
      result: {
        protocolVersion: process.env.ACP_DE_MENTIRA === "version-rara" ? 99 : 1,
        // Con ACP_DE_MENTIRA=retoma dice que sabe retomar una sesión vieja.
        agentCapabilities: {
          loadSession: process.env.ACP_DE_MENTIRA === "retoma",
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
        },
        agentInfo: { name: "agente-de-mentira", version: "1.0.0" },
        authMethods: [],
      },
    });
    return;
  }

  if (m.method === "session/new") {
    // Con ACP_DE_MENTIRA=sin-login contesta como un agente al que no le iniciaste sesión.
    if (process.env.ACP_DE_MENTIRA === "sin-login") {
      escribir({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: "Authentication required" } });
      return;
    }
    escribir({ jsonrpc: "2.0", id: m.id, result: { sessionId: `sess_${++sesion}` } });
    return;
  }

  // Retomar una sesión vieja: antes de contestar manda su historial como avisos, igual que un
  // agente de verdad. Lo que llegue acá NO tiene que contar como lo que dijo en el turno nuevo.
  if (m.method === "session/load") {
    const { sessionId } = m.params;
    if (sessionId === "sesion-que-ya-no-esta") {
      escribir({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "no tengo esa sesión" } });
      return;
    }
    avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ESTO ES DEL HISTORIAL" } });
    escribir({ jsonrpc: "2.0", id: m.id, result: {} });
    return;
  }

  if (m.method === "session/cancel") {
    process.exit(0);
  }

  if (m.method === "session/prompt") {
    const { sessionId, prompt } = m.params;
    const texto = prompt.map((b) => b.text ?? "").join(" ");
    const parar = async (stopReason) => escribir({ jsonrpc: "2.0", id: m.id, result: { stopReason } });

    if (texto.includes("basura")) process.stdout.write("esto no es JSON y no tiene que romper nada\n");
    if (texto.includes("planificá")) {
      avisar(sessionId, {
        sessionUpdate: "plan",
        entries: [
          { content: "mirar el repo", priority: "high", status: "completed" },
          { content: "escribir el cambio", priority: "high", status: "in_progress" },
          { content: "probarlo", priority: "medium", status: "pending" },
        ],
      });
    }

    if (texto.includes("sin permiso")) {
      const r = await pedirAlCliente("session/request_permission", {
        sessionId,
        toolCall: { toolCallId: "call_1" },
        options: [
          { optionId: "rechazar", name: "No", kind: "reject_once" },
          { optionId: "dale", name: "Dale", kind: "allow_once" },
        ],
      });
      avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `permiso: ${JSON.stringify(r.outcome)}` } });
    }

    const leer = /leé (\S+)/.exec(texto);
    if (leer) {
      avisar(sessionId, { sessionUpdate: "tool_call", toolCallId: "call_leer", title: `Leyendo ${leer[1]}`, kind: "read", status: "in_progress" });
      const r = await pedirAlCliente("fs/read_text_file", { sessionId, path: leer[1] });
      avisar(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "call_leer", status: "completed" });
      avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `leí: ${r.content}` } });
    }

    const escribirArchivo = /escribí (\S+)/.exec(texto);
    if (escribirArchivo) {
      avisar(sessionId, { sessionUpdate: "tool_call", toolCallId: "call_escribir", title: `Escribiendo ${escribirArchivo[1]}`, kind: "edit", status: "in_progress" });
      await pedirAlCliente("fs/write_text_file", { sessionId, path: escribirArchivo[1], content: "hecho por el agente de mentira\n" });
      avisar(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "call_escribir", status: "completed" });
    }

    if (texto.includes("escapate")) {
      try {
        await pedirAlCliente("fs/write_text_file", { sessionId, path: "../../afuera.txt", content: "no tendría que llegar" });
        avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "me dejó escribir afuera" } });
      } catch (error) {
        avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `no me dejó: ${error.message}` } });
      }
    }

    if (texto.includes("terminal")) {
      try {
        await pedirAlCliente("terminal/create", { sessionId, command: "echo", args: ["hola"] });
        avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "me dejó usar la terminal" } });
      } catch (error) {
        avisar(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `sin terminal: ${error.message}` } });
      }
    }

    if (texto.includes("gasté")) {
      avisar(sessionId, { sessionUpdate: "usage_update", used: 53_000, size: 200_000, cost: { amount: 0.045, currency: "USD" } });
    }

    // En dos trozos, como un agente de verdad: el cliente los tiene que pegar.
    avisar(sessionId, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "Listo" } });
    avisar(sessionId, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: ", terminé." } });

    await parar(texto.includes("negate") ? "refusal" : "end_turn");
  }
});
