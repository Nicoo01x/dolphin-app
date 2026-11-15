/**
 * La imagen del portapapeles, guardada en un archivo.
 *
 * En una terminal no se puede «pegar una imagen»: lo que viaja por el teclado es texto. Lo que
 * sí se puede es sacarla del portapapeles del sistema, dejarla en un archivo y pasarle la RUTA
 * al agente, que es lo que el agente necesita igual.
 *
 * Cada sistema tiene su herramienta y ninguna viene con Dolphin, así que cuando falta se dice
 * cuál es y cómo se instala. Inventar un error genérico acá deja a alguien mirando «no pude
 * leer el portapapeles» sin saber que le falta `wl-paste`.
 */

export type Plataforma = "win32" | "darwin" | "linux";

export interface ComandoDePegado {
  readonly programa: string;
  readonly argumentos: readonly string[];
  /** Si el programa escribe la imagen en su salida en vez de en un archivo. */
  readonly porSalida: boolean;
  /** Qué falta instalar, para poder decirlo cuando el programa no está. */
  readonly seInstala: string;
}

export class SinHerramienta extends Error {}
export class SinImagen extends Error {}

/**
 * El guion de PowerShell que guarda la imagen.
 *
 * Why imprime «nada» en vez de fallar: el portapapeles vacío o con texto no es un error del
 * sistema, es la respuesta a la pregunta. Un código de salida distinto de cero ahí se mezclaría
 * con «PowerShell no arrancó», que sí hay que decir distinto.
 */
export function guionDeWindows(destino: string): string {
  const ruta = destino.replace(/'/g, "''");
  return [
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;",
    "$img = [System.Windows.Forms.Clipboard]::GetImage();",
    `if ($img) { $img.Save('${ruta}', [System.Drawing.Imaging.ImageFormat]::Png); $img.Dispose(); 'ok' } else { 'nada' }`,
  ].join(" ");
}

/** Con qué se saca la imagen en cada sistema, y qué falta instalar si no está. */
export function comandoDePegado(plataforma: Plataforma, destino: string): ComandoDePegado {
  if (plataforma === "win32") {
    return {
      programa: "powershell.exe",
      // -STA: el portapapeles de Windows sólo se lee desde un hilo de apartamento único, y sin
      // esto GetImage devuelve null SIEMPRE, que se lee como «no había imagen».
      argumentos: ["-NoProfile", "-STA", "-Command", guionDeWindows(destino)],
      porSalida: false,
      seInstala: "PowerShell (viene con Windows)",
    };
  }
  if (plataforma === "darwin") {
    return {
      programa: "pngpaste",
      argumentos: [destino],
      porSalida: false,
      seInstala: "brew install pngpaste",
    };
  }
  // Wayland es lo que corre hoy en casi todas las distros nuevas; con X11, xclip hace lo mismo.
  return {
    programa: "wl-paste",
    argumentos: ["--type", "image/png"],
    porSalida: true,
    seInstala: "sudo apt install wl-clipboard (o xclip, con X11)",
  };
}

/** Cómo se lee lo que salió. Devuelve la ruta si quedó una imagen. */
export function leerPegado(
  comando: ComandoDePegado,
  salida: { readonly codigo: number | null; readonly texto: string; readonly bytes: number },
  destino: string,
): string {
  if (salida.codigo === null) {
    throw new SinHerramienta(`me falta ${comando.programa}. Se instala con: ${comando.seInstala}`);
  }
  if (comando.porSalida) {
    if (salida.codigo !== 0 || salida.bytes === 0) {
      throw new SinImagen("no hay ninguna imagen en el portapapeles");
    }
    return destino;
  }
  if (salida.codigo !== 0) {
    throw new SinHerramienta(`${comando.programa} falló: ${salida.texto.trim().split("\n")[0] ?? ""}`);
  }
  if (salida.texto.includes("nada")) {
    throw new SinImagen("no hay ninguna imagen en el portapapeles");
  }
  return destino;
}

/** Un nombre que no pisa el anterior y se puede leer: la hora, en la carpeta del proyecto. */
export function nombreDeLaImagen(ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `pegada-${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}.png`;
}

/**
 * Corre el comando y deja la imagen en `destino`. Es la mitad que toca el sistema, separada de
 * la de arriba para que la otra se pueda probar sin portapapeles ni procesos.
 */
export async function correrPegado(
  comando: ComandoDePegado,
  destino: string,
): Promise<{ codigo: number | null; texto: string; bytes: number }> {
  const { spawn } = await import("node:child_process");
  const { createWriteStream } = await import("node:fs");
  const { stat, rm } = await import("node:fs/promises");
  return new Promise((listo) => {
    // Sin `shell`: con shell los argumentos se CONCATENAN sin escapar en una línea de comando, y
    // acá uno de ellos es un guion de PowerShell con una ruta adentro. Por eso en Windows el
    // programa se nombra con su `.exe`, que es lo que `spawn` encuentra sin shell.
    const hijo = spawn(comando.programa, [...comando.argumentos], {
      stdio: ["ignore", comando.porSalida ? "pipe" : "ignore", "pipe"],
    });
    let texto = "";
    hijo.stderr?.on("data", (t: Buffer) => void (texto += t.toString()));
    if (!comando.porSalida) hijo.stdout?.on("data", (t: Buffer) => void (texto += t.toString()));
    if (comando.porSalida && hijo.stdout) hijo.stdout.pipe(createWriteStream(destino));
    // Un programa que no existe llega como `error` y nunca como `close`: sin esto, el comando se
    // queda esperando para siempre a un proceso que nunca existió.
    hijo.on("error", () => listo({ codigo: null, texto, bytes: 0 }));
    hijo.on("close", (codigo) => {
      void stat(destino)
        .then((d) => d.size)
        .catch(() => 0)
        .then(async (bytes) => {
          // Un png de cero bytes es peor que ninguno: el agente lo abre y no entiende por qué falla.
          if (bytes === 0) await rm(destino, { force: true }).catch(() => undefined);
          listo({ codigo, texto, bytes });
        });
    });
  });
}
