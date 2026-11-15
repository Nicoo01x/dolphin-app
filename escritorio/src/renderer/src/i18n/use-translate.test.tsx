// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { translate } from './i18n'
import { useIntlLocale, useTranslate } from './use-translate'

describe('useTranslate', () => {
  it('devuelve el mismo translate de siempre, con sus fallbacks', () => {
    const { result } = renderHook(() => useTranslate())

    // Why comparar contra `translate` y no contra un texto: lo que este hook promete es que lo
    // que devuelve traduce EXACTAMENTE igual que la función que usa el resto de la app. Si
    // algún día devolviera el `t` de i18next, los fallbacks se comportarían distinto.
    expect(result.current('clave.que.no.existe', 'texto de respaldo')).toBe(
      translate('clave.que.no.existe', 'texto de respaldo')
    )
  })

  it('sirve donde se espera una función con la firma de translate', () => {
    const { result } = renderHook(() => useTranslate())
    const t: typeof translate = result.current

    expect(typeof t).toBe('function')
    expect(t('otra.clave.inexistente', 'de respaldo')).toBe('de respaldo')
  })

  it('da el locale para formatear fechas y números', () => {
    const { result } = renderHook(() => useIntlLocale())

    // Un BCP 47 que `Intl` acepte; cuál depende del idioma de la interfaz.
    expect(() => new Intl.DateTimeFormat(result.current)).not.toThrow()
  })
})
