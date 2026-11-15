/**
 * Las láminas de archivo del sitio: grabados y litografías de dominio público, como las imágenes
 * que encabezan las notas de Works in Progress (la referencia que eligió Nico el 01/11).
 *
 * Son de verdad, no ilustraciones hechas para la web: láminas científicas de 1747 y 1904, con su
 * papel, su numeración y su pie. Por eso cada una viaja con su autor y su año, que se muestran al
 * lado del epígrafe — el detalle completo está en `public/laminas/FUENTE.md`.
 *
 * Todas están en dominio público (el autor murió hace más de 70 años y la obra es anterior a
 * 1930). El crédito no es una obligación legal acá: es lo que hace que una imagen de archivo se
 * lea como archivo y no como una ilustración de banco.
 */

export interface Lamina {
  /** El archivo en `public/laminas/`. */
  readonly src: string;
  readonly ancho: number;
  readonly alto: number;
  /** Qué se ve, para quien no la ve. */
  readonly alt: string;
  /** El pie de la estampa: qué es y por qué está acá. Va en serif itálica. */
  readonly epigrafe: string;
  /** Autor y año, cortito, en monoespaciada al costado del epígrafe. */
  readonly credito: string;
}

export const LAMINAS = {
  /** Colonias donde cada parte hace un trabajo distinto: un bot y sus partes. */
  sifonoforos: {
    src: "/laminas/sifonoforos.webp",
    ancho: 1100,
    alto: 1535,
    alt: "Lámina de sifonóforos de Ernst Haeckel: doce colonias marinas dibujadas en azul, rosa y dorado sobre papel crema, cada una numerada.",
    epigrafe: "Sifonóforos: colonias donde cada parte hace un trabajo y ninguna vive sola.",
    credito: "Haeckel · 1904",
  },
  /** Muchas formas distintas del mismo bicho, ordenadas: las preguntas de siempre. */
  radiolarios: {
    src: "/laminas/radiolarios.webp",
    // Recortada al 8 % por lado: el borde del papel, invertido, dibujaba un marco fantasma.
    ancho: 924,
    alto: 1299,
    alt: "Lámina de radiolarios de Ernst Haeckel: esqueletos minerales en forma de disco y de estrella, dibujados uno al lado del otro sobre la página del libro.",
    epigrafe: "Radiolarios: el mismo problema resuelto de diez maneras distintas.",
    credito: "Haeckel · 1904",
  },
  /** Lo que flota en lo hondo: el cierre, antes de instalar. */
  medusas: {
    src: "/laminas/medusas.webp",
    ancho: 1100,
    alto: 1578,
    alt: "Lámina de medusas de Ernst Haeckel: medusas naranjas y azules con tentáculos largos, flotando sobre papel crema.",
    epigrafe: "Discomedusas: lo que sigue andando allá abajo, sin que nadie mire.",
    credito: "Haeckel · 1904",
  },
  /** El libro abierto, con su margen: la doc. */
  medusasPeine: {
    src: "/laminas/medusas-peine.webp",
    ancho: 924,
    alto: 1266,
    alt: "Página del libro de Ernst Haeckel con medusas peine dibujadas a línea fina en azul pálido, con el margen y el pie impreso a la vista.",
    epigrafe: "Medusas peine, dibujadas a línea: todo explicado, nada adornado.",
    credito: "Haeckel · 1904",
  },
  /** La rosa de una carta de 1747: cómo se traza un rumbo. */
  rosaDeLosVientos: {
    src: "/laminas/rosa-de-los-vientos.webp",
    ancho: 1100,
    alto: 1108,
    alt: "Rosa de los vientos de una carta marina de 1747, con los treinta y dos rumbos nombrados en inglés y un anillo de grados alrededor.",
    epigrafe: "La rosa de los vientos de Bowen: treinta y dos rumbos, y hay que elegir uno.",
    credito: "Emanuel Bowen · 1747",
  },
  /** El animal mismo, descrito por una expedición: la documentación. */
  delfin: {
    src: "/laminas/delfin.webp",
    ancho: 1200,
    alto: 901,
    alt: "Litografía de un delfín de costado, en grises sobre papel crema, de la zoología del viaje del HMS Erebus y Terror.",
    epigrafe: "Un delfín, descrito por la expedición del Erebus y el Terror.",
    credito: "Richardson y Gray · 1844",
  },
  /** El fondo poblado: la app de escritorio, con todo a la vista. */
  anemonas: {
    src: "/laminas/anemonas.webp",
    ancho: 1100,
    alto: 1543,
    alt: "Lámina de anémonas de mar de Ernst Haeckel: un fondo marino cubierto de anémonas de colores, unas al lado de otras.",
    epigrafe: "Actinias: un fondo entero, y cada una ocupada en lo suyo.",
    credito: "Haeckel · 1904",
  },
} as const satisfies Record<string, Lamina>;

export type NombreDeLamina = keyof typeof LAMINAS;
