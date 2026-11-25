// Un tope de pedidos por IP y por puerta, para que nadie llene la base mandando basura.
//
// Ventana fija en memoria: si el servicio se reinicia, se reinicia el conteo. Alcanza: el riesgo es
// un script que manda mil reportes, no un ataque distribuido.

const MAXIMO_DE_CLAVES = 20_000;

export function crearLimitador({ maximo, ventanaMs, ahora = Date.now }) {
  const cuentas = new Map();
  return function permitir(clave) {
    const t = ahora();
    const c = cuentas.get(clave);
    if (!c || t - c.desde >= ventanaMs) {
      if (cuentas.size >= MAXIMO_DE_CLAVES) limpiar(t);
      cuentas.set(clave, { desde: t, n: 1 });
      return true;
    }
    c.n += 1;
    return c.n <= maximo;
  };
  function limpiar(t) {
    for (const [k, c] of cuentas) if (t - c.desde >= ventanaMs) cuentas.delete(k);
    // Si todas siguen vigentes (muchas IP distintas en una ventana), se vacía: el Map no crece sin
    // tope y cada alta no se vuelve lenta. Se pierde el conteo de esa ventana, que es lo barato.
    if (cuentas.size >= MAXIMO_DE_CLAVES) cuentas.clear();
  }
}

/**
 * La IP real. Caddy pone la del cliente en X-Forwarded-For (`header_up X-Forwarded-For
 * {remote_host}` en el Caddyfile, que pisa lo que mande el cliente); sólo se le cree si el pedido
 * viene de loopback. Una IPv6 se cuenta por su /64: una sola conexión casera tiene millones de
 * direcciones de ese bloque, y contarlas por separado era tener el limitador abierto.
 */
export function ipDe(pedido) {
  const directa = pedido.socket?.remoteAddress ?? "";
  const deLoopback = directa === "127.0.0.1" || directa === "::1" || directa === "::ffff:127.0.0.1";
  const reenviada = String(pedido.headers["x-forwarded-for"] ?? "").split(",").pop().trim();
  return agrupar(deLoopback && reenviada ? reenviada : directa);
}

export function agrupar(ip) {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip.replace(/^::ffff:/, "");
  const [cabeza, cola = ""] = ip.split("::");
  const grupos = cabeza ? cabeza.split(":") : [];
  const resto = cola ? cola.split(":") : [];
  const completos = [...grupos, ...Array(Math.max(0, 8 - grupos.length - resto.length)).fill("0"), ...resto];
  return `${completos.slice(0, 4).join(":")}::/64`;
}
