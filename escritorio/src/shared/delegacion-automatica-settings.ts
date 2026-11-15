/** El ajuste de la delegación automática, en su propio módulo como los demás grupos. */
export type DelegacionAutomaticaSettings = {
  /**
   * La delegación automática: el motor con el que estás hablando parte una tarea grande y abre a
   * sus compañeros en Dolphin, cada uno con su modelo, sin que se lo pidas.
   *
   * Apagada por defecto, y a propósito: prenderla hace que una sola tarea abra varias sesiones de
   * agente, y eso gasta. Es una decisión de la persona, no un default.
   */
  autoDelegation?: boolean
}
