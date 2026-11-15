import { describe, expect, it } from 'vitest'
import { actividadDesde, lenguajeDe, mismaActividad, nombreDelArchivo } from './discord-presencia'

describe('el lenguaje que se muestra', () => {
  it('se lee como lo escribe una persona, no como el id del editor', () => {
    expect(lenguajeDe('motor.ts')).toBe('TypeScript')
    expect(lenguajeDe('Panel.tsx')).toBe('TypeScript')
    expect(lenguajeDe('lote.py')).toBe('Python')
    expect(lenguajeDe('main.rs')).toBe('Rust')
    expect(lenguajeDe('motor.cpp')).toBe('C++')
    expect(lenguajeDe('Programa.cs')).toBe('C#')
    expect(lenguajeDe('deploy.sh')).toBe('Shell')
  })

  it('sin archivo no hay lenguaje', () => {
    expect(lenguajeDe(null)).toBeNull()
  })

  // `plaintext` es «no sé qué es»: decir «Plaintext» sería afirmar algo que no se sabe.
  it('un archivo que no se reconoce no inventa lenguaje', () => {
    expect(lenguajeDe('notas')).toBeNull()
    expect(lenguajeDe('archivo.qqq')).toBeNull()
  })
})

describe('el archivo que se muestra', () => {
  // La ruta de un archivo dice dónde vive la persona y en qué trabaja. A Discord va el nombre.
  it('va sin su ruta', () => {
    expect(nombreDelArchivo('D:\\proyectos\\tienda-web\\src\\motor.ts')).toBe('motor.ts')
    expect(nombreDelArchivo('src/modules/carrito/lote.ts')).toBe('lote.ts')
  })

  it('sin archivo no devuelve nada', () => {
    expect(nombreDelArchivo(null)).toBeNull()
    expect(nombreDelArchivo('')).toBeNull()
  })
})

describe('la actividad que ve Discord', () => {
  it('arriba el proyecto, abajo el lenguaje con el archivo', () => {
    expect(actividadDesde({ proyecto: 'tienda-web', archivo: 'src/lote.ts', desde: 10 })).toEqual({
      details: 'tienda-web',
      state: 'TypeScript · lote.ts',
      timestamps: { start: 10 }
    })
  })

  it('sin proyecto no dice «proyecto desconocido»: omite la línea', () => {
    const actividad = actividadDesde({ proyecto: null, archivo: 'a.rs', desde: 1 })
    expect(actividad.details).toBeUndefined()
    expect(actividad.state).toBe('Rust · a.rs')
  })

  it('con un archivo sin lenguaje reconocido muestra el archivo solo', () => {
    expect(actividadDesde({ proyecto: 'Dolphin', archivo: 'LICENSE', desde: 1 }).state).toBe(
      'LICENSE'
    )
  })

  it('sin nada abierto deja solo el reloj', () => {
    expect(actividadDesde({ proyecto: null, archivo: null, desde: 5 })).toEqual({
      timestamps: { start: 5 }
    })
  })

  /**
   * Discord rechaza el `SET_ACTIVITY` entero si un campo pasa de 128 caracteres: no lo recorta
   * solo. Un nombre de proyecto largo haría desaparecer la presencia completa.
   */
  it('recorta lo que pasa de 128 caracteres', () => {
    const largo = 'x'.repeat(300)
    const actividad = actividadDesde({ proyecto: largo, archivo: null, desde: 1 })
    expect(actividad.details).toHaveLength(128)
    expect(actividad.details?.endsWith('…')).toBe(true)
  })

  // Y también rechaza menos de 2 caracteres, que es el otro borde del mismo límite.
  it('omite una línea de un solo carácter en vez de mandarla', () => {
    expect(actividadDesde({ proyecto: 'a', archivo: null, desde: 1 }).details).toBeUndefined()
  })

  it('un proyecto con espacios de más no cuenta como nombre', () => {
    expect(actividadDesde({ proyecto: '   ', archivo: null, desde: 1 }).details).toBeUndefined()
  })
})

describe('no mandar dos veces lo mismo', () => {
  it('dos actividades iguales se reconocen', () => {
    const a = actividadDesde({ proyecto: 'Dolphin', archivo: 'a.ts', desde: 1 })
    const b = actividadDesde({ proyecto: 'Dolphin', archivo: 'a.ts', desde: 1 })
    expect(mismaActividad(a, b)).toBe(true)
  })

  it('cambiar de archivo es otra actividad', () => {
    const a = actividadDesde({ proyecto: 'Dolphin', archivo: 'a.ts', desde: 1 })
    const b = actividadDesde({ proyecto: 'Dolphin', archivo: 'b.py', desde: 1 })
    expect(mismaActividad(a, b)).toBe(false)
  })

  // Dos archivos distintos del mismo lenguaje tienen que seguir siendo distintos.
  it('el mismo lenguaje con otro archivo es otra actividad', () => {
    const a = actividadDesde({ proyecto: 'Dolphin', archivo: 'a.ts', desde: 1 })
    const b = actividadDesde({ proyecto: 'Dolphin', archivo: 'b.ts', desde: 1 })
    expect(mismaActividad(a, b)).toBe(false)
  })
})
