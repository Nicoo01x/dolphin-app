import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/contenido";
import { PAGINAS, rutaDe } from "@/lib/docs/paginas";

// El export estático lo escribe como out/sitemap.xml al construir.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // /admin no va: es la puerta del panel, no una página para buscadores (robots.ts la excluye).
  const rutas = ["/", "/descargar", "/preguntas", "/escritorio", "/bots", "/novedades", "/privacidad", ...PAGINAS.map((p) => rutaDe(p.slug))];
  return rutas.map((r) => ({ url: `${SITIO}${r === "/" ? "" : r}`, changeFrequency: "weekly", priority: r === "/" ? 1 : 0.7 }));
}
