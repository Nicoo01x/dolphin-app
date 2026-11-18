#!/usr/bin/env node
// Arma el hash de la contraseña del panel para DOLPHIN_ADMIN_CLAVE.
//
//   node servidor/clave.mjs "<contraseña>"     imprime el hash
//   node servidor/clave.mjs --nueva            inventa una contraseña, imprime las dos cosas y un secreto
//
// La contraseña nunca se guarda en el servidor: sólo el hash.

import { randomBytes } from "node:crypto";
import { hashDeClave } from "./sesion.mjs";

const arg = process.argv[2];
if (!arg) {
  console.error('Uso: node servidor/clave.mjs "<contraseña>" | --nueva');
  process.exit(1);
}
if (arg === "--nueva") {
  const clave = randomBytes(15).toString("base64url");
  console.log(`clave=${clave}`);
  console.log(`DOLPHIN_ADMIN_CLAVE=${hashDeClave(clave)}`);
  console.log(`DOLPHIN_ADMIN_SECRETO=${randomBytes(32).toString("base64url")}`);
} else {
  console.log(hashDeClave(arg));
}
