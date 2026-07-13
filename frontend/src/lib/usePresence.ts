import { useEffect, useRef, useState } from 'react'

/**
 * Hält ein Overlay (Modal, Popover, ...) noch `exitDurationMs` über `open === false` hinaus
 * gemountet, damit eine CSS-Exit-Animation tatsächlich abspielen kann - ein simples
 * `if (!open) return null` entfernt den DOM-Knoten sofort und jede `animate-*`-Klasse wirkt nur
 * beim Öffnen, nie beim Schließen.
 */
export function usePresence(open: boolean, exitDurationMs: number) {
  const [state, setState] = useState<{ mounted: boolean; closing: boolean }>({
    mounted: open,
    closing: false,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (open) {
      setState({ mounted: true, closing: false })
      return
    }
    setState((s) => (s.mounted ? { mounted: true, closing: true } : s))
    timerRef.current = setTimeout(
      () => setState({ mounted: false, closing: false }),
      exitDurationMs,
    )
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open, exitDurationMs])

  return state
}
