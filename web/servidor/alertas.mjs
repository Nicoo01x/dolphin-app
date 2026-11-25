// Que un crash nuevo te llegue sin abrir el panel: un mensaje de Telegram.
//
// Se manda sólo cuando una firma aparece por primera vez o vuelve después de darla por resuelta.
// La décima vez del mismo crash no es noticia: se ve en el panel, en el contador.
// Sin `DOLPHIN_TELEGRAM_TOKEN` y `DOLPHIN_TELEGRAM_CHAT` no sale nada y el panel sigue igual.
//
// El mensaje no lleva texto del reporte: lo escribe cualquiera que mande un POST, y por tu propio
// bot podría llegarte un «entrá a https://…». Sólo lo que se valida acá (plataforma conocida, una
// versión con forma de versión) y el link al panel. Y hay un tope por hora: inventar firmas nuevas
// no puede tapar un crash de verdad bajo cien avisos.

const PLATAFORMAS = { win32: "Windows", darwin: "macOS", linux: "Linux" };
const MAXIMO_POR_HORA = 10;

export function textoDeAlerta(registro, { nueva, volvio }, panel = "https://odolphin.tech/admin") {
  const que = volvio ? "Volvió un crash que estaba resuelto" : nueva ? "Crash nuevo" : "Crash";
  const version = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(registro.version ?? "") ? `v${registro.version}` : null;
  const donde = [version, PLATAFORMAS[registro.plataforma]].filter(Boolean).join(" · ");
  return `Dolphin · ${que}${donde ? `\n${donde}` : ""}\n${panel}#crash-${registro.firma}`;
}

export function crearAvisador({ token = process.env.DOLPHIN_TELEGRAM_TOKEN, chat = process.env.DOLPHIN_TELEGRAM_CHAT, fetchImpl = fetch, log = console, ahora = Date.now } = {}) {
  const prendido = Boolean(token && chat);
  const enviados = [];
  return {
    prendido,
    async avisar(registro, estado) {
      if (!prendido || registro.tipo !== "crash" || !(estado.nueva || estado.volvio)) return false;
      const t = ahora();
      while (enviados.length && t - enviados[0] > 60 * 60 * 1000) enviados.shift();
      if (enviados.length >= MAXIMO_POR_HORA) return false;
      enviados.push(t);
      try {
        const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text: textoDeAlerta(registro, estado), disable_web_page_preview: true }),
        });
        if (!r.ok) log.error(`[alertas] Telegram contestó ${r.status}`);
        return r.ok;
      } catch (error) {
        log.error(`[alertas] no se pudo avisar por Telegram: ${error.message}`);
        return false;
      }
    },
  };
}
