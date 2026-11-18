// Que un crash nuevo te llegue sin abrir el panel: un mensaje de Telegram.
//
// Se manda sólo cuando una firma aparece por primera vez o vuelve después de darla por resuelta.
// La décima vez del mismo crash no es noticia: se ve en el panel, en el contador.
// Sin `DOLPHIN_TELEGRAM_TOKEN` y `DOLPHIN_TELEGRAM_CHAT` no sale nada y el panel sigue igual.

export function textoDeAlerta(registro, { nueva, volvio }, panel = "https://odolphin.tech/admin") {
  const que = volvio ? "Volvió un crash que estaba resuelto" : nueva ? "Crash nuevo" : "Crash";
  const donde = [registro.version && `v${registro.version}`, registro.plataforma, registro.sistema].filter(Boolean).join(" · ");
  return `Dolphin · ${que}\n${registro.titulo ?? "sin título"}\n${donde}\n${panel}#crash-${registro.firma}`;
}

export function crearAvisador({ token = process.env.DOLPHIN_TELEGRAM_TOKEN, chat = process.env.DOLPHIN_TELEGRAM_CHAT, fetchImpl = fetch, log = console } = {}) {
  const prendido = Boolean(token && chat);
  return {
    prendido,
    async avisar(registro, estado) {
      if (!prendido || registro.tipo !== "crash" || !(estado.nueva || estado.volvio)) return false;
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
