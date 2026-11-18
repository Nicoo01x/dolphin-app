// Un tope de pedidos por IP y por puerta, para que nadie llene la base mandando basura.
//
// Ventana fija en memoria: si el servicio se reinicia, se reinicia el conteo. Alcanza: el riesgo es
// un script que manda mil reportes, no un ataque distribuido.

export function crearLimitador({ maximo, ventanaMs, ahora = Date.now }) {
  const cuentas = new Map();
  return function permitir(clave) {
    const t = ahora();
    const c = cuentas.get(clave);
    if (!c || t - c.desde >= ventanaMs) {
      cuentas.set(clave, { desde: t, n: 1 });
      if (cuentas.size > 10_000) limpiar(t);
      return true;
    }
    c.n += 1;
    return c.n <= maximo;
  };
  function limpiar(t) {
    for (const [k, c] of cuentas) if (t - c.desde >= ventanaMs) cuentas.delete(k);
  }
}

/** La IP real: Caddy la pone en X-Forwarded-For; sólo se le cree si el pedido viene de loopback. */
export function ipDe(pedido) {
  const directa = pedido.socket?.remoteAddress ?? "";
  const deLoopback = directa === "127.0.0.1" || directa === "::1" || directa === "::ffff:127.0.0.1";
  const reenviada = String(pedido.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return deLoopback && reenviada ? reenviada : directa;
}
