import { Badge } from '@/components/ui/badge'

export function NativeChatPromptPill({
  icon,
  label,
  selected,
  ...badgeProps
}: {
  icon: React.ReactNode
  label: string
  selected: boolean
  title?: string
}): React.JSX.Element {
  return (
    <Badge variant="promptPill" data-selected={selected} {...badgeProps}>
      {icon}
      <span className="truncate">{label}</span>
    </Badge>
  )
}
