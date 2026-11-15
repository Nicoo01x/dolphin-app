import { FolderPlus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { Button } from '@/components/ui/button'

/**
 * Perfil nuevo: la acción de la pantalla, sobre la franja del mundo. Primario, grande y primero:
 * sin un proyecto no hay dónde poner a nadie a trabajar.
 *
 * Los agentes de la máquina ya no se listan en el inicio: se eligen en el compositor.
 */
export function BotonAgregarProyecto(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  return (
    <Button size="lg" className="w-fit" onClick={() => openModal('add-repo')}>
      <FolderPlus className="size-4" />
      {translate('auto.components.Landing.f9eaa9e12d', 'Add project')}
    </Button>
  )
}
