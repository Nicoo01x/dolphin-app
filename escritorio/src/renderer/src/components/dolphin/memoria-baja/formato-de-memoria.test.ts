import { describe, expect, it } from 'vitest'
import { formatearMemoria, numeroDeGb } from './formato-de-memoria'

const MB = 1024 ** 2
const GB = 1024 ** 3

describe('la memoria del cartel, en el idioma de la app', () => {
  it('en castellano va con coma y un decimal: «1,1 GB», no «1.10 GB»', () => {
    expect(formatearMemoria(1.1 * GB, 'es')).toBe('1,1 GB')
    expect(formatearMemoria(3.24 * GB, 'es')).toBe('3,2 GB')
  })

  it('un entero va sin decimales: «16 GB», no «16.00 GB»', () => {
    expect(formatearMemoria(16 * GB, 'es')).toBe('16 GB')
    expect(formatearMemoria(16 * GB, 'en')).toBe('16 GB')
  })

  it('en inglés va con punto', () => {
    expect(formatearMemoria(1.1 * GB, 'en')).toBe('1.1 GB')
  })

  it('debajo de un GB habla en MB enteros, y 1023,7 MB ya es «1 GB»', () => {
    expect(formatearMemoria(512.4 * MB, 'es')).toBe('512 MB')
    expect(formatearMemoria(1023.7 * MB, 'es')).toBe('1 GB')
  })

  it('un número roto no rompe el cartel', () => {
    expect(formatearMemoria(Number.NaN, 'es')).toBe('0 KB')
    expect(formatearMemoria(-5, 'es')).toBe('0 KB')
  })

  it('las opciones del umbral: «1 / 1,5 / 2 / 3 / 4»', () => {
    expect([1, 1.5, 2, 3, 4].map((gb) => numeroDeGb(gb, 'es'))).toEqual(['1', '1,5', '2', '3', '4'])
    expect(numeroDeGb(1.5, 'en')).toBe('1.5')
  })
})
