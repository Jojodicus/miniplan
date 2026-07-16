import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from '../../lib/usePresence'
import { IconButton } from './IconButton'

const EXIT_DURATION_MS = 180

// Für den Fokus-Trap relevante, tatsächlich fokussierbare Elemente - `disabled`- und
// `tabindex="-1"`-Elemente sind absichtlich fokussierbar per API, aber nicht per Tab erreichbar.
const FOKUSIERBAR_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function fokussierbareElemente(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOKUSIERBAR_SELECTOR)).filter(
    // `getClientRects().length` ist bei `display: none` (und nicht mehr im DOM hängenden
    // Elementen) 0 - versteckte Elemente sollen nicht Teil des Tab-Zyklus werden.
    (el) => el.getClientRects().length > 0,
  )
}

/**
 * Zentrierter Dialog (Portal auf `document.body`) für "Neu anlegen"/"Bearbeiten"-Formulare, die
 * vorher am Karten-Ende bzw. inline expandiert erschienen. Schließt per ESC, Klick auf den
 * Backdrop und über den ×-Button. Sperrt das Body-Scrolling, solange er offen ist. Trapt den
 * Tab-Fokus im Dialog, holt ihn beim Öffnen hinein und stellt ihn beim Schließen auf das Element
 * zurück, das vor dem Öffnen fokussiert war (siehe Fokus-Trap-Kommentar unten).
 *
 * Größen-/Radius-Tiers für Overlays (in der ganzen App einheitlich, siehe auch Popover.tsx,
 * DateInput.tsx, TimeInput.tsx):
 * - "Kleines Dropdown" (DateInput/TimeInput-Kalender/Zeitwahl, Popover): `rounded-lg`,
 *   `shadow-lg shadow-ink/10`, Innenabstand `p-3`, Titel-Header (falls vorhanden) `px-3 py-2.5`.
 * - "Großes Panel" (dieses Modal, `Card`): `rounded-xl`, `shadow-xl shadow-ink/20`, Header
 *   `px-5 py-4`, Inhalt `p-5`.
 * Andere Radius-Stufen sind zweckgebunden, nicht Teil dieser Overlay-Hierarchie: `rounded-md` für
 * Formular-/Button-Controls, `rounded-full` für Badges/Pill-Toggles.
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
  const { mounted, closing } = usePresence(open, EXIT_DURATION_MS)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // `onClose` per Ref statt als Effekt-Abhängigkeit, damit ein bei jedem Render neu erzeugtes
  // `onClose` (üblich bei `onClose={() => setOpen(false)}`) diesen Effekt nicht laufend neu
  // aufsetzt - das würde sonst Body-Scroll-Sperre und ESC-Listener bei jedem Render kurz ab- und
  // wieder anbauen.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKey)
    const vorherigesOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = vorherigesOverflow
    }
  }, [open])

  // Fokus-Trap: beim Öffnen den Fokus in den Dialog holen (erstes fokussierbares
  // Element, sonst der Dialog-Container selbst), Tab/Shift+Tab innerhalb des Dialogs zyklisch
  // halten, und beim Schließen den Fokus auf das vorher fokussierte Element zurückstellen.
  // Abhängigkeit bewusst `[open, mounted]` statt nur `[open]`: `usePresence` setzt `mounted` beim
  // Öffnen erst einen Tick nach `open` (eigener State-Update-Zyklus in einem Effekt) - auf dem
  // allerersten Render mit `open === true` existiert der Dialog im DOM (`dialogRef.current`) noch
  // gar nicht. Mit nur `open` in den Deps würde dieser Effekt dann kein zweites Mal laufen, sobald
  // der Dialog tatsächlich gemountet ist, und der Fokus bliebe draußen. Das Cleanup feuert exakt
  // dann, wenn `open` auf `false` wechselt - also am Anfang der Exit-Animation, nicht erst nach
  // deren Ende (`usePresence` hält den Dialog nur fürs Aussehen noch gemountet). So verschwindet
  // der Trap-Listener genau dann, wenn auch der Fokus zurückgestellt wird - kein Fenster, in dem
  // Tab noch in einem bereits unsichtbar werdenden Dialog gefangen wäre.
  useEffect(() => {
    if (!open || !mounted) return
    const vorherFokussiert =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const dialog = dialogRef.current
    const [erstesElement] = dialog ? fokussierbareElemente(dialog) : []
    ;(erstesElement ?? dialog)?.focus()

    function handleTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialog) return
      const elemente = fokussierbareElemente(dialog)
      if (elemente.length === 0) {
        // Kein fokussierbares Element im Dialog (z. B. reiner Text-Inhalt) - Fokus auf dem
        // Dialog-Container selbst halten, statt Tab aus dem Dialog herausrutschen zu lassen.
        event.preventDefault()
        dialog.focus()
        return
      }
      const erstes = elemente[0]
      const letztes = elemente[elemente.length - 1]
      const aktiv = document.activeElement
      const ausserhalb = !aktiv || !dialog.contains(aktiv)
      if (event.shiftKey) {
        if (ausserhalb || aktiv === erstes) {
          event.preventDefault()
          letztes.focus()
        }
      } else if (ausserhalb || aktiv === letztes) {
        event.preventDefault()
        erstes.focus()
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => {
      document.removeEventListener('keydown', handleTab)
      // `.contains` schützt vor einem Fokus-Versuch auf ein zwischenzeitlich aus dem DOM
      // entferntes Element (z. B. ein Listeneintrag, der während des Dialogs gelöscht wurde).
      if (vorherFokussiert && document.contains(vorherFokussiert)) {
        vorherFokussiert.focus()
      }
    }
  }, [open, mounted])

  if (!mounted) return null

  return createPortal(
    <div
      className={`${closing ? 'animate-fade-out' : 'animate-fade'} fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${closing ? 'animate-sink-out' : 'animate-rise'} my-8 flex max-h-[calc(100dvh-4rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl shadow-ink/20 outline-none`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
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
