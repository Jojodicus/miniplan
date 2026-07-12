import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Tone = 'neutral' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'text-ink-faint hover:bg-pine-tint hover:text-pine-dark',
  danger: 'text-ink-faint hover:bg-wine-tint hover:text-wine',
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; label: string }
>(({ tone = 'neutral', label, className = '', children, ...props }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    // Größerer Tap-Ziel-Bereich auf Mobilgeräten (h-10/w-10 ≈ 40px statt 32px) - auf Touch ist
    // Präzision knapper als am Desktop, wo die kompaktere Größe erhalten bleibt.
    className={`inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8 ${tones[tone]} ${className}`}
    {...props}
  >
    {children}
  </button>
))
IconButton.displayName = 'IconButton'
