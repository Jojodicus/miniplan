import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

const fieldChrome =
  'w-full rounded-md border border-line bg-paper px-3 h-10 text-sm text-ink placeholder:text-ink-faint outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15'

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode
  htmlFor?: string
  hint?: string
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
        {children}
      </label>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  )
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: string }
>(({ className = '', error, ...props }, ref) => {
  const input = (
    <input
      ref={ref}
      aria-invalid={error ? true : undefined}
      className={`${fieldChrome} ${
        error ? 'border-wine focus:border-wine focus:ring-wine/15' : ''
      } ${className}`}
      {...props}
    />
  )
  if (!error) return input
  return (
    <div>
      {input}
      <p className="mt-1 text-xs text-wine">{error}</p>
    </div>
  )
})
Input.displayName = 'Input'

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className = '', children, ...props }, ref) => (
  <select ref={ref} className={`${fieldChrome} pr-8 ${className}`} {...props}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function Field({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

export function CheckboxChip({
  id,
  checked,
  onChange,
  children,
}: {
  id: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        checked
          ? 'border-pine bg-pine-tint text-pine-dark'
          : 'border-line text-ink-soft hover:border-ink-faint'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {children}
    </label>
  )
}
