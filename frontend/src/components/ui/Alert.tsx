import { AlertCircle, Info } from 'lucide-react'

type Tone = 'error' | 'info'

const tones: Record<Tone, string> = {
  error: 'border-wine/25 bg-wine-tint text-wine',
  info: 'border-pine/25 bg-pine-tint/60 text-pine-dark',
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: Tone
  children: React.ReactNode
}) {
  const Icon = tone === 'error' ? AlertCircle : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
