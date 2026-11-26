import { open } from 'node:fs/promises'

/**
 * Lo mínimo del encabezado PE de un .exe/.dll para elegir el host: si es .NET y para qué
 * arquitectura. El host tiene que coincidir: un ensamblado x86 en un proceso x64 da BadImageFormat.
 */
export type InfoPe = {
  esNet: boolean
  maquina: 'x86' | 'x64' | 'arm64' | 'otra'
  /** COMIMAGE_FLAGS_32BITREQUIRED: sólo corre en 32 bits. */
  requiere32: boolean
  /** COMIMAGE_FLAGS_32BITPREFERRED: AnyCPU que prefiere 32 bits (lo usa el .exe, no la .dll). */
  prefiere32: boolean
  esDll: boolean
}

type Lector = (desde: number, largo: number) => Promise<Buffer>

const MAQUINAS: Record<number, InfoPe['maquina']> = {
  0x14c: 'x86',
  0x8664: 'x64',
  0xaa64: 'arm64'
}

/** Lee el encabezado con un lector de bytes; null si no es un PE. */
export async function leerInfoPe(leer: Lector): Promise<InfoPe | null> {
  const dos = await leer(0, 64)
  if (dos.length < 64 || dos.readUInt16LE(0) !== 0x5a4d) {
    return null
  }
  const pe = dos.readUInt32LE(0x3c)
  const cabecera = await leer(pe, 24 + 240)
  if (cabecera.length < 24 + 112 || cabecera.readUInt32LE(0) !== 0x4550) {
    return null
  }
  const maquina = MAQUINAS[cabecera.readUInt16LE(4)] ?? 'otra'
  const secciones = cabecera.readUInt16LE(6)
  const tamOpcional = cabecera.readUInt16LE(20)
  const esDll = (cabecera.readUInt16LE(22) & 0x2000) !== 0
  const opcional = 24
  const magia = cabecera.readUInt16LE(opcional)
  const directorios = opcional + (magia === 0x20b ? 112 : 96)
  // El directorio 14 es el encabezado CLR: si no está, el archivo no es .NET.
  const entradaClr = directorios + 14 * 8
  const rvaClr = cabecera.length >= entradaClr + 8 ? cabecera.readUInt32LE(entradaClr) : 0
  const base = { maquina, esDll, requiere32: false, prefiere32: false }
  if (rvaClr === 0) {
    return { ...base, esNet: false }
  }
  const tabla = await leer(pe + 24 + tamOpcional, secciones * 40)
  for (let i = 0; i < secciones && (i + 1) * 40 <= tabla.length; i++) {
    const s = i * 40
    const virtual = tabla.readUInt32LE(s + 12)
    const tamVirtual = Math.max(tabla.readUInt32LE(s + 8), tabla.readUInt32LE(s + 16))
    if (rvaClr >= virtual && rvaClr < virtual + tamVirtual) {
      const offset = tabla.readUInt32LE(s + 20) + (rvaClr - virtual)
      const clr = await leer(offset, 20)
      if (clr.length < 20) {
        break
      }
      const flags = clr.readUInt32LE(16)
      return {
        ...base,
        esNet: true,
        requiere32: (flags & 0x2) !== 0,
        prefiere32: (flags & 0x20000) !== 0
      }
    }
  }
  return { ...base, esNet: true }
}

export async function leerInfoPeDeArchivo(ruta: string): Promise<InfoPe | null> {
  const archivo = await open(ruta, 'r')
  try {
    return await leerInfoPe(async (desde, largo) => {
      const buffer = Buffer.alloc(largo)
      const { bytesRead } = await archivo.read(buffer, 0, largo, desde)
      return buffer.subarray(0, bytesRead)
    })
  } catch {
    return null
  } finally {
    await archivo.close()
  }
}

/**
 * La arquitectura del host para este ensamblado. Un AnyCPU corre como lo haría la app: si al lado hay
 * un .exe de 32 bits (la app que lo carga), en 32; si no, en 64. Null si ningún host sirve (ARM64).
 */
export function arquitecturaDelHost(
  info: InfoPe,
  exesVecinos: readonly InfoPe[]
): 'x86' | 'x64' | null {
  if (info.maquina === 'x64') {
    return 'x64'
  }
  if (info.maquina !== 'x86') {
    return null
  }
  if (info.requiere32 || (!info.esDll && info.prefiere32)) {
    return 'x86'
  }
  const appDe32 = exesVecinos.some(
    (exe) => exe.esNet && exe.maquina === 'x86' && (exe.requiere32 || exe.prefiere32)
  )
  return appDe32 ? 'x86' : 'x64'
}
