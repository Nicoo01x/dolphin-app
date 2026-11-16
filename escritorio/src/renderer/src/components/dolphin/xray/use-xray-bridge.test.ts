import { describe, expect, it } from 'vitest'
import { avisoFinalDeBug, textoDeFalloBug } from './use-xray-bridge'

describe('aviso final del reporte de X-ray', () => {
  it('traduce código 0 como arreglado y conserva el último renglón', () => {
    expect(avisoFinalDeBug(0, 'La prueba pasa')).toMatchObject({
      tipo: 'ok',
      texto: expect.stringContaining('La prueba pasa')
    })
  })

  it('traduce código 1 como no arreglado y conserva el último renglón', () => {
    expect(avisoFinalDeBug(1, 'La prueba sigue fallando')).toMatchObject({
      tipo: 'error',
      texto: expect.stringContaining('La prueba sigue fallando')
    })
  })

  it.each([
    ['incomplete', 'The report was incomplete.'],
    ['already-running', 'A report is already in progress.'],
    [
      'dolphin-missing',
      'Dolphin is not in C:/faltante. Reinstall the app, or set DOLPHIN_APP_DIR to the dolphin-app repo folder and open the app again.'
    ]
  ] as const)('traduce el fallo %s sin mostrar el código crudo', (code, expected) => {
    expect(textoDeFalloBug(code, code === 'dolphin-missing' ? 'C:/faltante' : undefined)).toBe(
      expected
    )
  })
})
