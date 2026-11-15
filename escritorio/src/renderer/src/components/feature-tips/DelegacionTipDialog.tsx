import { useRef, type JSX } from 'react'
import { translate } from '@/i18n/i18n'
import type { FeatureTip } from '../../../../shared/feature-tips'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FeatureTipActions } from './FeatureTipActions'
import {
  FeatureTipDialogFrame,
  FeatureTipEyebrow,
  FeatureTipSettingsLine
} from './FeatureTipDialogFrame'
import { DelegacionFeatureTipVisual } from './DelegacionFeatureTipVisual'

/**
 * El aviso de la delegación automática, con el mismo molde que los demás: la copia a la izquierda,
 * la muestra a la derecha, y el botón que prende la función.
 *
 * Lo que cambia respecto de sus hermanos es la muestra: acá es el clip de una delegación de verdad,
 * porque lo que hay que entender es un movimiento.
 */
export function DelegacionTipDialog({
  open,
  tip,
  primaryBusy,
  onOpenChange,
  onPrimaryAction,
  onSettingsClick
}: {
  open: boolean
  tip: FeatureTip
  primaryBusy: boolean
  onOpenChange: (open: boolean) => void
  onPrimaryAction: () => void
  onSettingsClick: () => void
}): JSX.Element {
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <FeatureTipDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        primaryButtonRef.current?.focus()
      }}
      visual={<DelegacionFeatureTipVisual />}
    >
      <DialogHeader className="gap-4 text-left">
        <div>
          <FeatureTipEyebrow label={tip.eyebrow} />
          <DialogTitle className="text-2xl leading-tight font-semibold tracking-tight md:text-[1.75rem]">
            {tip.title}
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed">
            <span className="block">{tip.description}</span>
            <span className="block">
              {translate(
                'auto.components.feature-tips.DelegacionTipDialog.howItWorks',
                'The lead picks who gets each part and with which model, and you watch the terminals open. If you would rather decide yourself, turn it off and keep delegating by hand.'
              )}
            </span>
            <FeatureTipSettingsLine
              text={translate(
                'auto.components.feature-tips.DelegacionTipDialog.settingsLine',
                'Change it or turn it off any time in <link>Settings → Automatic delegation</link>.'
              )}
              onClick={onSettingsClick}
            />
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogFooter className="mt-8 flex sm:justify-stretch">
        <FeatureTipActions
          currentTip={tip}
          primaryBusy={primaryBusy}
          onPrimaryAction={onPrimaryAction}
          onSkip={() => onOpenChange(false)}
          showSkip={false}
          fullWidth
          primaryButtonRef={primaryButtonRef}
          label={tip.ctaLabel}
        />
      </DialogFooter>
    </FeatureTipDialogFrame>
  )
}
