/**
 * El canvas, portado de Tallow (`D:\Deska`, `packages/canvas`), que es el escritorio espacial
 * que Nico ya tenía hecho. Decisión suya el 01/11: en vez de volver a escribirlo acá, se trae
 * el que funciona.
 *
 * Queda **en inglés y tal cual vino**, contra la costumbre de este repo, a propósito: así una
 * mejora de Tallow se vuelve a copiar sin resolver un diff de traducción en el medio. Lo que
 * lo usa (LienzoPage, PanelFlotante) sí está en el idioma de la casa.
 *
 * Una diferencia de uso: Tallow escala el plano con `transform: scale` y después corrige las
 * coordenadas del puntero para xterm y Monaco. Acá los paneles son `<webview>` —otro proceso—,
 * y un transform los rasteriza a su tamaño viejo y los estira: se ven blandos. Por eso las
 * ventanas se posicionan ya escaladas (`worldRectToScreen`) y el contenido se agranda con el
 * zoom propio del webview. La geometría es la misma para los dos caminos.
 */

export * from './geometry'
export * from './interaction'
