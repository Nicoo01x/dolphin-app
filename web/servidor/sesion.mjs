// El ingreso al panel: una sola persona (Nico), una contraseña.
//
// La contraseña no vive en el servidor: vive su hash scrypt (`DOLPHIN_ADMIN_CLAVE`, formato
// `scrypt:<sal hex>:<hash hex>`, sin `$` para que systemd no lo lea como variable; lo arma
// `node servidor/clave.mjs`). La sesión es una cookie firmada con HMAC (`DOLPHIN_ADMIN_SECRETO`):
// `<vence en ms>.<época>.<firma>`. La época vive en la base y «Salir» la sube: así una cookie
// copiada deja de valer en cuanto Nico sale, y no sólo cuando vence.

import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "dolphin_admin";
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;
/** Con menos, una cookie robada alcanza para sacar el secreto por fuerza bruta sin tocar el servidor. */
export const LARGO_MINIMO_DEL_SECRETO = 32;

export function hashDeClave(clave, sal = randomBytes(16)) {
  const hash = scryptSync(clave, sal, 32);
  return `scrypt:${sal.toString("hex")}:${hash.toString("hex")}`;
}

/** Asíncrona a propósito: el scrypt sincrónico congelaba el servicio en cada intento de ingreso. */
export async function claveCorrecta(clave, guardado) {
  if (typeof clave !== "string" || !clave || clave.length > 200 || typeof guardado !== "string") return false;
  const [tipo, salHex, hashHex] = guardado.split(":");
  if (tipo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await new Promise((resolver, rechazar) =>
    scrypt(clave, Buffer.from(salHex, "hex"), esperado.length, (error, hash) => (error ? rechazar(error) : resolver(hash))),
  );
  return timingSafeEqual(esperado, calculado);
}

const firmar = (texto, secreto) => createHmac("sha256", secreto).update(texto).digest("base64url");

export function crearSesion(secreto, epoca = 0, ahora = Date.now()) {
  const datos = `${ahora + DURACION_MS}.${epoca}`;
  return `${datos}.${firmar(datos, secreto)}`;
}

export function sesionValida(valor, secreto, epoca = 0, ahora = Date.now()) {
  if (typeof valor !== "string" || !secreto) return false;
  const [vence, epocaCookie, firma] = valor.split(".");
  if (!vence || !firma || !/^\d+$/.test(vence) || !/^\d+$/.test(epocaCookie ?? "")) return false;
  const esperada = Buffer.from(firmar(`${vence}.${epocaCookie}`, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return false;
  return Number(vence) > ahora && Number(epocaCookie) === epoca;
}

export function leerCookie(cabecera, nombre) {
  for (const parte of String(cabecera || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return undefined;
      }
    }
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
