import { CalendarRange, Download, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  miniplaeneListe,
  miniplanErstellen,
  miniplanLoeschen,
  miniplanPdfHerunterladen,
  type MiniplanListeEintrag,
} from '../api/miniplaene'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { NeuAnlegenAbschnitt } from '../components/ui/CardSections'
import { EmptyState } from '../components/ui/EmptyState'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { Input, Label, Select } from '../components/ui/FormField'
import { ListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { MONATE, monatsName } from '../lib/datum'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

// Geplant wird immer ein zukünftiger Monat: Vorschlag ist der Monat nach dem neuesten
// vorhandenen Plan, ohne Pläne der nächste Kalendermonat.
function naechsterMonatsVorschlag(miniplaene: MiniplanListeEintrag[]): {
  monat: number
  jahr: number
} {
  const heute = new Date()
  let monat = heute.getMonth() + 1
  let jahr = heute.getFullYear()
  for (const plan of miniplaene) {
    if (plan.jahr > jahr || (plan.jahr === jahr && plan.monat > monat)) {
      monat = plan.monat
      jahr = plan.jahr
    }
  }
  return monat === 12 ? { monat: 1, jahr: jahr + 1 } : { monat: monat + 1, jahr }
}

export function MiniplaenePage() {
  useDocumentTitle('Minipläne')
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [miniplaene, setMiniplaene] = useState<MiniplanListeEintrag[] | null>(null)
  const [monat, setMonat] = useState<number | null>(null)
  const [jahr, setJahr] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    miniplaeneListe(id).then(setMiniplaene)
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (miniplaene === null || monat !== null) return
    const vorschlag = naechsterMonatsVorschlag(miniplaene)
    setMonat(vorschlag.monat)
    setJahr(vorschlag.jahr)
  }, [miniplaene, monat])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    if (monat === null || jahr === null) return
    setError(null)
    try {
      const miniplan = await miniplanErstellen(id, { monat, jahr })
      navigate(`/pfarreien/${id}/miniplaene/${miniplan.id}`)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Miniplans'))
    }
  }

  async function handleDelete(miniplanId: number) {
    setError(null)
    try {
      await miniplanLoeschen(id, miniplanId)
      showToast('Miniplan gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Miniplans'))
    }
  }

  async function handleDownload(miniplan: MiniplanListeEintrag) {
    setError(null)
    try {
      await miniplanPdfHerunterladen(id, miniplan)
    } catch (err) {
      setError(fehlerText(err, 'PDF konnte nicht heruntergeladen werden'))
    }
  }

  return (
    <AppShell pfarreiId={id}>
      <h1 className="font-display text-3xl font-semibold text-ink">Minipläne</h1>

      <Card className="mt-6 animate-rise">
        {error && (
          <div className="px-5 pt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {miniplaene === null ? (
          <ListSkeleton rows={3} />
        ) : miniplaene.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Noch keine Minipläne angelegt" />
        ) : (
          <div>
            {(miniplaene ?? []).map((miniplan, index) => (
              <div
                key={miniplan.id}
                style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                className="animate-rise flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0"
              >
                <Link
                  to={`/pfarreien/${id}/miniplaene/${miniplan.id}`}
                  className="flex flex-1 items-center gap-3 text-sm font-medium text-ink hover:text-pine-dark"
                >
                  {monatsName(miniplan.monat)} {miniplan.jahr}
                  <Badge tone={miniplan.status === 'abgeschlossen' ? 'pine' : 'neutral'}>
                    {miniplan.status === 'abgeschlossen' ? 'Abgeschlossen' : 'In Bearbeitung'}
                  </Badge>
                </Link>
                <div className="flex items-center gap-2">
                  {miniplan.status === 'abgeschlossen' && (
                    <Button
                      variant="primary"
                      size="sm"
                      title="PDF herunterladen"
                      onClick={() => handleDownload(miniplan)}
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">PDF</span>
                    </Button>
                  )}
                  <InlineConfirmButton
                    onConfirm={() => handleDelete(miniplan.id)}
                    confirmLabel={
                      miniplan.gottesdienste_anzahl > 0
                        ? `Plan mit ${miniplan.gottesdienste_anzahl} Gottesdiensten löschen?`
                        : 'Wirklich löschen?'
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <NeuAnlegenAbschnitt>
          <form
            onSubmit={handleCreate}
            className="flex flex-wrap items-end gap-2"
            aria-label="Miniplan anlegen"
          >
            <div>
              <Label htmlFor="miniplan-neu-monat">Monat</Label>
              <Select
                id="miniplan-neu-monat"
                value={monat ?? ''}
                onChange={(e) => setMonat(Number(e.target.value))}
              >
                {MONATE.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="miniplan-neu-jahr">Jahr</Label>
              <Input
                id="miniplan-neu-jahr"
                type="number"
                value={jahr ?? ''}
                onChange={(e) => setJahr(Number(e.target.value))}
                className="!w-28"
                required
              />
            </div>
            <Button type="submit" disabled={monat === null}>
              <Plus className="h-4 w-4" />
              Miniplan anlegen
            </Button>
          </form>
        </NeuAnlegenAbschnitt>
      </Card>
    </AppShell>
  )
}
