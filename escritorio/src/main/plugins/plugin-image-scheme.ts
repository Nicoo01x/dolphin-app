import { PLUGIN_IMAGE_SCHEME } from '../../shared/plugins/images/plugin-image-url'

/** Declared before app ready (Electron freezes privileged schemes then); kept apart from the
 *  handler so startup does not load the plugin module graph. */
export const PLUGIN_IMAGE_CUSTOM_SCHEME: Electron.CustomScheme = {
  scheme: PLUGIN_IMAGE_SCHEME,
  // Why corsEnabled: plugin font files load in CORS mode, which a scheme must opt into.
  // Why supportFetchAPI: sin eso, una imagen carga igual —`background-image` y `<img>` no pasan
  // por fetch— pero cualquier `fetch()` del renderer contra este esquema falla con un «Failed to
  // fetch» que no dice nada. Costó un rato de diagnóstico creer que el protocolo estaba roto
  // cuando lo único roto era la forma de preguntarle.
  privileges: {
    standard: true,
    secure: true,
    stream: true,
    corsEnabled: true,
    supportFetchAPI: true
  }
}
