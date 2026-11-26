import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buscarBuilds,
  buscarProyecto,
  configuracionDelBuild,
  fuenteMasNueva,
  leerCsproj,
  raizDelRepositorio
} from './winforms-build'
import { proyectosDeSolucion } from './winforms-build-search'

const csprojDeBiblioteca = `<Project>
  <PropertyGroup>
    <OutputType>Library</OutputType>
    <AssemblyName>Ventas</AssemblyName>
  </PropertyGroup>
  <PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Debug|x86' ">
    <OutputPath>bin\\Debug\\</OutputPath>
  </PropertyGroup>
  <PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Release|x86' ">
    <OutputPath>bin\\Release\\</OutputPath>
  </PropertyGroup>
  <ItemGroup><Compile Include="Forms\\frmClientes.cs" /></ItemGroup>
</Project>`

describe('leerCsproj', () => {
  it('lee nombre, tipo y salidas', () => {
    expect(leerCsproj(csprojDeBiblioteca)).toEqual({
      nombreEnsamblado: 'Ventas',
      extension: 'dll',
      salidas: ['bin/Debug/', 'bin/Release/']
    })
  })

  it('un WinExe produce un .exe', () => {
    expect(leerCsproj('<OutputType>WinExe</OutputType>').extension).toBe('exe')
  })
})

describe('proyectosDeSolucion', () => {
  it('devuelve los .csproj con ruta absoluta', () => {
    const sln = `Project("{FAE04EC0}") = "Ventas", "..\\Ventas\\Ventas.csproj", "{AD8C}"
EndProject
Project("{2150E333}") = "Docs", "Docs", "{1111}"
EndProject`
    const proyectos = proyectosDeSolucion(resolve('/repo', 'Menu', 'Menu.sln'), sln)
    expect(proyectos).toEqual([resolve('/repo', 'Ventas', 'Ventas.csproj')])
  })
})

describe('en disco', () => {
  let raiz: string
  const escribir = async (ruta: string, contenido = '', fecha?: Date): Promise<string> => {
    const completa = join(raiz, ruta)
    await mkdir(join(completa, '..'), { recursive: true })
    await writeFile(completa, contenido)
    if (fecha) {
      await utimes(completa, fecha, fecha)
    }
    return completa
  }

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'winforms-build-'))
    await mkdir(join(raiz, '.git'))
  })
  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true })
  })

  it('encuentra el proyecto hacia arriba y la raíz del repositorio', async () => {
    const proyecto = await escribir('Ventas/Ventas.csproj', csprojDeBiblioteca)
    const archivo = await escribir('Ventas/Forms/frmClientes.cs')
    expect(await buscarProyecto(archivo)).toBe(proyecto)
    expect(await raizDelRepositorio(join(raiz, 'Ventas'))).toBe(raiz)
  })

  it('usa la salida del proyecto, la más nueva primero', async () => {
    const proyecto = await escribir('Ventas/Ventas.csproj', csprojDeBiblioteca)
    const viejo = await escribir('Ventas/bin/Release/Ventas.dll', 'x', new Date(2025, 0, 1))
    const nuevo = await escribir('Ventas/bin/Debug/Ventas.dll', 'x', new Date(2026, 0, 1))
    await escribir('Deploy/Ventas.dll', 'x', new Date(2027, 0, 1))
    const builds = await buscarBuilds({ proyecto, csproj: leerCsproj(csprojDeBiblioteca), raiz })
    // Con salida propia no se recorre el repositorio.
    expect(builds.map((b) => b.ruta)).toEqual([nuevo, viejo])
  })

  it('sin salida propia busca copias y el bin de los vecinos de la solución', async () => {
    const proyecto = await escribir('Ventas/Ventas.csproj', csprojDeBiblioteca)
    const deploy = await escribir('Deploy/App v2/Ventas.dll', 'x', new Date(2026, 1, 1))
    await escribir(
      'Menu/Menu.sln',
      'Project("{F}") = "Ventas", "..\\Ventas\\Ventas.csproj", "{A}"\nProject("{F}") = "Menu", "Menu\\Menu.csproj", "{B}"'
    )
    await escribir('Menu/Menu/Menu.csproj', '<OutputType>WinExe</OutputType>')
    const vecino = await escribir('Menu/Menu/bin/Debug/Ventas.dll', 'x', new Date(2026, 0, 1))
    const builds = await buscarBuilds({ proyecto, csproj: leerCsproj(csprojDeBiblioteca), raiz })
    expect(builds.map((b) => b.ruta)).toEqual([deploy, vecino])
    expect(builds.every((b) => b.origen === 'repositorio')).toBe(true)
  })

  it('pone primero el build que funcionó la última vez', async () => {
    const proyecto = await escribir('Ventas/Ventas.csproj', csprojDeBiblioteca)
    await escribir('Ventas/bin/Debug/Ventas.dll', 'x', new Date(2026, 0, 1))
    const elegido = await escribir('Otro/Ventas.dll', 'x', new Date(2020, 0, 1))
    const builds = await buscarBuilds({
      proyecto,
      csproj: leerCsproj(csprojDeBiblioteca),
      raiz: null,
      preferido: elegido
    })
    expect(builds[0]?.ruta).toBe(elegido)
  })

  it('avisa cuando el .cs es más nuevo que el build', async () => {
    const build = {
      ruta: 'x',
      modificado: new Date(2026, 0, 1).getTime(),
      origen: 'proyecto' as const
    }
    const viejo = await escribir('a.cs', '', new Date(2025, 0, 1))
    const nuevo = await escribir('b.Designer.cs', '', new Date(2026, 5, 1))
    expect((await fuenteMasNueva(build, [viejo, nuevo, join(raiz, 'no.resx')]))?.fuente).toBe(nuevo)
    expect(await fuenteMasNueva(build, [viejo])).toBeNull()
  })

  it('elige el .config de la app para una dll', async () => {
    const dll = await escribir('bin/Ventas.dll')
    const config = await escribir('bin/App.exe.config')
    expect(await configuracionDelBuild(dll)).toBe(config)
    const propio = await escribir('bin/Ventas.dll.config')
    expect(await configuracionDelBuild(dll)).toBe(propio)
  })
})
