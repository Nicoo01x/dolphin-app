import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, FileInput, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import {
  aplicarBloqueEnElEditorAbierto,
  hayDondeAplicar,
  type ResultadoDeApply
} from '@/lib/aplicar-bloque-abierto'

/**
 * Meter en el archivo abierto un bloque de código que propuso el chat.
 *
 * Lo importante es lo que NO hace: si el bloque no se puede ubicar sin dudas —no está en el
 * archivo, o está en más de un lugar— no escribe nada y lo dice. Aplicar en el lugar equivocado
 * deja el archivo roto en otra parte, sin aviso, y la persona se entera mucho después.
 *
 * Lo que sí escribe entra como UNA edición del editor: se revisa ahí, en su contexto y con el
 * diff del margen, y Ctrl+Z la deshace igual que si la hubieras tipeado. Por eso el botón no abre
 * una previa propia: la previa es el archivo.
 */

type Estado = 'quieto' | ResultadoDeApply['estado']

const AVISO_MS = 2200

function iconoDe(estado: Estado): React.JSX.Element {
  if (estado === 'aplicado') {
    return <Check className="size-3.5" />
  }
  if (estado === 'quieto') {
    return <FileInput className="size-3.5" />
  }
  return <TriangleAlert className="size-3.5" />
}

function etiquetaDe(estado: Estado, archivo: string | null): string {
  if (estado === 'aplicado') {
    return archivo
      ? translate('components.native-chat.apply.done', 'Applied to {{value0}}', {
          value0: archivo
        })
      : translate('components.native-chat.apply.doneShort', 'Applied')
  }
  if (estado === 'ambiguo') {
    return translate(
      'components.native-chat.apply.ambiguous',
      'That code appears more than once here — nothing was changed.'
    )
  }
  if (estado === 'no-encontrado') {
    return translate(
      'components.native-chat.apply.notFound',
      'Could not find that code in the open file — nothing was changed.'
    )
  }
  if (estado === 'sin-editor') {
    return translate('components.native-chat.apply.noEditor', 'Open the file first.')
  }
  return translate('components.native-chat.apply.apply', 'Apply to the open file')
}

export function NativeChatApplyButton({
  code,
  className
}: {
  code: string
  className?: string
}): React.JSX.Element | null {
  const [estado, setEstado] = useState<Estado>('quieto')
  const [archivo, setArchivo] = useState<string | null>(null)
  const temporizador = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (temporizador.current !== null) {
        window.clearTimeout(temporizador.current)
      }
    }
  }, [])

  const aplicar = useCallback(() => {
    const resultado = aplicarBloqueEnElEditorAbierto(code)
    setEstado(resultado.estado)
    setArchivo(resultado.estado === 'sin-editor' ? null : resultado.archivo)
    if (temporizador.current !== null) {
      window.clearTimeout(temporizador.current)
    }
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null
      setEstado('quieto')
    }, AVISO_MS)
  }, [code])

  // Sin ningún archivo abierto el botón no tiene a dónde escribir, así que no se muestra: un
  // botón que siempre falla es ruido. Se lee en cada pintada, no una vez.
  if (!hayDondeAplicar()) {
    return null
  }

  const salioMal = estado !== 'quieto' && estado !== 'aplicado'
  const etiqueta = etiquetaDe(estado, archivo)

  return (
    <button
      type="button"
      onClick={aplicar}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        estado === 'aplicado' && 'text-status-success',
        salioMal && 'text-status-warning',
        className
      )}
    >
      {iconoDe(estado)}
    </button>
  )
}
