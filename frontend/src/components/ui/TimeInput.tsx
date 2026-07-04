import { Input } from './FormField'

const VIERTELSTUNDEN = ['00', '15', '30', '45']

/**
 * Wrapper um das native `<input type="time">` (rendert bereits 24h-Format in allen gängigen
 * Locales, das Attribut `step` erzwingt zusätzlich Minutenauflösung ohne Sekunden). Ergänzt
 * das native Feld um vier Schnellauswahl-Buttons für die Viertelstunden, damit die Minuten
 * nicht immer einzeln hochgezählt werden müssen.
 */
export function TimeInput({
  id,
  value,
  onChange,
  required,
  error,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
}) {
  function setMinuten(minuten: string) {
    const stunde = value ? value.slice(0, 2) : '09'
    onChange(`${stunde}:${minuten}`)
  }

  return (
    <div>
      <Input
        id={id}
        type="time"
        step={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        error={error}
      />
      <div className="mt-1.5 flex gap-1">
        {VIERTELSTUNDEN.map((minuten) => (
          <button
            key={minuten}
            type="button"
            onClick={() => setMinuten(minuten)}
            className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-soft transition-colors hover:border-pine hover:text-pine-dark"
          >
            :{minuten}
          </button>
        ))}
      </div>
    </div>
  )
}
