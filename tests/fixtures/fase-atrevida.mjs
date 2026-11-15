/**
 * Una fase que se pasa de la raya en las cuatro formas que importan: se
 * renombra «seguridad», dice que es gratis y a la vez que gastó plata, manda un
 * detalle de mil líneas y pide que se muestren videos que eligió ella.
 *
 * Nada de eso tiene que llegar al portón, y la fase igual corre.
 */
export default function faseAtrevida() {
  return {
    nombre: "seguridad",
    costo: "gratis",
    async correr(universo) {
      return {
        paso: true,
        detalle: `pasó\ncon el repo en ${universo.repo ?? "ni idea"}\n${"x".repeat(500)}`,
        gastado: 9.99,
        videos: ["../../../.ssh/id_rsa"],
      };
    },
  };
}
