import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Movimiento } from "@/components/Movimiento";
import { ScrollSuave } from "@/components/ScrollSuave";
import { SITIO, SITIO_PUBLICADO } from "@/lib/contenido";
import "./globals.css";

// Una sola familia para los títulos y para el texto, como Linear, que es la referencia que eligió
// Nico el 01/11. Es Satoshi y no Inter porque ya es la voz de Dolphin en la consola y porque el
// 27/10 dejó dicho «Inter no». La serif de los títulos —Instrument Serif, de cuando la referencia
// era hermes-agent— se fue con el rediseño: Linear no mezcla familias, y la carta antigua no
// sostenía un producto que se vende mostrando su pantalla.
const texto = localFont({
  src: [
    { path: "../../public/fuentes/satoshi-400.woff2", weight: "400" },
    { path: "../../public/fuentes/satoshi-500.woff2", weight: "500" },
    { path: "../../public/fuentes/satoshi-700.woff2", weight: "700" },
  ],
  variable: "--fuente-texto",
  display: "swap",
});
const codigo = JetBrains_Mono({ subsets: ["latin"], variable: "--fuente-codigo", display: "swap" });

const TITULO = "Dolphin — el control de calidad de tus agentes de código";
const DESCRIPCION =
  "Claude Code, Codex y otros ocho agentes trabajando en manada: cada uno en su rama, cada rama por un portón que la prueba antes de que toque la tuya, y lo que les corregís convertido en chequeos para siempre. Open source, con la sesión que ya pagás.";

// Sin dominio de verdad, el sitio sale SIN `canonical` ni `og:url` en vez de salir con
// `localhost` adentro: esas dos etiquetas con la dirección equivocada desindexan el sitio y
// rompen la vista previa al compartirlo (ver SITIO_PUBLICADO en lib/contenido.ts). Lo demás no
// depende de la dirección y va siempre.
export const metadata: Metadata = {
  ...(SITIO_PUBLICADO ? { metadataBase: new URL(SITIO), alternates: { canonical: "/" } } : {}),
  title: { default: TITULO, template: "%s · Dolphin" },
  description: DESCRIPCION,
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    type: "website",
    siteName: "Dolphin",
    locale: "es_AR",
    ...(SITIO_PUBLICADO ? { url: "/" } : {}),
  },
};

export const viewport: Viewport = { themeColor: "#07090c" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${texto.variable} ${codigo.variable}`}>
      <body>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-full focus:bg-espuma focus:px-4 focus:py-2 focus:text-[14px] focus:text-lienzo"
        >
          Saltar al contenido
        </a>
        {/* Acá iba el marco de 5 px de celeste eléctrico que encuadraba la página, copiado de
            hermes-agent. Se fue con el rediseño del 01/11: Linear no encuadra nada, y un borde de
            color alrededor de todo es justo lo que hacía que la página se viera como una plantilla
            y no como un producto. */}
        <ScrollSuave />
        <Movimiento>{children}</Movimiento>
      </body>
    </html>
  );
}
