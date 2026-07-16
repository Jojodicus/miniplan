import { forwardRef, useState } from 'react'
import type { Filtertag } from '../../api/minis'
import type { Filtertag as FiltertagDef } from '../../api/filtertags'
import type { Gruppe } from '../../api/gruppen'
import { Button } from '../../components/ui/Button'
import { CheckboxChip, Input, Label } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { Check, Plus, X } from 'lucide-react'

// Gemeinsame Komponenten-Bausteine, die von mehreren Stammdaten-Sektionen verwendet werden (siehe
// `StammdatenPage/index.tsx` für die Aufteilung nach Sektion). Reine Helfer stehen in `helpers.ts`.

// Kleiner "+ Neu"-Button für die Kartenkopfzeile, dient zugleich als Anker für das
// Anlege-Popover.
export const NeuButton = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(
  ({ label, onClick }, ref) => (
    <Button ref={ref} type="button" size="sm" title={label} onClick={onClick}>
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  ),
)
NeuButton.displayName = 'NeuButton'

// Einfaches Ein-Feld-Anlege-Formular im Popover (Name + Speichern/Abbrechen).
export function InlineNeuForm({
  fieldId,
  fieldLabel = 'Name',
  placeholder,
  onSave,
  onCancel,
}: {
  fieldId: string
  fieldLabel?: string
  placeholder?: string
  onSave: (wert: string) => void
  onCancel: () => void
}) {
  const [wert, setWert] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(wert)
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <Label htmlFor={fieldId}>{fieldLabel}</Label>
        <Input
          id={fieldId}
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          placeholder={placeholder}
          autoFocus
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={!wert.trim()}>
          Anlegen
        </Button>
      </div>
    </form>
  )
}

// Inline-Bearbeiten einer einfachen Textzeile (Zeile wechselt selbst in einen Eingabe-Zustand)
// statt eines separaten Modals - für einfache Ein-Feld-Entitäten wie Gruppen.
export function InlineTextEdit({
  fieldId,
  fieldLabel = 'Name',
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  fieldId: string
  fieldLabel?: string
  value: string
  onSave: (wert: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [wert, setWert] = useState(value)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(wert)
      }}
      className="flex flex-1 items-center gap-2"
    >
      <Input
        id={fieldId}
        aria-label={fieldLabel}
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        placeholder={placeholder}
        autoFocus
        required
        className="h-9"
      />
      <IconButton label="Speichern" type="submit">
        <Check className="h-4 w-4" />
      </IconButton>
      <IconButton label="Abbrechen" onClick={onCancel}>
        <X className="h-4 w-4" />
      </IconButton>
    </form>
  )
}

// Aktionsleiste am Ende eines Modal-Formulars (Abbrechen + Speichern).
export function ModalAktionen({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  )
}

// Gemeinsame Chip-Auswahl für alle "genau eine Option aus einer kleinen Liste"-Felder (Gruppe,
// Verfügbarkeits-Status), damit sie nicht mal als <select>, mal als Chips daherkommen.
function ChipAuswahl<T extends string | number>({
  label,
  hint,
  options,
  ausgewaehlt,
  onChange,
  idPrefix,
  allowNone = false,
  noneLabel = 'Keiner',
  emptyText,
}: {
  label: string
  hint?: string
  options: { key: T; label: string }[]
  ausgewaehlt: T | null
  onChange: (wert: T | null) => void
  idPrefix: string
  allowNone?: boolean
  noneLabel?: string
  emptyText?: string
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-ink-soft">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowNone && (
            <CheckboxChip
              id={`${idPrefix}-keiner`}
              checked={ausgewaehlt === null}
              onChange={() => onChange(null)}
            >
              {noneLabel}
            </CheckboxChip>
          )}
          {options.map((option) => (
            <CheckboxChip
              key={option.key}
              id={`${idPrefix}-${option.key}`}
              checked={ausgewaehlt === option.key}
              onChange={() => onChange(option.key)}
            >
              {option.label}
            </CheckboxChip>
          ))}
        </div>
      )}
    </div>
  )
}

export function FiltertagAuswahl({
  filtertags,
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  filtertags: FiltertagDef[]
  ausgewaehlt: Filtertag | null
  onChange: (tag: Filtertag | null) => void
  idPrefix: string
}) {
  return (
    <ChipAuswahl
      label="Verfügbarkeits-Status"
      options={filtertags.map((f) => ({ key: f.key, label: f.label }))}
      ausgewaehlt={ausgewaehlt}
      onChange={onChange}
      idPrefix={idPrefix}
      allowNone
      emptyText="Noch keine Verfügbarkeits-Status angelegt (Reiter „Verfügbarkeits-Status“)."
    />
  )
}

export function GruppenAuswahl({
  gruppen,
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  gruppen: Gruppe[]
  ausgewaehlt: number | ''
  onChange: (gruppeId: number) => void
  idPrefix: string
}) {
  return (
    <ChipAuswahl
      label="Gruppe"
      options={gruppen.map((g) => ({ key: g.id, label: g.name }))}
      ausgewaehlt={ausgewaehlt === '' ? null : ausgewaehlt}
      onChange={(wert) => {
        if (wert !== null) onChange(wert)
      }}
      idPrefix={idPrefix}
      emptyText="Noch keine Gruppen angelegt (Reiter „Gruppen“)."
    />
  )
}
