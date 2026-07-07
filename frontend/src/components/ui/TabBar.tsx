import type { LucideIcon } from 'lucide-react'

export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: readonly { key: K; label: string; icon: LucideIcon }[]
  active: K
  onChange: (key: K) => void
  className?: string
}) {
  return (
    <div
      className={`-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0 ${className}`}
    >
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
            active === key
              ? 'border-pine text-pine-dark'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
