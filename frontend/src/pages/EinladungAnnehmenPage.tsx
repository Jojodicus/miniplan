import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState, type SubmitEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { einladungAnnehmen, einladungVorschau, type EinladungVorschau } from '../api/einladungen'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { AppIcon } from '../components/AppIcon'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input, Label } from '../components/ui/FormField'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const ROLLEN_LABEL: Record<string, string> = {
  pfarrei_verantwortlicher: 'Pfarrei-Verantwortliche(r)',
  betrachter: 'Betrachter(in)',
}

export function EinladungAnnehmenPage() {
  useDocumentTitle('Einladung annehmen')
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const [vorschau, setVorschau] = useState<EinladungVorschau | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordWiederholung, setPasswordWiederholung] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    einladungVorschau(token)
      .then(setVorschau)
      .catch((err) =>
        setLadeFehler(err instanceof ApiError ? err.message : 'Einladung nicht gefunden'),
      )
  }, [token])

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (!token) return
    setError(null)
    if (password !== passwordWiederholung) {
      setError('Passwörter stimmen nicht überein')
      return
    }
    setIsSubmitting(true)
    try {
      await einladungAnnehmen(token, email, password)
      // Der Annehmen-Endpunkt setzt das Auth-Cookie identisch zu POST /api/auth/login - ein
      // refreshUser() genügt, um den bereits eingeloggten Zustand im AuthContext zu übernehmen
      // (kein Reload nötig).
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Einladung konnte nicht angenommen werden')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center text-center">
          <AppIcon className="mb-3 h-12 w-12" />
          <h1 className="font-display text-3xl font-semibold text-ink">Miniplan</h1>
          <p className="mt-1 text-sm text-ink-soft">Einladung annehmen</p>
        </div>

        <div className="rounded-xl border border-line bg-white/70 p-6 shadow-sm shadow-ink/5">
          {ladeFehler ? (
            <Alert>{ladeFehler}</Alert>
          ) : !vorschau ? (
            <p className="text-sm text-ink-soft">Einladung wird geladen …</p>
          ) : !vorschau.gueltig ? (
            <Alert>
              Diese Einladung ist abgelaufen oder bereits eingelöst. Bitte eine neue Einladung
              anfordern.
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-ink-soft">
                Du wurdest als <strong>{ROLLEN_LABEL[vorschau.rolle] ?? vorschau.rolle}</strong> für{' '}
                <strong>{vorschau.pfarrei_name}</strong> eingeladen. Lege ein Passwort fest, um den
                Zugang zu aktivieren.
              </p>
              <div>
                <Label htmlFor="einladung-email">E-Mail</Label>
                <Input
                  id="einladung-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="einladung-password">Passwort</Label>
                <div className="relative">
                  <Input
                    id="einladung-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Eingabe verbergen' : 'Eingabe anzeigen'}
                    className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-ink-faint transition-colors hover:text-pine-dark"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="einladung-password-wiederholung">Passwort wiederholen</Label>
                <Input
                  id="einladung-password-wiederholung"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordWiederholung}
                  onChange={(e) => setPasswordWiederholung(e.target.value)}
                  required
                />
              </div>
              {error && <Alert>{error}</Alert>}
              <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
                Zugang aktivieren
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
