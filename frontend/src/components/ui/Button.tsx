import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary: 'bg-pine text-paper hover:bg-pine-dark shadow-sm shadow-pine/20',
  secondary: 'bg-transparent text-ink border border-line hover:border-pine hover:text-pine-dark',
  ghost: 'bg-transparent text-ink-soft hover:bg-pine-tint hover:text-pine-dark',
  danger: 'bg-transparent text-wine border border-wine/30 hover:bg-wine-tint',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = 'primary', size = 'md', className = '', ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
})
Button.displayName = 'Button'
