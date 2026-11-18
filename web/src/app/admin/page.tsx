import type { Metadata } from "next";
import { Panel } from "@/components/admin/Panel";

// El panel no se indexa ni entra al sitemap: es una puerta, no una página para buscadores.
export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

export default function PaginaAdmin() {
  return <Panel />;
}
