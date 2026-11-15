import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { catalogoDeFases, lineasDeFases } from "./nucleo/fases.js";

/**
 * `dolphin fases`: qué comprueba el portón de ESTE repo.
 *
 * Es el catálogo que le faltaba al portón extensible. Mientras las fases eran
 * las de Dolphin más los scripts de npm, saber qué corría era mirar el
 * package.json; con fases de terceros declaradas en un archivo, hace falta un
 * lugar que las junte y diga de dónde salió cada una.
 *
 * Dice lo mismo que `dolphin motores` de los motores: nombre, de dónde viene,
 * qué hace, cuánto cuesta y si hoy corre. Y lo que no corre va igual, con el
 * motivo al lado: un módulo que no carga se descubre acá y no a los diez
 * minutos de una siembra.
 *
 * Ojo: listar las fases de terceros las CARGA (es la única forma de saber si
 * andan). En un repo clonado de afuera no se cargan, igual que en el portón.
 */

const { values } = parseArgs({
  options: { repo: { type: "string", default: process.cwd() } },
  allowPositionals: true,
});

const repo = resolve(values.repo ?? process.cwd());
const { filas, avisos } = await catalogoDeFases(repo);
console.log(lineasDeFases(filas, avisos).join("\n"));
