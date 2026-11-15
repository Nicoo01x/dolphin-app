import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearPreferenciasDeIsla } from './dolphin-isla-preferencias'

let carpeta = ''
beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'isla-preferencias-'))
})
afterEach(async () => {
  await rm(carpeta, { recursive: true, force: true })
})

describe('las preferencias de la isla', () => {
  it('sobreviven a un reinicio: otra instancia lee lo que guardó la anterior', async () => {
    const ruta = join(carpeta, 'dolphin-isla.json')
    const antes = crearPreferenciasDeIsla(ruta)
    await antes.guardar({ armado: { orden: ['notas'], ocultas: [] } })
    await antes.guardar({ notas: 'llamar a Pablo' })
    await antes.guardar({ avisos: false })

    const despues = crearPreferenciasDeIsla(ruta)
    expect(await despues.leer()).toEqual({
      armado: { orden: ['notas'], ocultas: [] },
      notas: 'llamar a Pablo',
      avisos: false
    })
  })

  it('con muchos cambios seguidos queda escrito el último', async () => {
    const ruta = join(carpeta, 'dolphin-isla.json')
    const guarda = crearPreferenciasDeIsla(ruta)
    await Promise.all(['h', 'ho', 'hol', 'hola'].map((notas) => guarda.guardar({ notas })))
    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ notas: 'hola' })
  })

  it('si el archivo existe pero no se puede leer, no se escribe encima y la isla lo sabe', async () => {
    // Una carpeta en el lugar del archivo: leerla falla con algo que no es «no existe».
    const ruta = join(carpeta, 'ocupado')
    await mkdir(ruta)
    const guarda = crearPreferenciasDeIsla(ruta)

    await guarda.guardar({ armado: { orden: ['notas'], ocultas: [] } })

    expect((await stat(ruta)).isDirectory()).toBe(true)
    // null: la isla deja la nota en solo lectura en vez de mostrarla vacía y pisarla después.
    expect(await guarda.leer()).toBeNull()
  })

  it('lo que esperó en memoria se suma cuando el archivo se vuelve a poder leer', async () => {
    const ruta = join(carpeta, 'dolphin-isla.json')
    await mkdir(ruta)
    const guarda = crearPreferenciasDeIsla(ruta)
    await guarda.guardar({ armado: { orden: ['notas'], ocultas: [] } })

    await rm(ruta, { recursive: true })
    await writeFile(ruta, JSON.stringify({ notas: 'la de antes' }), 'utf8')
    await guarda.guardar({})

    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({
      notas: 'la de antes',
      armado: { orden: ['notas'], ocultas: [] }
    })
  })

  it('un archivo roto o con otra forma arranca vacío', async () => {
    const ruta = join(carpeta, 'dolphin-isla.json')
    await writeFile(ruta, '[1, 2]', 'utf8')
    expect(await crearPreferenciasDeIsla(ruta).leer()).toEqual({})
    await writeFile(ruta, '{ roto', 'utf8')
    expect(await crearPreferenciasDeIsla(ruta).leer()).toEqual({})
  })
})
