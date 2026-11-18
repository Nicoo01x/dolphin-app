/**
 * JSON-LD para los buscadores y los asistentes: qué es Dolphin, quién lo hace, qué preguntas
 * contesta. Va en el HTML del export estático, así lo leen sin correr JavaScript.
 *
 * `<` se escapa: un `</script>` dentro de un texto cerraría la etiqueta antes de tiempo.
 */
export function DatosEstructurados({ datos }: { readonly datos: object }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON propio, escapado; no hay HTML del usuario.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }}
    />
  );
}
