import { describe, expect, it } from 'vitest'
import { arquitecturaDelHost, leerInfoPe, type InfoPe } from './winforms-pe'

/** Un PE mínimo: DOS, cabecera COFF, opcional con el directorio CLR y una sección que lo contiene. */
function pe({
  maquina = 0x14c,
  pe32Plus = false,
  dll = true,
  clrFlags = 0x1 as number | null
} = {}): Buffer {
  const buffer = Buffer.alloc(0x400)
  buffer.writeUInt16LE(0x5a4d, 0)
  const e = 0x80
  buffer.writeUInt32LE(e, 0x3c)
  buffer.writeUInt32LE(0x4550, e)
  buffer.writeUInt16LE(maquina, e + 4)
  buffer.writeUInt16LE(1, e + 6)
  const tamOpcional = pe32Plus ? 240 : 224
  buffer.writeUInt16LE(tamOpcional, e + 20)
  buffer.writeUInt16LE(dll ? 0x2002 : 0x0002, e + 22)
  const opcional = e + 24
  buffer.writeUInt16LE(pe32Plus ? 0x20b : 0x10b, opcional)
  const directorios = opcional + (pe32Plus ? 112 : 96)
  if (clrFlags !== null) {
    buffer.writeUInt32LE(0x2008, directorios + 14 * 8)
    buffer.writeUInt32LE(72, directorios + 14 * 8 + 4)
  }
  const seccion = opcional + tamOpcional
  buffer.writeUInt32LE(0x1000, seccion + 8)
  buffer.writeUInt32LE(0x2000, seccion + 12)
  buffer.writeUInt32LE(0x200, seccion + 16)
  buffer.writeUInt32LE(0x200, seccion + 20)
  if (clrFlags !== null) {
    buffer.writeUInt32LE(clrFlags, 0x200 + 8 + 16)
  }
  return buffer
}

const leer = (b: Buffer) => async (desde: number, largo: number) => b.subarray(desde, desde + largo)

describe('leerInfoPe', () => {
  it('lee un ensamblado AnyCPU', async () => {
    expect(await leerInfoPe(leer(pe()))).toEqual({
      esNet: true,
      maquina: 'x86',
      esDll: true,
      requiere32: false,
      prefiere32: false
    })
  })

  it('lee las banderas de 32 bits', async () => {
    expect((await leerInfoPe(leer(pe({ clrFlags: 0x3 }))))?.requiere32).toBe(true)
    const exe = await leerInfoPe(leer(pe({ dll: false, clrFlags: 0x20003 })))
    expect(exe?.prefiere32).toBe(true)
    expect(exe?.esDll).toBe(false)
  })

  it('lee un PE32+ de x64', async () => {
    expect((await leerInfoPe(leer(pe({ maquina: 0x8664, pe32Plus: true }))))?.maquina).toBe('x64')
  })

  it('distingue un ejecutable nativo', async () => {
    expect((await leerInfoPe(leer(pe({ clrFlags: null }))))?.esNet).toBe(false)
  })

  it('devuelve null si no es un PE', async () => {
    expect(await leerInfoPe(leer(Buffer.from('no soy un exe'.padEnd(200, ' '))))).toBeNull()
  })
})

const info = (cambios: Partial<InfoPe>): InfoPe => ({
  esNet: true,
  maquina: 'x86',
  esDll: true,
  requiere32: false,
  prefiere32: false,
  ...cambios
})

describe('arquitecturaDelHost', () => {
  it('respeta x86 y x64 explícitos', () => {
    expect(arquitecturaDelHost(info({ requiere32: true }), [])).toBe('x86')
    expect(arquitecturaDelHost(info({ maquina: 'x64' }), [])).toBe('x64')
  })

  it('un AnyCPU corre como la app de al lado', () => {
    const appDe32 = info({ esDll: false, requiere32: true })
    expect(arquitecturaDelHost(info({}), [appDe32])).toBe('x86')
    expect(arquitecturaDelHost(info({}), [info({ esDll: false })])).toBe('x64')
    expect(arquitecturaDelHost(info({}), [])).toBe('x64')
  })

  it('un exe AnyCPU que prefiere 32 bits va en x86', () => {
    expect(arquitecturaDelHost(info({ esDll: false, prefiere32: true }), [])).toBe('x86')
  })

  it('no hay host para ARM64', () => {
    expect(arquitecturaDelHost(info({ maquina: 'arm64' }), [])).toBeNull()
  })
})
