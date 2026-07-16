import { Download, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function istBereitsInstalliert(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari hat kein `display-mode: standalone`-Match, aber dieses veraltete Flag.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

type Plattform = 'ios' | 'android' | 'sonstige'

function erkennePlattform(): Plattform {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'sonstige'
}

/**
 * Hinweis zur PWA-Installation, nur relevant auf Mobilgeräten, die die App noch nicht als
 * eigenständige App installiert haben. iOS kennt kein `beforeinstallprompt` - dort bleibt nur die
 * manuelle "Zum Home-Bildschirm"-Anleitung; Android bekommt zusätzlich einen echten Install-Button,
 * sobald der Browser das Event feuert.
 */
export function InstallHint() {
  const [ausgeblendet, setAusgeblendet] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function handler(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (ausgeblendet || istBereitsInstalliert()) return null

  const plattform = erkennePlattform()
  if (plattform === 'sonstige') return null

  return (
    <div className="animate-fade mt-4 flex items-start gap-2 rounded-lg border border-line bg-pine-tint/60 p-3 text-sm text-ink-soft">
      <div className="min-w-0 flex-1">
        {plattform === 'ios' ? (
          <p>
            Als App installieren: Teilen-Button{' '}
            <Share className="inline h-3.5 w-3.5 align-text-bottom" /> antippen, dann „Zum
            Home-Bildschirm".
          </p>
        ) : installPrompt ? (
          <button
            type="button"
            onClick={() => void installPrompt.prompt()}
            className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-pine-dark hover:underline"
          >
            <Download className="h-4 w-4" />
            Als App installieren
          </button>
        ) : (
          <p>Als App installieren: Menü des Browsers öffnen und „App installieren" wählen.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setAusgeblendet(true)}
        aria-label="Hinweis ausblenden"
        className="shrink-0 cursor-pointer text-ink-faint hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
