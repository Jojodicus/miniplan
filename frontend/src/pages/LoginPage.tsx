import { Eye, EyeOff } from 'lucide-react'
import { useState, type SubmitEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { AppIcon } from '../components/AppIcon'
import { InstallHint } from '../components/InstallHint'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input, Label } from '../components/ui/FormField'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function LoginPage() {
  useDocumentTitle('Anmelden')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login fehlgeschlagen')
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
          <p className="mt-1 text-sm text-ink-soft">Dienstplanung für Ministranten</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-line bg-white/70 p-6 shadow-sm shadow-ink/5"
        >
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="login-email">E-Mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="login-password">Passwort</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
              Anmelden
            </Button>
          </div>
        </form>
        <div className="sm:hidden">
          <InstallHint />
        </div>
      </div>
    </div>
  )
}
