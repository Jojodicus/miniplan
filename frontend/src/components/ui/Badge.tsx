import type { ReactNode } from 'react'

type Tone = 'pine' | 'gold' | 'wine' | 'neutral'

const tones: Record<Tone, string> = {
  pine: 'bg-pine-tint text-pine-dark',
  gold: 'bg-gold-tint text-gold-dark',
  wine: 'bg-wine-tint text-wine',
  neutral: 'bg-paper-dim text-ink-soft',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
