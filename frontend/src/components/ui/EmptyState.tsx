import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: string
}) {
  return (
    <div className="animate-fade flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-paper-dim text-ink-faint">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-medium text-ink-soft">{title}</p>
      {description && <p className="max-w-xs text-sm text-ink-faint">{description}</p>}
    </div>
  )
}
