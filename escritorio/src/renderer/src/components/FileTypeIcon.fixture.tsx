import { defineFixture } from '../component-fixtures/component-fixture'
import { FileTypeIcon } from './FileTypeIcon'

const ARCHIVOS = [
  'Contoso.ERP.sln',
  'ERP.csproj',
  'Forms/frmSplash.cs',
  'Vista.xaml',
  'motor.cpp',
  'motor.h',
  'CMakeLists.txt',
  'src/app.tsx',
  'types/index.d.ts',
  'package.json',
  'Dockerfile',
  'main.py',
  'lib.rs',
  'Cargo.toml',
  'server.go',
  'README.md',
  'logo.svg',
  'foto.png',
  '.gitignore',
  'notas.zzqq'
]

export const lista = defineFixture({
  width: 260,
  render: () => (
    <div className="flex flex-col gap-1 bg-background p-3 text-xs text-foreground">
      {ARCHIVOS.map((ruta) => (
        <div key={ruta} className="flex h-6 items-center gap-2">
          <FileTypeIcon filePath={ruta} className="size-4 shrink-0" />
          <span className="truncate">{ruta.split('/').pop()}</span>
        </div>
      ))}
    </div>
  )
})
