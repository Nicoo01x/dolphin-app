import type { IncomingMessage, ServerResponse } from "node:http";
import { cuerpoDeLaConsola, json } from "./servidor-comun.js";
import { esperar, soltar } from "./nucleo/tarjetas-espera.js";
import { buscarTarjeta, columnaDe, comentarTarjeta, crearTarjeta, editarTarjeta, leerTablero, moverTarjeta, type TipoDeTarjeta } from "./nucleo/tarjetas.js";

/**
 * El tablero en la consola (ver nucleo/tarjetas.ts):
 *   GET  /api/tablero                         todas las tarjetas
 *   POST /api/tablero                         {titulo, detalle?, terminado?, tipo?, quien?}
 *   POST /api/tablero/<id>/mover              {columna}
 *   POST /api/tablero/<id>/editar             {titulo?, detalle?, terminado?, quien?, tipo?}
 *   POST /api/tablero/<id>/comentar           {texto}
 *   POST /api/tablero/<id>/esperar            {otra}: no arranca hasta que la otra esté en Hecho
 *   POST /api/tablero/<id>/soltar             {otra}
 * Lo que escribe pide el pase de la consola, como todo lo demás.
 */
export async function rutaDelTablero(ruta: string, pedido: IncomingMessage, respuesta: ServerResponse, repo: string, token: string): Promise<boolean> {
  if (ruta !== "/api/tablero" && !ruta.startsWith("/api/tablero/")) return false;
  const texto = (x: unknown) => (typeof x === "string" ? x : undefined);
  try {
    if (ruta === "/api/tablero" && pedido.method === "GET") {
      json(respuesta, 200, { tarjetas: await leerTablero(repo) });
      return true;
    }
    if (pedido.method !== "POST") {
      json(respuesta, 405, { ok: false, porQue: "el tablero se lee con GET y se cambia con POST" });
      return true;
    }
    const datos = await cuerpoDeLaConsola(pedido, respuesta, token);
    if (!datos) return true;
    if (ruta === "/api/tablero") {
      const tipo = (["tarea", "bug", "idea"] as const).find((t) => t === datos.tipo) as TipoDeTarjeta | undefined;
      const columna = texto(datos.columna) ? columnaDe(texto(datos.columna)!) : undefined;
      const tarjeta = await crearTarjeta(repo, {
        titulo: texto(datos.titulo) ?? "",
        ...(texto(datos.detalle) ? { detalle: texto(datos.detalle)! } : {}),
        ...(texto(datos.terminado) ? { terminado: texto(datos.terminado)! } : {}),
        ...(texto(datos.quien) ? { quien: texto(datos.quien)! } : {}),
        ...(tipo ? { tipo } : {}),
        ...(columna ? { columna } : {}),
      });
      json(respuesta, 201, { ok: true, tarjeta });
      return true;
    }
    const [, id = "", accion = ""] = /^\/api\/tablero\/([^/]+)\/([a-z]+)$/.exec(ruta) ?? [];
    const tarjeta = await buscarTarjeta(repo, decodeURIComponent(id));
    if (accion === "mover") {
      const columna = columnaDe(texto(datos.columna) ?? "");
      if (!columna) {
        json(respuesta, 400, { ok: false, porQue: "esa columna no existe" });
        return true;
      }
      json(respuesta, 200, { ok: true, tarjeta: await moverTarjeta(repo, tarjeta.id, columna) });
      return true;
    }
    if (accion === "editar") {
      const tipo = (["tarea", "bug", "idea"] as const).find((t) => t === datos.tipo);
      const edicion = {
        ...(texto(datos.titulo) !== undefined ? { titulo: texto(datos.titulo)! } : {}),
        ...(texto(datos.detalle) !== undefined ? { detalle: texto(datos.detalle)! } : {}),
        ...(texto(datos.terminado) !== undefined ? { terminado: texto(datos.terminado)! } : {}),
        ...(texto(datos.quien) !== undefined ? { quien: texto(datos.quien)! } : {}),
        ...(tipo ? { tipo } : {}),
      };
      json(respuesta, 200, { ok: true, tarjeta: await editarTarjeta(repo, tarjeta.id, edicion) });
      return true;
    }
    if (accion === "comentar") {
      json(respuesta, 200, { ok: true, tarjeta: await comentarTarjeta(repo, tarjeta.id, texto(datos.texto) ?? "") });
      return true;
    }
    if (accion === "esperar" || accion === "soltar") {
      const otra = texto(datos.otra) ?? "";
      json(respuesta, 200, { ok: true, tarjeta: await (accion === "esperar" ? esperar : soltar)(repo, tarjeta.id, otra) });
      return true;
    }
    json(respuesta, 404, { ok: false, porQue: "eso no se le puede hacer a una tarjeta" });
  } catch (error) {
    // Lo que falla por lo que se pidió (sin título, una tarjeta que no está) es un 400 con el porqué.
    json(respuesta, 400, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
  }
  return true;
}
