// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DIAS_DE_LA_VUELTA,
  NOMBRE_DE_AGENTE,
  porcentajeDeCorrecciones,
  tarjetaParaCompartir,
  wrapped,
  type Wrapped,
} from "./nucleo/wrapped.js";
import { C, negrita, pintar, tabla, titulo } from "./salida.js";

/**
 * dolphin wrapped [--repo X] [--dias 30] [--tarjeta] [--json]
 *
 * La vuelta del mes: cuántas veces le corregiste cosas a tu agente, qué le
 * repetiste más y cuántas de esas correcciones se pueden volver chequeos del
 * portón ahora mismo. Sale de lo que ya está en tu máquina —lo que escribiste
 * en Claude Code, Codex y Gemini—, no manda nada a ningún lado y no gasta un
 * token.
 *
 * Con --tarjeta imprime el resumen listo para pegar, solo con números: ni una
 * línea de código, ni un nombre de archivo, ni una palabra que escribiste.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    dias: { type: "string", default: String(DIAS_DE_LA_VUELTA) },
    tarjeta: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    ayuda: { type: "boolean", short: "h", default: false },
  },
});

function ayuda(): never {
  console.error(`
  dolphin wrapped · la vuelta del mes, con lo que ya está en tu máquina

  dolphin wrapped                 los últimos ${DIAS_DE_LA_VUELTA} días
  dolphin wrapped --dias 90       otra ventana
  dolphin wrapped --tarjeta       el resumen para compartir: solo números
  dolphin wrapped --json          todo, para otra herramienta
`);
  process.exit(1);
}

/** Cuántos comandos listos para pegar se imprimen: más que esto es una pared, y están todos en --json. */
const MUESTRA_DE_CHEQUEOS = 5;

const plural = (cuantos: number, una: string, varias: string) => `${cuantos} ${cuantos === 1 ? una : varias}`;

/** El comando que convierte una corrección en un verificador del portón, listo para pegar. */
const comoSeEnsena = (texto: string, patron: string) =>
  `dolphin recordar "${texto.replace(/"/g, '\\"')}" --patron "${patron.replace(/"/g, '\\"')}"`;

function imprimir(resumen: Wrapped): void {
  console.log(titulo("Dolphin Wrapped", `últimos ${plural(resumen.dias, "día", "días")}`));

  if (resumen.escritos === 0) {
    console.log("  Todavía no hay nada que mostrar: no encontré nada que le hayas escrito a Claude Code, Codex ni Gemini en esta ventana.");
    console.log("  Pedile algo y corregilo una vez: esta pantalla se llena sola, sin que configures nada.\n");
    if (resumen.sinFecha > 0) {
      console.log(`  ${pintar(`Sin fecha y por eso afuera de la cuenta: ${plural(resumen.sinFecha, "mensaje", "mensajes")}.`, C.tenue)}\n`);
    }
    return;
  }

  if (resumen.correcciones === 0) {
    console.log(`  Le escribiste ${plural(resumen.escritos, "vez", "veces")} y no tuviste que corregirlo ni una. Cuando pase, acá va a estar.\n`);
    return;
  }

  console.log(
    `  Le corregiste cosas a tu agente ${pintar(plural(resumen.correcciones, "vez", "veces"), C.amarillo, { negrita: true })}: ` +
      `el ${porcentajeDeCorrecciones(resumen)} % de las ${plural(resumen.escritos, "cosa", "cosas")} que le escribiste.`,
  );
  console.log(`  ${pintar("Esto ya estaba en tu máquina. Dolphin lo lee una vez y no se lo olvida más.", C.suave)}`);

  if (resumen.masRepetidas.length > 0) {
    const repetidas = resumen.masRepetidas.reduce((total, c) => total + c.veces, 0);
    console.log(titulo("Lo que más le repetiste", `${repetidas} de tus ${plural(resumen.correcciones, "corrección", "correcciones")}`));
    console.log(
      tabla(resumen.masRepetidas, [
        { titulo: "veces", valor: (c) => String(c.veces), derecha: true },
        { titulo: "corrección", valor: (c) => c.texto, elastica: true },
        {
          titulo: "",
          valor: (c) =>
            c.yaEstaba === true
              ? pintar("ya está en la memoria", C.verde)
              : c.patron !== undefined
                ? pintar("puede ser un chequeo", C.amarillo)
                : pintar("puede ser una regla", C.tenue),
        },
      ]),
    );
  } else {
    console.log(`\n  Ninguna se repitió todavía: cada corrección que escribiste fue distinta.`);
  }

  if (resumen.queSePuedenVerificar > 0) {
    const cuantas = resumen.queSePuedenVerificar;
    console.log(
      titulo(
        cuantas === 1 ? "1 corrección se puede volver un chequeo ahora mismo" : `${cuantas} correcciones se pueden volver chequeos ahora mismo`,
        "el portón las corta gratis, sin preguntarle a ningún modelo",
      ),
    );
    for (const c of resumen.verificables.slice(0, MUESTRA_DE_CHEQUEOS)) console.log(`    ${comoSeEnsena(c.texto, c.patron!)}`);
    if (resumen.verificables.length > MUESTRA_DE_CHEQUEOS) {
      console.log(`    ${pintar(`y ${resumen.verificables.length - MUESTRA_DE_CHEQUEOS} más: dolphin wrapped --json`, C.tenue)}`);
    }
  }

  const agentes = Object.entries(NOMBRE_DE_AGENTE).flatMap(([agente, nombre]) => {
    const cuantas = resumen.porAgente[agente];
    return cuantas ? [`${nombre} ${negrita(String(cuantas))}`] : [];
  });
  console.log("");
  if (agentes.length > 0) console.log(`  Por agente: ${agentes.join(pintar(" · ", C.tenue))}`);
  if (resumen.yaEnLaMemoria > 0) {
    console.log(`  La memoria de este repo ya tiene ${resumen.yaEnLaMemoria} de estas: esas las respeta sin que se las digas.`);
  }
  if (resumen.sinFecha > 0) {
    console.log(`  ${pintar(`Sin fecha y por eso afuera de la cuenta: ${plural(resumen.sinFecha, "mensaje", "mensajes")}.`, C.tenue)}`);
  }
  console.log(`  ${pintar("Para compartirla: dolphin wrapped --tarjeta", C.tenue)}\n`);
}

try {
  if (values.ayuda) ayuda();
  const dias = Number.parseInt(values.dias ?? String(DIAS_DE_LA_VUELTA), 10);
  if (!Number.isFinite(dias) || dias < 1 || dias > 3_650) {
    console.error(`\n  --dias tiene que ser un número de 1 a 3650 (me pasaste «${values.dias}»).\n`);
    process.exit(1);
  }
  const resumen = await wrapped(resolve(values.repo ?? process.cwd()), undefined, new Date(), dias);
  if (values.json) console.log(JSON.stringify(resumen, null, 2));
  else if (values.tarjeta) console.log(tarjetaParaCompartir(resumen));
  else imprimir(resumen);
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
