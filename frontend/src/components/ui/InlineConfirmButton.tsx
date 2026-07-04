import { Check, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from './IconButton'

/**
 * Löschen-Button, der beim Klick inline zu einem Bestätigen/Abbrechen-Paar wird, statt ein
 * natives `confirm()`-Dialogfenster zu öffnen. Erst der Bestätigen-Klick löst `onConfirm` aus
 * (typischerweise ein DELETE-Request); Abbrechen verwirft ohne jeden Request.
 */
export function InlineConfirmButton({
  onConfirm,
  label = 'Löschen',
  confirmLabel = 'Wirklich löschen?',
  size = 'md',
}: {
  onConfirm: () => void | Promise<void>
  label?: string
  confirmLabel?: string
  size?: 'sm' | 'md'
}) {
  const [bestaetigenAktiv, setBestaetigenAktiv] = useState(false)

  if (!bestaetigenAktiv) {
    return (
      <IconButton
        label={label}
        tone="danger"
        onClick={() => setBestaetigenAktiv(true)}
        className={size === 'sm' ? 'h-7 w-7' : undefined}
      >
        <Trash2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </IconButton>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-wine">{confirmLabel}</span>
      <IconButton
        label="Löschen bestätigen"
        tone="danger"
        onClick={() => {
          setBestaetigenAktiv(false)
          onConfirm()
        }}
      >
        <Check className="h-4 w-4" />
      </IconButton>
      <IconButton label="Abbrechen" onClick={() => setBestaetigenAktiv(false)}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
