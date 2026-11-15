/**
 * Los instaladores de la app de escritorio, en un solo lugar.
 *
 * Bajan de la última release de GitHub (`releases/latest/download/<archivo>`): GitHub redirige al
 * archivo de la release más nueva, así que la web no cambia con cada versión. Los nombres los
 * define el que arma las releases: si cambian, se cambian acá y en ningún otro lado.
 */
import { REPO } from "./contenido";

export type Sistema = "windows" | "macos" | "linux";

export interface Instalador {
  readonly sistema: Sistema;
  readonly nombre: string;
  readonly archivo: string;
  readonly url: string;
  /** Cómo abrirlo la primera vez: los instaladores todavía no están firmados. */
  readonly sinFirma: string;
}

const ULTIMA = `${REPO}/releases/latest/download/`;

const instalador = (sistema: Sistema, nombre: string, archivo: string, sinFirma: string): Instalador => ({
  sistema,
  nombre,
  archivo,
  url: `${ULTIMA}${archivo}`,
  sinFirma,
});

export const INSTALADORES: Readonly<Record<Sistema, Instalador>> = {
  windows: instalador(
    "windows",
    "Windows",
    "dolphin-windows-setup.exe",
    "Si SmartScreen lo frena: «Más información» → «Ejecutar de todas formas».",
  ),
  macos: instalador("macos", "macOS", "dolphin-macos-arm64.dmg", "Para Mac con Apple Silicon (M1 o posterior); para Intel, bajá dolphin-macos-x64.dmg de la página de versiones. La primera vez: clic derecho sobre la app → «Abrir»."),
  linux: instalador(
    "linux",
    "Linux",
    "dolphin-linux.AppImage",
    "Dale permiso de ejecución (`chmod +x dolphin-linux.AppImage`) y abrilo.",
  ),
};

export const SISTEMAS: readonly Sistema[] = ["windows", "macos", "linux"];

/** Todas las versiones, por si el que visita quiere otra cosa o un instalador viejo. */
export const RELEASES = `${REPO}/releases`;

/**
 * El sistema de quien visita, leído del navegador. Si no se puede saber (un bot, un celular),
 * Windows: es el más común entre quienes descargan una app de escritorio.
 */
export function sistemaDelNavegador(agente: string, plataforma = ""): Sistema {
  const texto = `${plataforma} ${agente}`.toLowerCase();
  if (/mac|iphone|ipad/.test(texto)) return "macos";
  if (/linux|x11|cros/.test(texto) && !/android/.test(texto)) return "linux";
  return "windows";
}
