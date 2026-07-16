import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from '../../lib/usePresence'

const EXIT_DURATION_MS = 150

/**
 * Am Auslöser (`anchorRef`) verankertes Popover (Portal auf `document.body`) für kompakte
 * "Neu anlegen"-Formulare - im Gegensatz zum zentrierten {@link Modal}, das für umfangreiche
 * Formulare gedacht ist. Schließt per ESC und Klick außerhalb von Popover und Auslöser.
 *
 * Gehört zum "kleines Dropdown"-Größen-Tier (siehe Kommentar in Modal.tsx), daher `rounded-lg` /
 * `shadow-lg shadow-ink/10` statt der `rounded-xl` / `shadow-xl shadow-ink/20` des Modals - der
 * (optionale) Titel bekommt trotzdem einen eigenen, vom Inhalt per `border-b` abgesetzten
 * Header-Block wie `Modal`/`Card`, nur in dieser kleineren Größe (`px-3 py-2.5` statt `px-5 py-4`).
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  title,
  children,
  width = 320,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  title?: ReactNode
  children: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<
    | { left: number; maxHeight: number; width: number; top: number; bottom?: undefined }
    | { left: number; maxHeight: number; width: number; bottom: number; top?: undefined }
    | null
  >(null)

  useLayoutEffect(() => {
    if (!open) return
    function platzieren() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const rand = 8
      // Breite an den Viewport klemmen - sonst kann `left` auf schmalen (Mobil-)Viewports negativ
      // werden und das Popover läuft über den Bildschirmrand hinaus.
      const effectiveWidth = Math.min(width, window.innerWidth - 2 * rand)
      // Bevorzugt linksbündig unter dem Auslöser, aber am Viewport-Rand geklemmt.
      const left = Math.min(Math.max(rand, rect.left), window.innerWidth - effectiveWidth - rand)
      const platzUnten = window.innerHeight - rect.bottom - rand
      const platzOben = rect.top - rand
      // Unterhalb des Auslösers platzieren, außer dort ist zu wenig Platz und oben ist mehr -
      // sonst würde das (fixed positionierte, keinem Seiten-Scroll folgende) Popover unerreichbar
      // unterhalb des sichtbaren Bereichs landen. Bei "oben" über `bottom` statt `top` verankern,
      // damit es tatsächlich direkt am Auslöser wächst statt an der Viewport-Oberkante zu kleben.
      if (platzUnten < 200 && platzOben > platzUnten) {
        setPosition({
          bottom: window.innerHeight - rect.top + 6,
          left,
          maxHeight: platzOben,
          width: effectiveWidth,
        })
      } else {
        setPosition({ top: rect.bottom + 6, left, maxHeight: platzUnten, width: effectiveWidth })
      }
    }
    platzieren()
    window.addEventListener('resize', platzieren)
    window.addEventListener('scroll', platzieren, true)
    return () => {
      window.removeEventListener('resize', platzieren)
      window.removeEventListener('scroll', platzieren, true)
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function handleClick(event: MouseEvent) {
      const ziel = event.target as Node
      if (panelRef.current?.contains(ziel) || anchorRef.current?.contains(ziel)) return
      onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open, onClose, anchorRef])

  const { mounted, closing } = usePresence(open, EXIT_DURATION_MS)

  if (!mounted || !position) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        maxHeight: Math.max(position.maxHeight, 120),
      }}
      className={`${closing ? 'animate-sink-out' : 'animate-rise'} fixed z-50 flex flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-lg shadow-ink/10`}
    >
      {title && (
        <div className="shrink-0 border-b border-line px-3 py-2.5">
          <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        </div>
      )}
      {/* Nur der Inhalt scrollt (analog Modal), damit ein langer Inhalt den Header nicht
          wegschiebt. */}
      <div className="overflow-y-auto p-3">{children}</div>
    </div>,
    document.body,
  )
}
