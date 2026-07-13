import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'

/**
 * Zentrierter Dialog (Portal auf `document.body`) für "Neu anlegen"/"Bearbeiten"-Formulare, die
 * vorher am Karten-Ende bzw. inline expandiert erschienen. Schließt per ESC, Klick auf den
 * Backdrop und über den ×-Button. Sperrt das Body-Scrolling, solange er offen ist.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  maxWidth?: string
}) {
  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const vorherigesOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = vorherigesOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-rise my-8 flex max-h-[calc(100dvh-4rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl shadow-ink/20`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <IconButton label="Schließen" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {/* Nur der Inhalt scrollt (statt des ganzen Dialogs), damit lange Formulare den Header
            nicht wegschieben und der Dialog nie über den Viewport hinausläuft. */}
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
