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
    className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${tones[tone]} ${className}`}
    {...props}
  >
    {children}
  </button>
))
IconButton.displayName = 'IconButton'
