// El ingreso al panel: una sola persona (Nico), una contraseña.
//
// La contraseña no vive en el servidor: vive su hash scrypt (`DOLPHIN_ADMIN_CLAVE`, formato
// `scrypt:<sal hex>:<hash hex>`, sin `$` para que systemd no lo lea como variable; lo arma
// `node servidor/clave.mjs`). La sesión es una cookie firmada
// con HMAC (`DOLPHIN_ADMIN_SECRETO`): `<vence en ms>.<firma>`. No hay tabla de sesiones; cambiar el
// secreto cierra todas.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "dolphin_admin";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashDeClave(clave, sal = randomBytes(16)) {
  const hash = scryptSync(clave, sal, 32);
  return `scrypt:${sal.toString("hex")}:${hash.toString("hex")}`;
}

export function claveCorrecta(clave, guardado) {
  if (typeof clave !== "string" || !clave || typeof guardado !== "string") return false;
  const [tipo, salHex, hashHex] = guardado.split(":");
  if (tipo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = scryptSync(clave, Buffer.from(salHex, "hex"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

const firmar = (texto, secreto) => createHmac("sha256", secreto).update(texto).digest("base64url");

export function crearSesion(secreto, ahora = Date.now()) {
  const vence = String(ahora + DURACION_MS);
  return `${vence}.${firmar(vence, secreto)}`;
}

export function sesionValida(valor, secreto, ahora = Date.now()) {
  if (typeof valor !== "string" || !secreto) return false;
  const [vence, firma] = valor.split(".");
  if (!vence || !firma || !/^\d+$/.test(vence)) return false;
  const esperada = Buffer.from(firmar(vence, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;
  return Number(vence) > ahora;
}

export function leerCookie(cabecera, nombre) {
  for (const parte of String(cabecera || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** `segura: false` sólo para probar en http://127.0.0.1; en el VPS siempre va con Secure. */
export function cookieDeSesion(valor, { segura = true } = {}) {
  const partes = [`${COOKIE}=${encodeURIComponent(valor)}`, "Path=/api/admin", "HttpOnly", "SameSite=Strict"];
  partes.push(`Max-Age=${Math.floor(DURACION_MS / 1000)}`);
  if (segura) partes.push("Secure");
  return partes.join("; ");
}

export function cookieVencida({ segura = true } = {}) {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${segura ? "; Secure" : ""}`;
}
