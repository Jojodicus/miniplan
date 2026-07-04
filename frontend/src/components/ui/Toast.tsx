import { CheckCircle2, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error'

interface ToastEintrag {
  id: number
  text: string
  tone: ToastTone
}

interface ToastContextValue {
  showToast: (text: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4000

const toneStyles: Record<ToastTone, string> = {
  success: 'border-pine/30 bg-white text-ink',
  error: 'border-wine/30 bg-wine-tint text-wine',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEintrag[]>([])
  const naechsteId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((aktuell) => aktuell.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (text: string, tone: ToastTone = 'success') => {
      naechsteId.current += 1
      const id = naechsteId.current
      setToasts((aktuell) => [...aktuell, { id, text, tone }])
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
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
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-md shadow-ink/10 animate-rise ${toneStyles[toast.tone]}`}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-pine" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-wine" />
            )}
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

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast muss innerhalb eines ToastProvider verwendet werden')
  }
  return ctx
}
