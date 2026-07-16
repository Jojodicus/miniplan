import type { LucideIcon } from 'lucide-react'

type Variant = 'underline' | 'pills'

export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  variant = 'underline',
  className = '',
}: {
  tabs: readonly { key: K; label: string; icon: LucideIcon }[]
  active: K
  onChange: (key: K) => void
  /** 'pills' für untergeordnete Tab-Ebenen, damit zwei gestapelte Tab-Leisten
   * nicht identisch aussehen. */
  variant?: Variant
  className?: string
}) {
  if (variant === 'pills') {
    return (
      <div role="tablist" className={`flex flex-wrap gap-1.5 ${className}`}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => onChange(key)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              active === key
                ? 'border-pine bg-pine-tint text-pine-dark'
                : 'border-line text-ink-soft hover:border-ink-faint hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div role="tablist" className={`flex flex-wrap gap-1 border-b border-line ${className}`}>
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={active === key}
          title={label}
          onClick={() => onChange(key)}
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
            active === key
              ? 'border-pine text-pine-dark'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
