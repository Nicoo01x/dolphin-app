import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { argumentosDeClaude, leerSalida } from "./agentes/claude.js";
import { correrConPrompt, prepararComando } from "./agentes/ejecutar.js";
import { conCuentaDeClaude, esLimiteDeUso } from "./nucleo/cuentas.js";
import { carpetaDeClaudeCode, mensajesDeClaudeCode } from "./nucleo/buscar-memorias.js";
import { gitValor } from "./nucleo/git.js";
import type { Avisador } from "./nucleo/avisos.js";
import { armarPaqueteDeTraspaso, correrCodexDeRespaldo, limpiarSecretos } from "./traspaso.js";
import { antesDeArrancar, casaDeCupo } from "./nucleo/cupo.js";
import { pasarALaSiguiente } from "./nucleo/cuentas.js";
export { limpiarSecretos } from "./traspaso.js";

/**
 * Seguir solo: tomar una sesión de Claude Code que dejaste por la mitad y empujarla hasta que
 * termine, sin que nadie tenga que escribirle «seguí» cada vez que corta el turno. Al terminar
 * avisa —por el sistema y por Telegram— con el link de la app levantada para mirarla.
 *
 * Sale de lo que más se repetía en las charlas de Nico (28/10): 35 «seguí / no pares / hacé todo»
 * en 12 días, 32 «¿ya está? / avisame» y 19 «dame el link / prendeme la app».
 *
 * La sesión se retoma en una copia (`--fork-session`): la terminal que la tiene abierta no se pisa.
 */
export interface SesionDeClaudeCode {
  readonly id: string;
  readonly modificada: Date;
  /** Lo último que pidió la persona en esa sesión: para reconocerla en la lista. */
  readonly ultimoPedido: string;
}
/** Las sesiones de Claude Code de un repo, la más reciente primero. */
export async function sesionesDelRepo(repo: string, casa = homedir()): Promise<SesionDeClaudeCode[]> {
  const carpeta = carpetaDeClaudeCode(repo, casa);
  const archivos = (await readdir(carpeta).catch(() => [] as string[])).filter((a) => a.endsWith(".jsonl"));
  const sesiones = await Promise.all(
    archivos.map(async (archivo) => {
      const ruta = join(carpeta, archivo);
      const [info, texto] = await Promise.all([stat(ruta), readFile(ruta, "utf8").catch(() => "")]);
      // Son solo los mensajes de la persona (ver buscar-memorias.ts).
      // El resumen que Claude Code pega al retomar una charla sin contexto no es un pedido tuyo.
      const pedidos = mensajesDeClaudeCode(texto).filter((m) => !/^This session is being continued from a previous conversation/.test(m.texto));
      return {
        id: archivo.slice(0, -".jsonl".length),
        modificada: info.mtime,
        ultimoPedido: pedidos.at(-1)?.texto.trim().slice(0, 140) ?? "",
        // Las que abre Dolphin (o cualquier `claude -p`) vienen marcadas «sdk-cli»: no son una charla tuya
        // que dejaste por la mitad, y «la última» no puede ser el planificador de una siembra.
        deUnPrograma: /"entrypoint"\s*:\s*"sdk-/.test(texto.slice(0, 20_000)),
        conPedidos: pedidos.length > 0,
      };
    }),
  );
  return sesiones
    .filter((s) => !s.deUnPrograma && s.conPedidos)
    .map(({ id, modificada, ultimoPedido }) => ({ id, modificada, ultimoPedido }))
    .sort((a, b) => b.modificada.getTime() - a.modificada.getTime());
}
export type EstadoDeVuelta = { readonly que: "termino" } | { readonly que: "necesita"; readonly que_falta: string } | { readonly que: "sigue" };

/** La última línea que pedimos que escriba: «ESTADO: TERMINADO», «ESTADO: NECESITO …» o «ESTADO: SIGO». */
export function estadoDe(texto: string): EstadoDeVuelta {
  const linea = texto.trim().split(/\r?\n/).reverse().find((l) => /ESTADO\s*:/i.test(l)) ?? "";
  if (/ESTADO\s*:\s*TERMINAD/i.test(linea)) return { que: "termino" };
  const necesita = /ESTADO\s*:\s*NECESITO\s*(.*)$/i.exec(linea);
  if (necesita) return { que: "necesita", que_falta: necesita[1]!.trim() || "algo que solo podés dar vos" };
  return { que: "sigue" };
}
const REGLA_DE_ESTADO = [
  "Cuando esté terminado y verificado de verdad (tests, typecheck, lo que corresponda), la última línea de tu respuesta es exactamente: ESTADO: TERMINADO",
  "Si te falta algo que solo puede dar la persona (una clave, una cuenta, una decisión de negocio), la última línea es: ESTADO: NECESITO <qué>",
  "Si no, seguí trabajando todo lo que puedas en este turno y terminá con: ESTADO: SIGO",
].join("\n");
export const PRIMER_PEDIDO = [
  "Seguí con lo que estabas haciendo en esta sesión hasta terminarlo del todo. No preguntes ni esperes confirmación: decidí lo razonable y anotalo.",
  "No hagas push, deploy ni nada que salga de esta máquina.",
  REGLA_DE_ESTADO,
].join("\n\n");
export const PEDIDO_DE_VUELTA = ["Seguí.", REGLA_DE_ESTADO].join("\n\n");

export interface CorridaDeClaude {
  readonly texto: string;
  readonly sesion?: string;
  readonly error?: string;
  readonly costo?: number;
}
/** Una vuelta con el CLI de Claude, retomando `sesion`. Los tests la inyectan: acá no se gasta nada. */
export type CorrerVuelta = (pedido: { readonly repo: string; readonly sesion: string; readonly bifurcar: boolean; readonly prompt: string; readonly prohibidos: readonly string[]; readonly senal?: AbortSignal }) => Promise<CorridaDeClaude>;

export const correrVueltaConClaude: CorrerVuelta = async ({ repo, sesion, bifurcar, prompt, prohibidos, senal }) => {
  const args = argumentosDeClaude({ permisos: "todo", prohibidos }, undefined, sesion);
  // Va antes de los prohibidos: --disallowedTools se lleva todo lo que le sigue.
  const corte = args.indexOf("--disallowedTools");
  if (bifurcar) args.splice(corte >= 0 ? corte : args.length, 0, "--fork-session");
  const listo = prepararComando("claude", args);
  if (!listo) throw new Error("no encontré «claude» en el PATH");
  return conCuentaDeClaude(
    async (entorno) => {
      const corrida = await correrConPrompt(listo.cmd, listo.args, prompt, repo, 45 * 60_000, entorno, listo.verbatim, undefined, senal);
      const leido = leerSalida(corrida.salida) as ReturnType<typeof leerSalida> & { session_id?: string; subtype?: string };
      if (leido.is_error || leido.subtype?.startsWith("error")) return { texto: "", error: leido.result || corrida.error || `Claude cortó (${leido.subtype ?? "error"})` };
      return { texto: leido.result ?? "", ...(leido.session_id ? { sesion: leido.session_id } : {}), ...(typeof leido.total_cost_usd === "number" ? { costo: leido.total_cost_usd } : {}) };
    },
    (resultado) => Boolean(resultado.error && esLimiteDeUso(resultado.error)),
  );
};

export interface OpcionesDeSeguir {
  readonly repo: string;
  readonly sesion: string;
  /** Cuántas vueltas como mucho: cada una es un turno entero de Claude. */
  readonly vueltas: number;
  readonly prohibidos: readonly string[];
  readonly correr?: CorrerVuelta;
  readonly avisar: Avisador;
  /** Levanta la app cuando termina y devuelve su link (o nada si el repo no dice cómo). */
  readonly levantar?: () => Promise<string | undefined>;
  readonly contar?: (texto: string) => void;
  readonly senal?: AbortSignal;
  /** Codex por defecto si está instalado; «ninguno» deja el fallo en Claude. */
  readonly respaldo?: "codex" | "ninguno";
  /** Esperar el reinicio en vez de cortar cuando no hay alternativa. */
  readonly esperar?: boolean;
  readonly casa?: string;
  readonly esperarCupo?: (milisegundos: number) => Promise<void>;
  readonly correrRespaldo?: (pedido: { readonly repo: string; readonly prompt: string; readonly prohibidos: readonly string[]; readonly senal?: AbortSignal }) => Promise<CorridaDeClaude>;
  readonly disponibleCodex?: () => boolean;
  /** Se inyecta en tests; en producción toma el HEAD al entrar. */
  readonly base?: string;
  readonly correrGit?: (args: readonly string[], cwd: string) => Promise<string>;
  /** Umbrales opcionales: si no hay callback, el turno se frena y queda esperando «seguí». */
  readonly avisoUsd?: number;
  readonly avisoCorridas?: number;
  readonly topeUsd?: number;
  readonly topeCorridas?: number;
  readonly autorizarGasto?: (aviso: string) => Promise<boolean>;
}

export interface ResultadoDeSeguir {
  readonly como: "termino" | "necesita" | "tope" | "fallo" | "cortado";
  readonly vueltas: number;
  readonly ultimo: string;
  readonly link?: string;
}

export async function seguir(opciones: OpcionesDeSeguir): Promise<ResultadoDeSeguir> {
  const correr = opciones.correr ?? correrVueltaConClaude;
  const contar = opciones.contar ?? (() => {});
  let sesion = opciones.sesion;
  let ultimo = "";
  let saltarCupoUnaVez = false;
  let gastoUsd = 0;
  let corridasGastadas = 0;
  let avisoAceptado = false;
  let costoAcumulado = 0;
  const base = opciones.base ?? (await gitValor(["rev-parse", "HEAD"], opciones.repo).catch(() => ""));
  for (let vuelta = 1; vuelta <= opciones.vueltas; vuelta++) {
    if (opciones.senal?.aborted) return { como: "cortado", vueltas: vuelta - 1, ultimo };
    const cupo = saltarCupoUnaVez ? { sigue: true as const } : await antesDeArrancar({ agente: "claude", largo: "largo", ahora: new Date(), casa: casaDeCupo(opciones.casa) });
    saltarCupoUnaVez = false;
    if (!cupo.sigue) {
      if (cupo.alternativa === "otra-cuenta" && pasarALaSiguiente()) {
        contar("Claude cambió a otra cuenta con cupo");
        saltarCupoUnaVez = true;
        vuelta--;
        continue;
      }
      if (cupo.alternativa === "codex" && opciones.respaldo !== "ninguno") {
        const paquete = await armarPaqueteDeTraspaso({ repo: opciones.repo, sesion, ultimo: ultimo || cupo.motivo, ...(base ? { base } : {}), ...(opciones.correrGit ? { correrGit: opciones.correrGit } : {}) });
        await opciones.avisar.avisar({ tipo: "espera", titulo: "Cambió de motor", texto: `Claude no arranca por cupo hasta ${cupo.hasta.toLocaleString("es-AR")}. Sigo con Codex.`, clave: `seguir:respaldo:${sesion}` });
        return seguirConCodex(opciones, paquete.texto, vuelta, ultimo);
      }
      if (opciones.esperar) {
        const milisegundos = Math.max(0, cupo.hasta.getTime() - Date.now());
        await (opciones.esperarCupo?.(milisegundos) ?? dormir(milisegundos, opciones.senal));
        vuelta--;
        continue;
      }
      await opciones.avisar.avisar({ tipo: "espera", titulo: "Dolphin no arrancó", texto: `Claude no tiene cupo hasta ${cupo.hasta.toLocaleString("es-AR")}. Reintentá con --esperar.`, clave: `seguir:cupo:${sesion}` });
      return { como: "fallo", vueltas: vuelta - 1, ultimo: cupo.motivo };
    }
    contar(`vuelta ${vuelta} de ${opciones.vueltas}`);
    const corrida = await correr({
      repo: opciones.repo,
      sesion,
      bifurcar: vuelta === 1,
      prompt: vuelta === 1 ? PRIMER_PEDIDO : PEDIDO_DE_VUELTA,
      prohibidos: opciones.prohibidos,
      ...(opciones.senal ? { senal: opciones.senal } : {}),
    });
    if (corrida.error) {
      const puedeRespaldar = esLimiteDeUso(corrida.error) && opciones.respaldo !== "ninguno" && (opciones.correrRespaldo || (opciones.disponibleCodex?.() ?? prepararComando("codex", []) !== undefined));
      if (puedeRespaldar) {
        const paquete = await armarPaqueteDeTraspaso({ repo: opciones.repo, sesion, ultimo: corrida.error, ...(base ? { base } : {}), ...(opciones.correrGit ? { correrGit: opciones.correrGit } : {}) });
        contar("Claude se quedó sin cupo: cambio de motor a Codex");
        await opciones.avisar.avisar({ tipo: "espera", titulo: "Cambió de motor", texto: "Claude se quedó sin cupo. Sigo con Codex; el paquete de traspaso está tratado como datos de afuera.", clave: `seguir:respaldo:${sesion}` });
        return seguirConCodex(opciones, paquete.texto, vuelta, ultimo);
      }
      await opciones.avisar.avisar({ tipo: "fallo", titulo: "Dolphin dejó de seguir", texto: corrida.error, clave: `seguir:fallo:${sesion}` });
      return { como: "fallo", vueltas: vuelta, ultimo: corrida.error };
    }
    // Desde la segunda vuelta se sigue la copia, no la sesión original.
    if (corrida.sesion) sesion = corrida.sesion;
    ultimo = corrida.texto;
    const costoInformado = typeof corrida.costo === "number" && Number.isFinite(corrida.costo) ? Math.max(0, corrida.costo) : 0;
    const costoDeEstaVuelta = costoInformado >= costoAcumulado ? costoInformado - costoAcumulado : costoInformado;
    costoAcumulado = costoInformado;
    gastoUsd += costoDeEstaVuelta;
    corridasGastadas++;
    const estado = estadoDe(corrida.texto);
    const tope = opciones.topeUsd !== undefined && gastoUsd >= opciones.topeUsd ? `llegó al tope de US$ ${opciones.topeUsd}` : opciones.topeCorridas !== undefined && corridasGastadas >= opciones.topeCorridas ? `llegó al tope de ${opciones.topeCorridas} corridas` : undefined;
    if (tope && estado.que === "sigue") {
      await opciones.avisar.avisar({ tipo: "fallo", titulo: "Tope de gasto", texto: tope, clave: `seguir:gasto:tope:${sesion}` });
      return { como: "fallo", vueltas: vuelta, ultimo: tope };
    }
    const aviso: string | undefined = !avisoAceptado ? (opciones.avisoUsd !== undefined && gastoUsd >= opciones.avisoUsd ? `cruzaste US$ ${opciones.avisoUsd}` : opciones.avisoCorridas !== undefined && corridasGastadas >= opciones.avisoCorridas ? `cruzaste ${opciones.avisoCorridas} corridas` : undefined) : undefined;
    if (aviso && estado.que === "sigue") {
      await opciones.avisar.avisar({ tipo: "espera", titulo: "Aviso de gasto", texto: `${aviso}. Respondé «seguí» para continuar.`, clave: `seguir:gasto:aviso:${sesion}` });
      avisoAceptado = await (opciones.autorizarGasto?.(aviso) ?? Promise.resolve(false));
      if (!avisoAceptado) return { como: "necesita", vueltas: vuelta, ultimo };
    }
    if (estado.que === "termino") {
      const link = await opciones.levantar?.().catch(() => undefined);
      await opciones.avisar.avisar({
        tipo: "termino",
        titulo: "Terminó",
        texto: [resumenDe(corrida.texto), link ? `Para mirarlo: ${link}` : ""].filter(Boolean).join("\n"),
        clave: `seguir:termino:${sesion}`,
      });
      return { como: "termino", vueltas: vuelta, ultimo, ...(link ? { link } : {}) };
    }
    if (estado.que === "necesita") {
      await opciones.avisar.avisar({ tipo: "espera", titulo: "Te necesita", texto: estado.que_falta, clave: `seguir:necesita:${sesion}` });
      return { como: "necesita", vueltas: vuelta, ultimo };
    }
  }
  await opciones.avisar.avisar({
    tipo: "espera",
    titulo: "Llegué al tope de vueltas",
    texto: `${opciones.vueltas} vueltas y todavía no dice que terminó. Lo último: ${resumenDe(ultimo)}`,
    clave: `seguir:tope:${sesion}`,
  });
  return { como: "tope", vueltas: opciones.vueltas, ultimo };
}

function dormir(milisegundos: number, senal?: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(resolver, milisegundos);
    senal?.addEventListener("abort", () => {
      clearTimeout(temporizador);
      resolver();
    }, { once: true });
  });
}

async function seguirConCodex(opciones: OpcionesDeSeguir, paquete: string, vueltaInicial: number, ultimo: string): Promise<ResultadoDeSeguir> {
  const correr = opciones.correrRespaldo ?? ((pedido) => correrCodexDeRespaldo(pedido).then((r) => ({ texto: r.texto, ...(r.error ? { error: r.error } : {}) })));
  let gastoUsd = 0;
  let corridasGastadas = 0;
  let avisoAceptado = false;
  for (let vuelta = vueltaInicial; vuelta <= opciones.vueltas; vuelta++) {
    if (opciones.senal?.aborted) return { como: "cortado", vueltas: vuelta - 1, ultimo };
    opciones.contar?.(`Codex · vuelta ${vuelta} de ${opciones.vueltas}`);
    const corrida = await correr({ repo: opciones.repo, prompt: vuelta === vueltaInicial ? `${paquete}\n\n${REGLA_DE_ESTADO}` : PEDIDO_DE_VUELTA, prohibidos: opciones.prohibidos, ...(opciones.senal ? { senal: opciones.senal } : {}) });
    if (corrida.error) {
      await opciones.avisar.avisar({ tipo: "fallo", titulo: "Dolphin dejó de seguir", texto: `Codex: ${corrida.error}`, clave: `seguir:codex-fallo:${opciones.repo}` });
      return { como: "fallo", vueltas: vuelta, ultimo: corrida.error };
    }
    ultimo = corrida.texto;
    const costo = "costo" in corrida && typeof corrida.costo === "number" ? corrida.costo : 0;
    gastoUsd += Number.isFinite(costo) ? Math.max(0, costo) : 0;
    corridasGastadas++;
    const tope = opciones.topeUsd !== undefined && gastoUsd >= opciones.topeUsd ? `llegó al tope de US$ ${opciones.topeUsd}` : opciones.topeCorridas !== undefined && corridasGastadas >= opciones.topeCorridas ? `llegó al tope de ${opciones.topeCorridas} corridas` : undefined;
    const estado = estadoDe(corrida.texto);
    if (tope && estado.que === "sigue") {
      await opciones.avisar.avisar({ tipo: "fallo", titulo: "Tope de gasto", texto: `Codex: ${tope}`, clave: `seguir:codex:gasto:tope:${opciones.repo}` });
      return { como: "fallo", vueltas: vuelta, ultimo: tope };
    }
    const aviso: string | undefined = !avisoAceptado ? (opciones.avisoUsd !== undefined && gastoUsd >= opciones.avisoUsd ? `cruzaste US$ ${opciones.avisoUsd}` : opciones.avisoCorridas !== undefined && corridasGastadas >= opciones.avisoCorridas ? `cruzaste ${opciones.avisoCorridas} corridas` : undefined) : undefined;
    if (aviso && estado.que === "sigue") {
      await opciones.avisar.avisar({ tipo: "espera", titulo: "Aviso de gasto", texto: `${aviso}. Respondé «seguí» para continuar.`, clave: `seguir:codex:gasto:aviso:${opciones.repo}` });
      avisoAceptado = await (opciones.autorizarGasto?.(aviso) ?? Promise.resolve(false));
      if (!avisoAceptado) return { como: "necesita", vueltas: vuelta, ultimo };
    }
    if (estado.que === "termino") {
      await opciones.avisar.avisar({ tipo: "termino", titulo: "Terminó con Codex", texto: resumenDe(corrida.texto), clave: `seguir:codex-termino:${opciones.repo}` });
      return { como: "termino", vueltas: vuelta, ultimo };
    }
    if (estado.que === "necesita") {
      await opciones.avisar.avisar({ tipo: "espera", titulo: "Te necesita", texto: `Con Codex: ${estado.que_falta}`, clave: `seguir:codex-necesita:${opciones.repo}` });
      return { como: "necesita", vueltas: vuelta, ultimo };
    }
  }
  await opciones.avisar.avisar({ tipo: "espera", titulo: "Llegué al tope de vueltas", texto: `Codex llegó al tope. Lo último: ${resumenDe(ultimo)}`, clave: `seguir:codex-tope:${opciones.repo}` });
  return { como: "tope", vueltas: opciones.vueltas, ultimo };
}

/** Lo que va en el aviso: el final de la respuesta sin la línea de estado, corto para el celular. */
export function resumenDe(texto: string): string {
  const sinEstado = texto.replace(/^.*ESTADO\s*:.*$/gim, "").trim();
  return sinEstado.length > 600 ? `…${sinEstado.slice(-600)}` : sinEstado || "(sin texto)";
}
