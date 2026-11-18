import { uiNumberFormat } from '@/i18n/ui-intl-formatters'

const KB = 1024
const MB = 1024 ** 2
const GB = 1024 ** 3

// Constantes de módulo: los formateadores de la UI se cachean por identidad de las opciones.
const HASTA_UN_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 }
const ENTERO: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

/**
 * Un número de GB como se escribe en el idioma de la app: «1,5» en castellano, «1.5» en inglés.
 * Un decimal alcanza para decidir qué hacer, y un entero va sin decimal («16», no «16.00»).
 */
export function numeroDeGb(gb: number, intlLocale?: string): string {
  return uiNumberFormat(HASTA_UN_DECIMAL, intlLocale).format(gb)
}

/**
 * La memoria del cartel y del ajuste de poca RAM. No es `formatMemory` de la barra de estado a
 * propósito: esa escribe siempre con punto y dos decimales («1.10 GB») para alinear columnas, y
 * acá se lee una frase.
 */
export function formatearMemoria(bytes: number, intlLocale?: string): string {
  const valor = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  const megas = Math.round(valor / MB)
  // 1023,7 MB redondea a 1024: eso ya es «1 GB».
  if (megas >= 1024) {
    return `${numeroDeGb(valor / GB, intlLocale)} GB`
  }
  const entero = uiNumberFormat(ENTERO, intlLocale)
  return valor < MB ? `${entero.format(valor / KB)} KB` : `${entero.format(megas)} MB`
}
