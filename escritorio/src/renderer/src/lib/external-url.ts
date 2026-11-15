/**
 * Abrir un link en el navegador del sistema.
 *
 * Estaba escrito dos veces, igual, en `SidebarFeedbackDialog` y en `SidebarSettingsHelpMenu`.
 * Sacar los botones de comunidad a su propio componente iba a hacer una tercera copia, así que vive
 * acá: es una línea, pero es la línea que decide que un link del producto no se abra adentro de la
 * app.
 */
export function openExternalUrl(url: string): void {
  void window.api.shell.openUrl(url)
}
