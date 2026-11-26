import { AppWindow, Check, ChevronDown, FolderOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getIntlLocale } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import type { WinFormsBuild } from '../../../../shared/winforms/winforms-preview-types'

const fecha = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString(getIntlLocale(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : ''

/** `D:\a\b\c\bin\Debug\ERP.dll` → `…\bin\Debug\ERP.dll`: lo que distingue un build de otro. */
export function rutaCorta(ruta: string, partes = 3): string {
  const trozos = ruta.split(/[\\/]/)
  return trozos.length > partes ? `…\\${trozos.slice(-partes).join('\\')}` : ruta
}

/**
 * La barra de la pestaña, con la forma de la del navegador: recargar, una «dirección» que dice qué
 * clase de qué build se está viendo, y el menú para cambiar de build.
 */
export function WinFormsPreviewToolbar({
  clase,
  titulo,
  build,
  arquitectura,
  builds,
  onRecargar,
  onUsarBuild,
  onElegirEnsamblado
}: {
  clase: string
  titulo: string
  build: WinFormsBuild | null
  arquitectura: 'x86' | 'x64' | null
  builds: readonly WinFormsBuild[]
  onRecargar: () => void
  onUsarBuild: (ruta: string) => void
  onElegirEnsamblado: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const recargar = t('winformsPreview.reload', 'Reopen the form')
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={recargar}
            onClick={onRecargar}
          >
            <RefreshCw className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{recargar}</TooltipContent>
      </Tooltip>
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-2.5 text-[13px]">
        <AppWindow className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">
          <span className="text-foreground">{clase}</span>
          {titulo ? <span className="text-muted-foreground"> — {titulo}</span> : null}
        </span>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 max-w-[45%] gap-1 px-2 text-xs font-normal text-muted-foreground"
          >
            <span className="truncate">
              {build
                ? `${rutaCorta(build.ruta, 1)}${arquitectura ? ` · ${arquitectura}` : ''}`
                : t('winformsPreview.noBuild', 'No build')}
            </span>
            <ChevronDown className="size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[380px]">
          <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
            {t('winformsPreview.buildsFound', 'Builds found, newest first')}
          </DropdownMenuLabel>
          {builds.map((b) => (
            <DropdownMenuItem
              key={b.ruta}
              className="items-start gap-2"
              onSelect={() => onUsarBuild(b.ruta)}
            >
              <Check
                className={`mt-0.5 size-3.5 shrink-0 ${b.ruta === build?.ruta ? '' : 'invisible'}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-xs" title={b.ruta}>
                  {rutaCorta(b.ruta, 4)}
                </span>
                <span className="block text-2xs text-muted-foreground">{fecha(b.modificado)}</span>
              </span>
            </DropdownMenuItem>
          ))}
          {builds.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem className="gap-2" onSelect={onElegirEnsamblado}>
            <FolderOpen className="size-3.5" />
            {t('winformsPreview.pickAssembly', 'Choose assembly…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export { fecha as fechaDeBuild }
