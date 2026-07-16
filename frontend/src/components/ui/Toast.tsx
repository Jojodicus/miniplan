import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toastContextObject'

interface ToastEintrag {
  id: number
  text: string
  tone: ToastTone
  closing: boolean
}

// Muss zur Dauer von `.animate-sink-out` in index.css passen, sonst wird der Toast entweder vor
// Animationsende aus dem DOM entfernt (Ruckler) oder bleibt nach Animationsende unnötig lange als
// unsichtbarer Platzhalter stehen.
const EXIT_DURATION_MS = 180

// Info-Toasts erklären längere Sachverhalte (z.B. regionale Feiertags-Ausnahmen) - etwas mehr
// Lesezeit als die kurze Erfolgs-/Fehler-Bestätigung.
const AUTO_DISMISS_MS = 4000
const AUTO_DISMISS_INFO_MS = 8000

const toneStyles: Record<ToastTone, string> = {
  success: 'border-pine/30 bg-white text-ink',
  error: 'border-wine/30 bg-wine-tint text-wine',
  info: 'border-gold/30 bg-gold-tint text-ink',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEintrag[]>([])
  const naechsteId = useRef(0)

  // Zweistufig: erst per `closing`-Flag die Exit-Animation anstoßen, den Toast aber noch
  // gemountet lassen, damit sie abspielen kann (analog `usePresence` für Modal/Popover) - danach
  // erst tatsächlich aus dem Array entfernen.
  const dismiss = useCallback((id: number) => {
    setToasts((aktuell) => aktuell.map((t) => (t.id === id ? { ...t, closing: true } : t)))
    setTimeout(() => {
      setToasts((aktuell) => aktuell.filter((t) => t.id !== id))
    }, EXIT_DURATION_MS)
  }, [])

  const showToast = useCallback(
    (text: string, tone: ToastTone = 'success') => {
      naechsteId.current += 1
      const id = naechsteId.current
      setToasts((aktuell) => [...aktuell, { id, text, tone, closing: false }])
      setTimeout(() => dismiss(id), tone === 'info' ? AUTO_DISMISS_INFO_MS : AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-md shadow-ink/10 ${toast.closing ? 'animate-sink-out' : 'animate-rise'} ${toneStyles[toast.tone]}`}
          >
            {toast.tone === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-pine" />}
            {toast.tone === 'error' && <XCircle className="h-4 w-4 shrink-0 text-wine" />}
            {toast.tone === 'info' && <Info className="h-4 w-4 shrink-0 text-gold-dark" />}
            <span className="flex-1">{toast.text}</span>
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => dismiss(toast.id)}
              className="cursor-pointer text-ink-faint hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
