import type { MetadataRoute } from "next";
import { SITIO } from "@/lib/contenido";
import { PAGINAS, rutaDe } from "@/lib/docs/paginas";

// El export estático lo escribe como out/sitemap.xml al construir.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const rutas = ["/", "/escritorio", "/bots", "/novedades", ...PAGINAS.map((p) => rutaDe(p.slug))];
  return rutas.map((r) => ({ url: `${SITIO}${r === "/" ? "" : r}`, changeFrequency: "weekly", priority: r === "/" ? 1 : 0.7 }));
}
