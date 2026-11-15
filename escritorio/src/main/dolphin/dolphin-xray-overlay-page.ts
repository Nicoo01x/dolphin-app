/**
 * La página de la capa de X-ray: una por pantalla, transparente y sin preload. Main la maneja con
 * executeJavaScript (`window.__xray.*`) y ella contesta por consola con líneas `__xray__{json}`,
 * así no hace falta exponerle nada de la app a una ventana que tapa todo el escritorio.
 *
 * Gusto de Nico para Dolphin: chrome monocromo y piezas flotantes de vidrio (blur 28, saturate
 * 150 %, canto inset, sombras suaves apiladas). El anillo es blanco; el color no hace falta.
 */
export const XRAY_CONSOLE_PREFIX = '__xray__'

export function paginaDeCapaXray(textos: {
  placeholder: string
  ayuda: string
  bug: string
  bugPlaceholder: string
  bugAyuda: string
  enviado: string
  sinAgente: string
  reportado: string
  copiado: string
}): string {
  const t = JSON.stringify(textos)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden;
    font-family: "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif; user-select: none; }
  .anillo { position: fixed; pointer-events: none; border-radius: 8px; opacity: 0;
    box-shadow: 0 0 0 2px rgba(255,255,255,.92), 0 0 0 6px rgba(255,255,255,.14), 0 8px 32px rgba(0,0,0,.28);
    background: rgba(255,255,255,.06);
    transition: left 90ms cubic-bezier(.38,.49,0,1), top 90ms cubic-bezier(.38,.49,0,1),
      width 90ms cubic-bezier(.38,.49,0,1), height 90ms cubic-bezier(.38,.49,0,1), opacity 120ms ease-out; }
  .anillo.visible { opacity: 1; }
  .anillo.elegido { box-shadow: 0 0 0 2px #fff, 0 0 0 8px rgba(255,255,255,.22), 0 12px 40px rgba(0,0,0,.34); }
  .vidrio { background: rgba(28,28,30,.52); backdrop-filter: blur(28px) saturate(150%);
    -webkit-backdrop-filter: blur(28px) saturate(150%); color: #fff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 1px rgba(255,255,255,.10),
      0 2px 6px rgba(0,0,0,.18), 0 16px 48px rgba(0,0,0,.30);
    text-shadow: 0 .5px 1.5px rgba(0,0,0,.35); }
  .etiqueta { position: fixed; pointer-events: none; padding: 6px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 500; line-height: 1.2; white-space: nowrap; max-width: 480px;
    overflow: hidden; text-overflow: ellipsis; opacity: 0; transform: translateY(4px);
    transition: opacity 120ms ease-out, transform 160ms cubic-bezier(.38,.49,0,1); }
  .etiqueta.visible { opacity: 1; transform: none; }
  .etiqueta .app { opacity: .62; margin-left: 6px; }
  .tarjeta { position: fixed; width: 420px; padding: 12px; border-radius: 24px; opacity: 0;
    transform: scale(.94) translateY(6px); transform-origin: top left; pointer-events: none;
    transition: opacity 150ms ease-out, transform 260ms cubic-bezier(.34,1.56,.64,1); }
  .tarjeta.visible { opacity: 1; transform: none; pointer-events: auto; }
  .tarjeta .que { font-size: 12px; opacity: .7; margin: 2px 6px 8px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  .tarjeta textarea { display: block; box-sizing: border-box; width: 100%; min-height: 52px; max-height: 160px;
    resize: none; border: 0; outline: none; border-radius: 16px; padding: 14px 16px;
    background: rgba(255,255,255,.10); color: #fff; font: inherit; font-size: 14px; line-height: 1.4;
    transition: background 120ms ease-out; user-select: text; }
  .tarjeta textarea:hover { background: rgba(255,255,255,.13); }
  .tarjeta textarea::placeholder { color: rgba(255,255,255,.5); }
  .tarjeta input { display: none; box-sizing: border-box; width: 100%; border: 0; outline: none; border-radius: 16px; padding: 14px 16px;
    background: rgba(255,255,255,.10); color: #fff; font: inherit; font-size: 14px; }
  .tarjeta input::placeholder { color: rgba(255,255,255,.5); }
  .acciones { display: flex; justify-content: flex-end; margin: 8px 4px 0; }
  .acciones button { border: 0; border-radius: 999px; padding: 7px 12px; background: rgba(255,255,255,.12); color: rgba(255,255,255,.85); font: inherit; font-size: 12px; cursor: pointer; }
  .acciones button:hover { background: rgba(255,255,255,.18); }
  .tarjeta .ayuda { font-size: 11px; opacity: .55; margin: 8px 6px 0; }
  .aviso { position: fixed; left: 50%; bottom: 48px; padding: 10px 18px; border-radius: 999px; font-size: 13px;
    opacity: 0; transform: translate(-50%, 12px) scale(.96);
    transition: opacity 150ms ease-out, transform 320ms cubic-bezier(.34,1.56,.64,1); }
  .aviso.visible { opacity: 1; transform: translate(-50%, 0) scale(1); }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="anillo" id="anillo"></div>
<div class="etiqueta vidrio" id="etiqueta"><span id="nombre"></span><span class="app" id="app"></span></div>
<div class="tarjeta vidrio" id="tarjeta">
  <div class="que" id="que"></div>
  <textarea id="pedido" rows="1"></textarea>
  <input id="bugQue" type="text" />
  <div class="ayuda" id="ayuda"></div>
  <div class="acciones"><button id="bug" type="button"></button></div>
</div>
<div class="aviso vidrio" id="aviso"></div>
<script>
(() => {
  const textos = ${t};
  const $ = (id) => document.getElementById(id);
  const anillo = $('anillo'), etiqueta = $('etiqueta'), tarjeta = $('tarjeta'), pedido = $('pedido'), bugQue = $('bugQue');
  pedido.placeholder = textos.placeholder;
  $('bug').textContent = textos.bug;
  $('ayuda').textContent = textos.ayuda;
  const decir = (mensaje) => console.log(${JSON.stringify(XRAY_CONSOLE_PREFIX)} + JSON.stringify(mensaje));
  const ubicar = (r) => {
    anillo.style.left = (r.x - 3) + 'px'; anillo.style.top = (r.y - 3) + 'px';
    anillo.style.width = (r.width + 6) + 'px'; anillo.style.height = (r.height + 6) + 'px';
  };
  const ubicarEtiqueta = (r) => {
    const alto = 28, margen = 10;
    const arriba = r.y - alto - margen;
    etiqueta.style.left = Math.max(8, Math.min(r.x, innerWidth - 300)) + 'px';
    etiqueta.style.top = (arriba > 8 ? arriba : Math.min(r.y + r.height + margen, innerHeight - alto - 8)) + 'px';
  };
  let elegido = false;
  window.__xray = {
    hover(datos) {
      if (elegido) return;
      ubicar(datos.rect); ubicarEtiqueta(datos.rect);
      $('nombre').textContent = datos.label || '';
      $('app').textContent = datos.app || '';
      anillo.classList.add('visible'); etiqueta.classList.toggle('visible', Boolean(datos.label || datos.app));
    },
    clear() {
      if (elegido) return;
      anillo.classList.remove('visible'); etiqueta.classList.remove('visible');
    },
    pick(datos) {
      elegido = true;
      pedido.style.display = 'block'; bugQue.style.display = 'none';
      pedido.placeholder = textos.placeholder; $('ayuda').textContent = textos.ayuda;
      ubicar(datos.rect); anillo.classList.add('visible', 'elegido'); etiqueta.classList.remove('visible');
      $('que').textContent = [datos.label, datos.app].filter(Boolean).join('  ·  ');
      const r = datos.rect, ancho = 420, alto = 150, margen = 12;
      let x = Math.max(12, Math.min(r.x, innerWidth - ancho - 12));
      let y = r.y + r.height + margen;
      if (y + alto > innerHeight - 12) y = Math.max(12, r.y - alto - margen);
      tarjeta.style.left = x + 'px'; tarjeta.style.top = y + 'px';
      tarjeta.classList.add('visible');
      setTimeout(() => pedido.focus(), 30);
    },
    reportDone(copiado) {
      tarjeta.classList.remove('visible'); anillo.classList.remove('visible'); etiqueta.classList.remove('visible');
      $('aviso').textContent = copiado ? textos.copiado : textos.reportado;
      $('aviso').classList.add('visible');
    },
    done(ok) {
      tarjeta.classList.remove('visible'); anillo.classList.remove('visible'); etiqueta.classList.remove('visible');
      $('aviso').textContent = ok ? textos.enviado : textos.sinAgente;
      $('aviso').classList.add('visible');
    }
  };
  pedido.addEventListener('input', () => {
    pedido.style.height = 'auto'; pedido.style.height = Math.min(pedido.scrollHeight, 160) + 'px';
  });
  pedido.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      decir({ type: 'submit', text: pedido.value });
    } else if (event.key === 'Escape') {
      decir({ type: 'cancel' });
    }
  });
  $('bug').addEventListener('click', () => {
    pedido.style.display = 'none'; bugQue.style.display = 'block';
    bugQue.placeholder = textos.bugPlaceholder; $('ayuda').textContent = textos.bugAyuda;
    bugQue.focus();
  });
  bugQue.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      decir({ type: 'bug', text: bugQue.value });
    } else if (event.key === 'Escape') {
      decir({ type: 'cancel' });
    }
  });
  // Un clic afuera de la tarjeta, ya elegido el control, es soltar el X-ray.
  document.addEventListener('mousedown', (event) => {
    if (elegido && !tarjeta.contains(event.target)) decir({ type: 'cancel' });
  });
})();
</script>
</body>
</html>`
}
