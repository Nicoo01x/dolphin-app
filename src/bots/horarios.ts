const partesDe = (fecha: Date, zona: string): Record<string, number> => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(fecha);
  return Object.fromEntries(partes.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
};

export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona }).format();
    return true;
  } catch {
    return false;
  }
}

export function validarZona(zona: string | undefined): string | undefined {
  if (zona === undefined) return undefined;
  if (!zonaValida(zona)) throw new Error(`la zona horaria «${zona}» no es válida`);
  return zona;
}

/** Calcula la próxima hora de pared, incluso cuando la máquina está en otra zona. */
export function proximaDiaria(hora: string, zona: string | undefined, desde: Date): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora);
  if (!match) throw new Error("la rutina necesita una hora HH:MM válida");
  const tz = zona ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  validarZona(tz);
  const actual = partesDe(desde, tz);
  let pared = Date.UTC(actual.year!, actual.month! - 1, actual.day!, Number(match[1]), Number(match[2]), 0, 0);
  const paredAhora = Date.UTC(actual.year!, actual.month! - 1, actual.day!, actual.hour!, actual.minute!, actual.second!, 0);
  if (pared <= paredAhora) pared += 86_400_000;

  // Se prueba dos veces: el primer cálculo encuentra el desplazamiento de la zona y el segundo
  // corrige el salto de horario de verano si la próxima fecha cae justo alrededor del cambio.
  let utc = pared;
  for (let i = 0; i < 2; i++) {
    const local = partesDe(new Date(utc), tz);
    const paredCalculada = Date.UTC(local.year!, local.month! - 1, local.day!, local.hour!, local.minute!, local.second!, 0);
    utc = pared - (paredCalculada - utc);
  }
  return new Date(utc).toISOString();
}
