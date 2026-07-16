import { Check, Trash2, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { IconButton } from './IconButton'

/**
 * Auslöser, der beim Klick inline zu einem Bestätigen/Abbrechen-Paar wird, statt ein natives
 * `confirm()`-Dialogfenster zu öffnen. Erst der Bestätigen-Klick löst `onConfirm` aus
 * (typischerweise ein DELETE-Request oder eine andere schwer rückgängig zu machende Aktion);
 * Abbrechen verwirft ohne jeden Request. Standard-Auslöser ist ein Papierkorb-Icon (Löschen); über
 * `trigger` lässt sich ein anderer Auslöser (z.B. ein Text-`Button`) einsetzen, ohne das
 * Bestätigen/Abbrechen-Paar erneut zu implementieren.
 */
export function InlineConfirmButton({
  onConfirm,
  label = 'Löschen',
  confirmLabel = 'Wirklich löschen?',
  size = 'md',
  trigger,
}: {
  onConfirm: () => void | Promise<void>
  label?: string
  confirmLabel?: string
  size?: 'sm' | 'md'
  /** Ersetzt den Standard-Papierkorb-Auslöser, z.B. durch einen Text-`Button`. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [bestaetigenAktiv, setBestaetigenAktiv] = useState(false)

  if (!bestaetigenAktiv) {
    if (trigger) return <>{trigger(() => setBestaetigenAktiv(true))}</>
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
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-wine">{confirmLabel}</span>
      <IconButton
        label="Bestätigen"
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
