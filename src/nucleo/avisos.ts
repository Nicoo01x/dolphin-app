import { execFile } from "node:child_process";
import { join } from "node:path";
import { drenarSalidasEnRuta, encolarSalidaEnRuta, type SalidaGuardada } from "../bots/salida.js";

/**
 * Avisos donde estés: cuando un trabajo termina, se traba o espera una respuesta, Dolphin avisa con
 * una notificación del sistema y, si hay token, por Telegram. Quien decide QUÉ avisar es la sesión;
 * acá vive CÓMO: los emisores, y la regla de no repetir el mismo aviso.
 *
 * Los emisores no tiran: un aviso que no sale no puede cortar un equipo que terminó bien.
 */

export type TipoDeAviso = "termino" | "fallo" | "espera" | "trabado";

export interface Aviso {
  readonly tipo: TipoDeAviso;
  readonly titulo: string;
  readonly texto: string;
  /** Lo que lo hace único: el mismo aviso con la misma clave no sale dos veces. */
  readonly clave: string;
}

/** `siempre`: sale aunque estés mirando la terminal (Telegram: estás en otro lado, no frente a esta pantalla). */
export type Emisor = ((aviso: Aviso) => Promise<void>) & { siempre?: boolean; retomar?: () => Promise<void> };

export interface Avisador {
  avisar(aviso: Aviso): Promise<boolean>;
}

/**
 * Un avisador con sus emisores. `cuando` dice si hace falta (por ejemplo, que la terminal no tenga el
 * foco: si la estás mirando, no hace falta una notificación). Lo ya avisado no se repite.
 */
export function crearAvisador(emisores: readonly Emisor[], cuando: () => boolean = () => true): Avisador {
  const yaAvisados = new Set<string>();
  return {
    async avisar(aviso) {
      if (yaAvisados.has(aviso.clave)) return false;
      const hacenFalta = cuando() ? emisores : emisores.filter((e) => e.siempre);
      if (hacenFalta.length === 0) return false;
      yaAvisados.add(aviso.clave);
      await Promise.all(hacenFalta.map((emitir) => emitir(aviso).catch(() => {})));
      return true;
    },
  };
}

const correr = (cmd: string, args: readonly string[], entorno?: NodeJS.ProcessEnv): Promise<void> =>
  new Promise((resolver) => {
    execFile(cmd, [...args], { windowsHide: true, timeout: 15_000, ...(entorno ? { env: entorno } : {}) }, () => resolver());
  });

/** Un aviso cabe en una notificación: un renglón de título y unos pocos de texto, sin caracteres de control. */
const corto = (texto: string, largo: number): string => {
  const limpio = texto.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
};

/** Escapa un texto para meterlo en XML (la notificación de Windows es un XML). */
const xml = (texto: string): string => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** El XML de una notificación de Windows: título y texto escapados y recortados. */
export function xmlDeNotificacion(aviso: Pick<Aviso, "titulo" | "texto">): string {
  return `<toast><visual><binding template="ToastGeneric"><text>${xml(corto(aviso.titulo, 80))}</text><text>${xml(corto(aviso.texto, 300))}</text></binding></visual></toast>`;
}

/**
 * El script de PowerShell que muestra la notificación (sin instalar nada). Es FIJO: el contenido llega
 * por la variable de entorno DOLPHIN_AVISO_XML, nunca pegado adentro del script. El texto puede venir
 * de un modelo o de la salida de un test, y PowerShell acepta comillas tipográficas como delimitadores:
 * pegarlo, aunque se escapara, abría la puerta a ejecutar algo.
 */
export const SCRIPT_DE_NOTIFICACION_WINDOWS = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
    "$x = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "$x.LoadXml($env:DOLPHIN_AVISO_XML)",
    "$t = New-Object Windows.UI.Notifications.ToastNotification $x",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($t)",
  ].join("; ");

/** La notificación del sistema: Windows (toast), macOS (osascript) o Linux (notify-send). */
export const notificacionDelSistema: Emisor = async (aviso) => {
  if (process.platform === "win32")
    return correr("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT_DE_NOTIFICACION_WINDOWS], { ...process.env, DOLPHIN_AVISO_XML: xmlDeNotificacion(aviso) });
  if (process.platform === "darwin")
    return correr("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", corto(aviso.titulo, 80), corto(aviso.texto, 300)]);
  return correr("notify-send", ["--", corto(aviso.titulo, 80), corto(aviso.texto, 300)]);
};

/** Por Telegram, al chat que digas: necesita el token del bot y el id del chat. */
export function telegram(token: string, chat: string, enviar: typeof fetch = fetch): Emisor {
  const emisor: Emisor = async (aviso) => {
    await enviar(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `${aviso.titulo}\n${aviso.texto.slice(0, 3500)}`, disable_web_page_preview: true }),
    });
  };
  emisor.siempre = true;
  return emisor;
}

/**
 * Telegram para corridas de terminal: el aviso queda en `.dolphin/telegram-salida` antes de salir. Dos
 * terminales sobre el mismo repo drenan la misma carpeta: cada aviso se reclama renombrando su archivo
 * (`drenarSalidasEnRuta`), así sale una sola vez, y uno que no salió por falta de red se reintenta.
 */
export function telegramPersistente(token: string, chat: string, repo: string, enviar: typeof fetch = fetch): Emisor {
  const ruta = join(repo, ".dolphin", "telegram-salida");
  const entregar = async (salida: SalidaGuardada): Promise<boolean> => {
    const respuesta = await enviar(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: salida.texto.slice(0, 3500), disable_web_page_preview: true }),
    });
    if (!respuesta.ok) return false;
    const dato = (await respuesta.json().catch(() => undefined)) as { ok?: unknown } | undefined;
    return dato?.ok !== false;
  };
  const emisor: Emisor = async (aviso) => {
    await encolarSalidaEnRuta(ruta, `${aviso.titulo}\n${aviso.texto}`, undefined);
    await drenarSalidasEnRuta(ruta, entregar);
  };
  emisor.siempre = true;
  emisor.retomar = () => drenarSalidasEnRuta(ruta, entregar);
  return emisor;
}

/** Los emisores que hay en esta máquina: el del sistema siempre; Telegram si el entorno trae token y chat. */
export function emisoresDelEntorno(entorno: NodeJS.ProcessEnv = process.env, repo?: string): Emisor[] {
  const emisores: Emisor[] = [notificacionDelSistema];
  if (entorno.DOLPHIN_TELEGRAM_TOKEN && entorno.DOLPHIN_TELEGRAM_CHAT)
    emisores.push(repo ? telegramPersistente(entorno.DOLPHIN_TELEGRAM_TOKEN, entorno.DOLPHIN_TELEGRAM_CHAT, repo) : telegram(entorno.DOLPHIN_TELEGRAM_TOKEN, entorno.DOLPHIN_TELEGRAM_CHAT));
  return emisores;
}

/** Cuánto sin ninguna señal (ni una voz, ni un evento) hasta decir que un trabajo parece trabado. */
export const TRABADO_MS = 5 * 60_000;
