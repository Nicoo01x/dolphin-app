import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { procesoVivo } from "../agentes/ejecutar.js";
import { carpetaDeBots } from "./almacen.js";
import { escribirDeUna } from "../nucleo/escritura.js";

const ejecutar = promisify(execFile);
const archivoServicio = () => join(carpetaDeBots(), "servicio.json");
export interface EstadoServicio {
  readonly vivo: boolean;
  readonly desde?: string;
}

export interface ServicioInstaladorDeps {
  readonly plataforma?: NodeJS.Platform;
  readonly ejecutar?: (comando: string, argumentos: readonly string[]) => Promise<void>;
  readonly home?: string;
  /**
   * Con qué se corre el servicio. Por defecto `dolphin bots correr`, que necesita `dolphin` en el
   * PATH; la app, que lleva el núcleo a un servidor sin instalarlo con npm, pasa la ruta entera
   * (`/ruta/a/node /ruta/a/bin/dolphin.mjs bots correr`).
   */
  readonly comando?: string;
  /** Variables para el servicio de systemd, que no hereda el PATH de tu sesión: sin él no encuentra `claude`. */
  readonly entorno?: Readonly<Record<string, string>>;
}

/** systemd lee `%` como especificador y corta el valor en las comillas: se escapan los dos. */
const valorDeSystemd = (valor: string): string => valor.replace(/%/g, "%%").replace(/(["\\])/g, "\\$1");

const correrPorDefecto = async (comando: string, argumentos: readonly string[]) => {
  await ejecutar(comando, [...argumentos], { windowsHide: true });
};

export function textoUnidad(plataforma: NodeJS.Platform = process.platform, comando = "dolphin bots correr", entorno: Readonly<Record<string, string>> = {}): string {
  if (plataforma === "win32") return `schtasks /Create /TN "Dolphin Bots" /SC ONLOGON /TR "${comando}" /F`;
  if (plataforma === "darwin")
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
      "<plist version=\"1.0\"><dict>",
      "<key>Label</key><string>com.dolphin.bots</string>",
      `<key>ProgramArguments</key><array><string>${comando.split(" ").join("</string><string>")}</string></array>`,
      "<key>RunAtLoad</key><true/>",
      "</dict></plist>",
    ].join("\n");
  const variables = Object.entries(entorno).map(([nombre, valor]) => `Environment="${nombre}=${valorDeSystemd(valor)}"`);
  return ["[Unit]", "Description=Dolphin bots", "", "[Service]", ...variables, `ExecStart=${comando}`, "Restart=on-failure", "", "[Install]", "WantedBy=default.target"].join("\n");
}

export async function estadoServicio(): Promise<EstadoServicio> {
  try {
    const dato = JSON.parse(await readFile(archivoServicio(), "utf8")) as { pid?: number; desde?: string };
    return { vivo: typeof dato.pid === "number" && procesoVivo(dato.pid), ...(typeof dato.desde === "string" ? { desde: dato.desde } : {}) };
  } catch {
    return { vivo: false };
  }
}

export async function latidoServicio(desde: string): Promise<void> {
  await mkdir(carpetaDeBots(), { recursive: true });
  await escribirDeUna(archivoServicio(), `${JSON.stringify({ pid: process.pid, desde, latido: new Date().toISOString() }, null, 2)}\n`);
}

export async function instalarServicio(deps: ServicioInstaladorDeps = {}): Promise<string> {
  const plataforma = deps.plataforma ?? process.platform;
  const comando = deps.comando ?? "dolphin bots correr";
  const ejecutarAhora = deps.ejecutar ?? correrPorDefecto;
  if (plataforma === "win32") {
    await ejecutarAhora("schtasks", ["/Create", "/TN", "Dolphin Bots", "/SC", "ONLOGON", "/TR", comando, "/F"]);
    return textoUnidad(plataforma, comando);
  }
  if (plataforma === "darwin") {
    const ruta = join(deps.home ?? homedir(), "Library", "LaunchAgents", "com.dolphin.bots.plist");
    await mkdir(join(ruta, ".."), { recursive: true });
    await escribirDeUna(ruta, textoUnidad(plataforma, comando));
    await ejecutarAhora("launchctl", ["load", ruta]);
    return textoUnidad(plataforma, comando);
  }
  const ruta = join(deps.home ?? homedir(), ".config", "systemd", "user", "dolphin-bots.service");
  await mkdir(join(ruta, ".."), { recursive: true });
  const unidad = textoUnidad("linux", comando, deps.entorno);
  const anterior = await readFile(ruta, "utf8").catch(() => undefined);
  await escribirDeUna(ruta, unidad);
  await ejecutarAhora("systemctl", ["--user", "enable", "--now", "dolphin-bots.service"]);
  // `enable --now` no toca un servicio que ya corría: con la unidad cambiada (otro comando, otro
  // PATH) seguiría corriendo la vieja. Sin cambios no se reinicia: los bots nuevos los toma solo.
  if (anterior !== undefined && anterior !== unidad) {
    await ejecutarAhora("systemctl", ["--user", "daemon-reload"]);
    await ejecutarAhora("systemctl", ["--user", "restart", "dolphin-bots.service"]);
  }
  return unidad;
}

export async function desinstalarServicio(deps: ServicioInstaladorDeps = {}): Promise<void> {
  const plataforma = deps.plataforma ?? process.platform;
  const ejecutarAhora = deps.ejecutar ?? correrPorDefecto;
  if (plataforma === "win32") {
    await ejecutarAhora("schtasks", ["/Delete", "/TN", "Dolphin Bots", "/F"]);
    return;
  }
  if (plataforma === "darwin") {
    const ruta = join(deps.home ?? homedir(), "Library", "LaunchAgents", "com.dolphin.bots.plist");
    await ejecutarAhora("launchctl", ["unload", ruta]);
    await rm(ruta, { force: true });
    return;
  }
  await ejecutarAhora("systemctl", ["--user", "disable", "--now", "dolphin-bots.service"]);
  await rm(join(deps.home ?? homedir(), ".config", "systemd", "user", "dolphin-bots.service"), { force: true });
}
