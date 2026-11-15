import type { ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * El transporte de ACP (Agent Client Protocol): JSON-RPC 2.0 por stdio, un mensaje por línea.
 *
 * No es LSP: no hay cabeceras `Content-Length`. Cada mensaje es una línea de JSON sin saltos
 * adentro, en UTF-8. El agente escribe SOLO mensajes del protocolo en su salida; lo que tenga para
 * contar va por el error estándar.
 *
 * Es bidireccional sobre el mismo par de tuberías: el agente también nos pide cosas a nosotros
 * (permiso para una herramienta, leer o escribir un archivo), así que al leer hay que distinguir
 * tres cosas: la respuesta a algo que pedimos (viene con nuestro `id`), un pedido del agente
 * (trae `method` e `id`) y un aviso (trae `method` y no trae `id`).
 */

export interface Mensaje {
  readonly jsonrpc: "2.0";
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { code: number; message: string; data?: unknown };
}

/** Lo que atiende los pedidos del agente. Devolver un valor contesta; tirar contesta con error. */
export type Atiende = (metodo: string, params: unknown) => Promise<unknown>;

/** Un método que el agente pidió y nosotros no tenemos. */
export class MetodoDesconocido extends Error {
  readonly codigo = -32601;
  constructor(metodo: string) {
    super(`este cliente no implementa «${metodo}»`);
    this.name = "MetodoDesconocido";
  }
}

export class Conexion {
  #proceso: ChildProcessWithoutNullStreams;
  #atiende: Atiende;
  #alAvisar: (metodo: string, params: unknown) => void;
  #pendientes = new Map<number, { listo: (v: unknown) => void; falla: (e: Error) => void }>();
  #siguienteId = 0;
  #resto = "";
  #cerrada: Error | undefined;

  constructor(proceso: ChildProcessWithoutNullStreams, atiende: Atiende, alAvisar: (metodo: string, params: unknown) => void) {
    this.#proceso = proceso;
    this.#atiende = atiende;
    this.#alAvisar = alAvisar;
    proceso.stdout.setEncoding("utf8");
    proceso.stdout.on("data", (trozo: string) => this.#leer(trozo));
    proceso.on("close", (codigo) => this.#cortar(new Error(`el agente se cerró con código ${codigo}`)));
    proceso.on("error", (error) => this.#cortar(error));
    // Una tubería rota mientras escribimos no puede tirar el proceso entero: lo dirá el close.
    proceso.stdin.on("error", () => {});
  }

  /** Le pide algo al agente y espera su respuesta. */
  pedir(metodo: string, params: unknown): Promise<unknown> {
    if (this.#cerrada) return Promise.reject(this.#cerrada);
    const id = this.#siguienteId++;
    return new Promise((listo, falla) => {
      this.#pendientes.set(id, { listo, falla });
      this.#escribir({ jsonrpc: "2.0", id, method: metodo, params });
    });
  }

  /** Le avisa algo al agente. Un aviso no lleva id y no se contesta nunca. */
  avisar(metodo: string, params: unknown): void {
    if (this.#cerrada) return;
    this.#escribir({ jsonrpc: "2.0", method: metodo, params });
  }

  #escribir(mensaje: Mensaje): void {
    // Sin saltos de línea adentro: el salto es lo que separa un mensaje del siguiente.
    this.#proceso.stdin.write(`${JSON.stringify(mensaje)}\n`);
  }

  #leer(trozo: string): void {
    this.#resto += trozo;
    for (;;) {
      const corte = this.#resto.indexOf("\n");
      if (corte === -1) return;
      const linea = this.#resto.slice(0, corte).trim();
      this.#resto = this.#resto.slice(corte + 1);
      if (linea === "") continue;
      let mensaje: Mensaje;
      try {
        mensaje = JSON.parse(linea) as Mensaje;
      } catch {
        // Una línea que no es JSON no es del protocolo. No se rompe la conexión por eso: hay
        // agentes que escupen una línea suelta en la salida antes de arrancar.
        continue;
      }
      this.#atender(mensaje);
    }
  }

  #atender(mensaje: Mensaje): void {
    // Respuesta a algo nuestro.
    if (mensaje.id !== undefined && mensaje.method === undefined) {
      const pendiente = this.#pendientes.get(Number(mensaje.id));
      if (!pendiente) return;
      this.#pendientes.delete(Number(mensaje.id));
      if (mensaje.error) pendiente.falla(Object.assign(new Error(mensaje.error.message), { codigo: mensaje.error.code }));
      else pendiente.listo(mensaje.result);
      return;
    }
    if (!mensaje.method) return;
    // Un aviso: no se contesta.
    if (mensaje.id === undefined) {
      this.#alAvisar(mensaje.method, mensaje.params);
      return;
    }
    // Un pedido del agente.
    const id = mensaje.id;
    void this.#atiende(mensaje.method, mensaje.params).then(
      (result) => this.#escribir({ jsonrpc: "2.0", id, result: result ?? {} }),
      (error: unknown) => {
        const codigo = error instanceof MetodoDesconocido ? error.codigo : -32603;
        this.#escribir({ jsonrpc: "2.0", id, error: { code: codigo, message: error instanceof Error ? error.message : String(error) } });
      },
    );
  }

  #cortar(error: Error): void {
    this.#cerrada ??= error;
    for (const pendiente of this.#pendientes.values()) pendiente.falla(error);
    this.#pendientes.clear();
  }

  /** Cierra la entrada del agente: es como se le dice que terminó (el protocolo no tiene un adiós). */
  terminar(): void {
    this.#proceso.stdin.end();
  }
}
