import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Am Auslöser (`anchorRef`) verankertes Popover (Portal auf `document.body`) für kompakte
 * "Neu anlegen"-Formulare - im Gegensatz zum zentrierten {@link Modal}, das für umfangreiche
 * Formulare gedacht ist. Schließt per ESC und Klick außerhalb von Popover und Auslöser.
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
    | { left: number; maxHeight: number; top: number; bottom?: undefined }
    | { left: number; maxHeight: number; bottom: number; top?: undefined }
    | null
  >(null)

  useLayoutEffect(() => {
    if (!open) return
    function platzieren() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const rand = 8
      // Bevorzugt linksbündig unter dem Auslöser, aber am Viewport-Rand geklemmt.
      const left = Math.min(Math.max(rand, rect.left), window.innerWidth - width - rand)
      const platzUnten = window.innerHeight - rect.bottom - rand
      const platzOben = rect.top - rand
      // Unterhalb des Auslösers platzieren, außer dort ist zu wenig Platz und oben ist mehr -
      // sonst würde das (fixed positionierte, keinem Seiten-Scroll folgende) Popover unerreichbar
      // unterhalb des sichtbaren Bereichs landen. Bei "oben" über `bottom` statt `top` verankern,
      // damit es tatsächlich direkt am Auslöser wächst statt an der Viewport-Oberkante zu kleben.
      if (platzUnten < 200 && platzOben > platzUnten) {
        setPosition({ bottom: window.innerHeight - rect.top + 6, left, maxHeight: platzOben })
      } else {
        setPosition({ top: rect.bottom + 6, left, maxHeight: platzUnten })
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

  if (!open || !position) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width,
        maxHeight: Math.max(position.maxHeight, 120),
      }}
      className="animate-rise fixed z-50 overflow-y-auto rounded-xl border border-line bg-paper p-4 shadow-xl shadow-ink/20"
    >
      {title && <h3 className="mb-3 font-display text-base font-semibold text-ink">{title}</h3>}
      {children}
    </div>,
    document.body,
  )
}
