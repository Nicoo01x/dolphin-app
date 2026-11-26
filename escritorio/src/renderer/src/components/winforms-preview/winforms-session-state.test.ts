import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, reducirSesion } from './winforms-session-state'
import { raizDesdeRelativo } from './use-winforms-session'
import type { WinFormsEventoDeSesion } from '../../../../shared/winforms/winforms-preview-types'

const build = { ruta: 'C:\\b\\Ventas.dll', modificado: 1, origen: 'proyecto' as const }

const aplicar = (...eventos: WinFormsEventoDeSesion[]) =>
  eventos.reduce(reducirSesion, ESTADO_INICIAL)

describe('reducirSesion', () => {
  it('sigue las fases hasta que el formulario se ve', () => {
    const estado = aplicar(
      { evento: 'build', build, arquitectura: 'x86', desactualizado: null, intento: 1 },
      { evento: 'fase', fase: 'creando-formulario' },
      {
        evento: 'listo',
        pid: 1,
        titulo: 'Clientes',
        clase: 'A.frm',
        arquitectura: 'x86',
        clr: '4'
      },
      { evento: 'fase', fase: 'mostrando' },
      { evento: 'cuadro', ancho: 10, alto: 5, titulo: 'Clientes', png: 'AAA' }
    )
    expect(estado.fase).toBe('listo')
    expect(estado.cuadro).toEqual({ src: 'data:image/png;base64,AAA', ancho: 10, alto: 5 })
  })

  it('un build nuevo después de un descarte borra el error anterior', () => {
    const estado = aplicar(
      { evento: 'error', codigo: 'dependencia', mensaje: 'falta DevExpress' },
      { evento: 'descartado', build, motivo: 'falta DevExpress' },
      { evento: 'build', build, arquitectura: 'x64', desactualizado: null, intento: 2 }
    )
    expect(estado.error).toBeNull()
    expect(estado.descartados).toHaveLength(1)
  })

  it('cerrarse después de un error no tapa el error', () => {
    const estado = aplicar(
      { evento: 'error', codigo: 'constructor', mensaje: 'SqlException' },
      { evento: 'cerrado' }
    )
    expect(estado.fase).toBe('error')
    expect(estado.error?.codigo).toBe('constructor')
  })
})

describe('raizDesdeRelativo', () => {
  it('saca la carpeta del worktree', () => {
    expect(raizDesdeRelativo('D:\\repo\\ERP\\Forms\\frmA.cs', 'ERP/Forms/frmA.cs')).toBe('D:\\repo')
    expect(raizDesdeRelativo('/home/x/repo/a/b.cs', 'a/b.cs')).toBe('/home/x/repo')
  })

  it('null si la relativa no es sufijo', () => {
    expect(raizDesdeRelativo('D:\\repo\\a.cs', 'otro/a.cs')).toBeNull()
  })
})
