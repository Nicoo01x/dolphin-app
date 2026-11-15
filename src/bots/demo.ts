import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anotarHistorial, carpetaDeBots, crearBot, guardarHabilidad, recordarEnBot } from "./almacen.js";
import { plantilla } from "./plantillas.js";

/**
 * Una manada de ejemplo para la demo: tres bots con el motor de mentira, una charla corta cada uno,
 * algo aprendido y un pedido esperando el «dale». Así la pantalla Bots se ve como se ve usándola,
 * sin gastar un token. Va en la carpeta de bots que diga DOLPHIN_BOTS_DIR (la demo la pone adentro
 * de su repo de ejemplo).
 */
export async function sembrarBotsDeDemo(carpeta: string): Promise<void> {
  const hace = (min: number) => new Date(Date.now() - min * 60_000);
  const conPlantilla = (id: "vigia" | "parte" | "investigador") => {
    const p = plantilla(id)!;
    return { alma: p.alma, rutinas: p.rutinas, permiso: p.permiso, herramientas: p.herramientas };
  };

  // En la demo el Vigía pregunta antes de tocar (la plantilla es «leer»): así se ve el «dale» en acción.
  const vigia = await crearBot({ nombre: "Vigía", motor: "mentira", carpeta, ...conPlantilla("vigia"), permiso: "preguntar" });
  await anotarHistorial(vigia.id, "rutina", "Revisá el repo de tu carpeta y avisá solo si algo se rompió.", hace(48));
  await anotarHistorial(vigia.id, "bot", "Después del último commit se rompieron 2 tests de la tienda. Es el redondeo del IVA. ¿Lo arreglo?", hace(47));
  await writeFile(
    join(carpetaDeBots(), vigia.id, "pendiente.json"),
    JSON.stringify({ id: "demo-pendiente", mensaje: "Arreglá el redondeo del IVA que rompió los tests de la tienda.", quiere: "Cambiar el redondeo en src/precios.ts y correr los tests de la tienda.", creado: hace(47).toISOString() }) + "\n",
  );

  const parte = await crearBot({ nombre: "Parte", motor: "mentira", carpeta, ...conPlantilla("parte") });
  await anotarHistorial(parte.id, "rutina", "Prepará el resumen de lo que pasó ayer en tus repos y dejalo como parte.", hace(120));
  await anotarHistorial(parte.id, "bot", "Ayer: 14 commits en 2 repos, 3 ramas listas para revisar y un test que tarda el doble que la semana pasada.", hace(119));
  await anotarHistorial(parte.id, "vos", "¿cuál test?", hace(60));
  await anotarHistorial(parte.id, "bot", "cobros.test.ts: de 4 a 9 segundos desde el cambio de la base de prueba.", hace(59));
  await recordarEnBot(parte.id, "Prefiere el parte en tres renglones, con lo urgente primero.");

  const investigador = await crearBot({ nombre: "Investigador", motor: "mentira", carpeta, ...conPlantilla("investigador") });
  await anotarHistorial(investigador.id, "vos", "averiguá qué proveedor de correo nos conviene para 20 mil mails por mes", hace(300));
  await anotarHistorial(investigador.id, "bot", "Comparé cinco con precios de hoy. Gana el segundo por costo y entregabilidad; te dejé la tabla con las fuentes.", hace(290));
  await guardarHabilidad(
    investigador.id,
    "comparar-proveedores",
    "Cómo comparar proveedores con precios del día y fuentes",
    "1. Listar los candidatos que nombra la persona y los dos más usados del rubro.\n2. Leer el precio en la página oficial de cada uno, con la fecha.\n3. Armar la tabla y decir cuál gana y por qué.",
  );
}
