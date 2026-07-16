import { Check, Copy, Mail } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fehlerText } from '../../api/client'
import {
  einladungenListe,
  einladungErstellen,
  einladungWiderrufen,
  type Einladung,
} from '../../api/einladungen'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Row } from '../../components/ui/CardSections'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/useToast'

function einladungsLink(token: string): string {
  return `${window.location.origin}/einladung/${token}`
}

function formatAblauf(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Kopierbares Textfeld für den frisch erzeugten Einladungslink - schreibgeschützt (readOnly)
// statt editierbar, da der Link nur zum Kopieren/Teilen gedacht ist.
function KopierbaresFeld({ wert }: { wert: string }) {
  const [kopiert, setKopiert] = useState(false)
  const { showToast } = useToast()

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(wert)
      setKopiert(true)
      showToast('Link kopiert')
      setTimeout(() => setKopiert(false), 2000)
    } catch {
      showToast('Kopieren fehlgeschlagen - bitte manuell markieren')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={wert} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
      <IconButton label="Link kopieren" onClick={kopieren}>
        {kopiert ? <Check className="h-4 w-4 text-pine" /> : <Copy className="h-4 w-4" />}
      </IconButton>
    </div>
  )
}

export function EinladungenSection({ pfarreiId, aktiv }: { pfarreiId: number; aktiv: boolean }) {
  const [einladungen, setEinladungen] = useState<Einladung[]>([])
  const [geladen, setGeladen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [erstellen, setErstellen] = useState(false)
  const [neuesteEinladung, setNeuesteEinladung] = useState<Einladung | null>(null)
  const { showToast } = useToast()

  const reload = useCallback(() => {
    einladungenListe(pfarreiId).then((liste) => {
      setEinladungen(liste)
      setGeladen(true)
    })
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!aktiv) setNeuesteEinladung(null)
  }, [aktiv])

  async function handleErstellen() {
    setError(null)
    setErstellen(true)
    try {
      const einladung = await einladungErstellen(pfarreiId)
      setNeuesteEinladung(einladung)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Erstellen der Einladung'))
    } finally {
      setErstellen(false)
    }
  }

  async function handleWiderrufen(einladungId: number) {
    setError(null)
    try {
      await einladungWiderrufen(pfarreiId, einladungId)
      showToast('Einladung widerrufen')
      if (neuesteEinladung?.id === einladungId) setNeuesteEinladung(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Widerrufen der Einladung'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Einladungen"
        description="Einladungslinks für neue Betrachter-Zugänge - kein Admin-Zugriff nötig."
        action={
          <Button size="sm" onClick={handleErstellen} disabled={erstellen}>
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Einladung erstellen</span>
          </Button>
        }
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {neuesteEinladung && (
        <div className="border-b border-line bg-paper-dim/50 px-5 py-4">
          <p className="mb-2 text-sm text-ink-soft">
            Link an die neue Person weitergeben (gültig bis{' '}
            {formatAblauf(neuesteEinladung.laeuft_ab_am)}):
          </p>
          <KopierbaresFeld wert={einladungsLink(neuesteEinladung.token)} />
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={2} />
      ) : einladungen.length === 0 ? (
        <EmptyState icon={Mail} title="Keine offenen Einladungen" />
      ) : (
        <div>
          {einladungen.map((einladung) => (
            <Row key={einladung.id}>
              <div className="min-w-0">
                <span className="text-sm font-medium text-ink">Betrachter</span>
                <p className="text-xs text-ink-soft">
                  Läuft ab am {formatAblauf(einladung.laeuft_ab_am)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  label="Link erneut anzeigen"
                  onClick={() => setNeuesteEinladung(einladung)}
                >
                  <Copy className="h-4 w-4" />
                </IconButton>
                <InlineConfirmButton
                  onConfirm={() => handleWiderrufen(einladung.id)}
                  label="Einladung widerrufen"
                  confirmLabel="Wirklich widerrufen?"
                />
              </div>
            </Row>
          ))}
        </div>
      )}
    </Card>
  )
}
