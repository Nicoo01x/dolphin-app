/** Lo que vuelve de «Elegir una imagen…»: el nombre del archivo ya copiado al perfil, o por qué no. */
export type FondoPropioElegido =
  | { readonly ok: true; readonly nombre: string }
  | { readonly ok: false; readonly motivo: 'cancelado' | 'formato' | 'pesada' | 'ilegible' }
