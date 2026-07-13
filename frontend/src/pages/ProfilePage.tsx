import { KeyRound, Mail, UserCircle } from 'lucide-react'
import { useState } from 'react'
import { eigeneEmailAendern, eigenesPasswortAendern } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Input, Label } from '../components/ui/FormField'
import { useToast } from '../components/ui/Toast'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function fehlerText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ein Fehler ist aufgetreten'
}

function EmailKarte({ aktuelleEmail }: { aktuelleEmail: string }) {
  const { refreshUser } = useAuth()
  const { showToast } = useToast()
  const [email, setEmail] = useState(aktuelleEmail)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  async function submit() {
    setFehler(null)
    setSpeichert(true)
    try {
      await eigeneEmailAendern(email.trim())
      await refreshUser()
      showToast('E-Mail-Adresse geändert')
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setSpeichert(false)
    }
  }

  const unveraendert = email.trim().toLowerCase() === aktuelleEmail.toLowerCase()

  return (
    <Card className="animate-rise">
      <CardHeader title="E-Mail-Adresse" description="Wird für die Anmeldung verwendet." />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-4 p-5"
      >
        {fehler && <Alert tone="error">{fehler}</Alert>}
        <div>
          <Label htmlFor="profil-email">E-Mail</Label>
          <Input
            id="profil-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Button type="submit" disabled={speichert || unveraendert || !email.trim()}>
            <Mail className="h-4 w-4" />
            E-Mail speichern
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PasswortKarte() {
  const { showToast } = useToast()
  const [aktuelles, setAktuelles] = useState('')
  const [neues, setNeues] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  async function submit() {
    setFehler(null)
    if (neues !== wiederholung) {
      setFehler('Die Passwort-Wiederholung stimmt nicht überein.')
      return
    }
    setSpeichert(true)
    try {
      await eigenesPasswortAendern(aktuelles, neues)
      setAktuelles('')
      setNeues('')
      setWiederholung('')
      showToast('Passwort geändert')
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Passwort ändern" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-4 p-5"
      >
        {fehler && <Alert tone="error">{fehler}</Alert>}
        <div>
          <Label htmlFor="profil-aktuelles-passwort">Aktuelles Passwort</Label>
          <Input
            id="profil-aktuelles-passwort"
            type="password"
            autoComplete="current-password"
            required
            value={aktuelles}
            onChange={(e) => setAktuelles(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profil-neues-passwort" hint="mind. 8 Zeichen">
            Neues Passwort
          </Label>
          <Input
            id="profil-neues-passwort"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={neues}
            onChange={(e) => setNeues(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profil-neues-passwort-wiederholung">Neues Passwort wiederholen</Label>
          <Input
            id="profil-neues-passwort-wiederholung"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={wiederholung}
            onChange={(e) => setWiederholung(e.target.value)}
          />
        </div>
        <div>
          <Button type="submit" disabled={speichert || !aktuelles || neues.length < 8}>
            <KeyRound className="h-4 w-4" />
            Passwort speichern
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function ProfilePage() {
  useDocumentTitle('Profil')
  const { user } = useAuth()
  if (!user) return null

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-ink">
          <UserCircle className="h-7 w-7 text-pine" />
          Mein Profil
        </h1>
        <div className="mt-8 flex max-w-lg flex-col gap-8">
          <EmailKarte aktuelleEmail={user.email} />
          <PasswortKarte />
        </div>
      </div>
    </AppShell>
  )
}
