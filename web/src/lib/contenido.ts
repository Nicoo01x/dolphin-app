/** Lo que dice la web, en un solo lugar. */

// El paquete todavía no está publicado: el nombre de npm lo decide Nico (NEEDS-FROM-NICO).
/**
 * Cómo se instala hoy: desde el código (README, «Instalación»). Hasta el 12/11/2026 decía
 * `npm install -g dolphin-agents`, un paquete que no está publicado en npm: ese comando no andaba.
 */
export const INSTALAR = {
  comando: "git clone https://github.com/Nicoo01x/dolphin-app.git && cd dolphin-app && npm install && npm link",
  sistemas: "Windows · macOS · Linux · deja el comando dolphin en el PATH",
} as const;

export const REPO = "https://github.com/Nicoo01x/dolphin-app";

/**
 * Dónde se publica la web: lo usan el sitemap, robots.txt y los links de openGraph. Todavía no hay
 * dominio (NEEDS-FROM-NICO): se pasa al construir con DOLPHIN_SITIO=https://… npx next build. Sin
 * eso queda la dirección de `npm start`, que sirve para probar el export en local.
 */
export const SITIO = (process.env.DOLPHIN_SITIO || "http://localhost:5311").replace(/\/$/, "");

/**
 * ¿La dirección de arriba es la de verdad, o la de probar en casa?
 *
 * Importa porque hay etiquetas que, con la dirección equivocada, hacen daño en vez de no servir:
 * un `canonical` o un `og:url` que digan `localhost` desindexan el sitio y rompen la vista previa
 * en WhatsApp, Telegram y X. Así que mientras no haya dominio NO se emiten, en vez de emitirse
 * mintiendo. Lo vigila `scripts/revisar-export.mjs`, que corre después de construir.
 */
export const SITIO_PUBLICADO: boolean = Boolean(process.env.DOLPHIN_SITIO);

/**
 * El `canonical` de una página, o nada si todavía no hay dominio.
 *
 * Va como helper y no escrito en cada página porque son cinco y la que se olvide va a salir con
 * `localhost` adentro sin que nadie lo note hasta que alguien comparta el link.
 */
export function canonicalDe(ruta: string): { alternates?: { canonical: string } } {
  return SITIO_PUBLICADO ? { alternates: { canonical: ruta } } : {};
}

/*
 * Acá vivían `VIDRIO` y `VIDRIO_HUMO`, el material de todo lo que flotaba sobre el océano cuando
 * el océano era el fondo de la página. Se fueron el 31/10 con el fondo: sobre el azul noche liso,
 * una superficie es `bg-lienzo-2` y lo que separa son filetes (ver ESTILO.md). Si alguna vez vuelve
 * a aparecer un `backdrop-blur` en una sección, es que algo se copió de una versión vieja.
 */
