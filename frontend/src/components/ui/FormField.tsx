import { RotateCcw } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { IconButton } from './IconButton'

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
  // Immer denselben Wrapper rendern (nicht nur, wenn `error` gesetzt ist): würde das <input> je
  // nach Fehlerstatus mal direkt, mal in einem <div> stehen, sieht React darin unterschiedliche
  // Elementtypen an derselben Position und mountet das Feld neu - der Cursor springt dann beim
  // Tippen aus dem Feld, sobald sich der Fehlerstatus zwischen Tastenanschlägen ändert.
  return (
    <div>
      <input
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={`${fieldChrome} ${
          error ? 'border-wine focus:border-wine focus:ring-wine/15' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="animate-fade mt-1 text-xs text-wine">{error}</p>}
    </div>
  )
})
Input.displayName = 'Input'

// Regler mit optionaler Kerbe an einem Referenzwert (z.B. dem Standardwert einer Einstellung),
// damit dessen Position auf der Skala sichtbar bleibt, während der Nutzer den Regler bewegt.
export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  markerValue,
  id,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  markerValue?: number
  id?: string
}) {
  const zuProzent = (wert: number) => ((wert - min) / (max - min)) * 100
  const gefuellt = zuProzent(value)
  return (
    <div className="relative flex h-10 items-center">
      <div
        className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-line"
        style={{
          background: `linear-gradient(to right, var(--color-pine) ${gefuellt}%, var(--color-line) ${gefuellt}%)`,
        }}
      />
      {markerValue !== undefined && (
        <div
          title={`Standard: ${markerValue}`}
          className="pointer-events-none absolute h-4 w-1 -translate-x-1/2 rounded-full bg-gold"
          style={{ left: `${zuProzent(markerValue)}%` }}
        />
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="relative w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-pine [&::-webkit-slider-thumb]:bg-paper [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-pine [&::-moz-range-thumb]:bg-paper [&::-moz-range-track]:bg-transparent"
      />
    </div>
  )
}

// Slider + Zahlenfeld für denselben Wert (Tippen ist auf einem Regler allein ungenau, v.a. bei
// Nachkommastellen wie den Zuteilungs-Gewichten) plus ein Reset-Button für dieses einzelne Feld,
// der nur erscheint, wenn der Wert vom Standard abweicht - der bestehende "Zurücksetzen"-Button
// setzt weiterhin alle Felder auf einmal zurück, das ist additiv dazu.
export function SliderWithNumberInput({
  value,
  onChange,
  min,
  max,
  step,
  markerValue,
  id,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  markerValue: number
  id?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Slider
          id={id}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          markerValue={markerValue}
        />
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const naechster = Number(e.target.value)
          if (!Number.isNaN(naechster)) onChange(naechster)
        }}
        className={`${fieldChrome} h-9 !w-20 px-2 text-right`}
      />
      {value !== markerValue && (
        <IconButton label="Auf Standard zurücksetzen" onClick={() => onChange(markerValue)}>
          <RotateCcw className="h-3.5 w-3.5" />
        </IconButton>
      )}
    </div>
  )
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select ref={ref} className={`${fieldChrome} pr-8 ${className}`} {...props}>
      {children}
    </select>
  ),
)
Select.displayName = 'Select'

export function Field({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

export function CheckboxChip({
  id,
  checked,
  onChange,
  disabled,
  title,
  children,
}: {
  id: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      title={title}
      className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pine/40 ${
        disabled ? 'cursor-not-allowed border-line text-ink-faint opacity-50' : 'cursor-pointer'
      } ${
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
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  )
}
