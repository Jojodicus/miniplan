import { ArrowLeft, CalendarRange, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  miniplaeneListe,
  miniplanErstellen,
  miniplanLoeschen,
  type Miniplan,
} from '../api/miniplaene'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Input, Label, Select } from '../components/ui/FormField'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

function monatsName(monat: number): string {
  return MONATE[monat - 1] ?? String(monat)
}

export function MiniplaenePage() {
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const navigate = useNavigate()

  const [miniplaene, setMiniplaene] = useState<Miniplan[]>([])
  const heute = new Date()
  const [monat, setMonat] = useState(heute.getMonth() + 1)
  const [jahr, setJahr] = useState(heute.getFullYear())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    miniplaeneListe(id).then(setMiniplaene)
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    try {
      const miniplan = await miniplanErstellen(id, { monat, jahr })
      navigate(`/pfarreien/${id}/miniplaene/${miniplan.id}`)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Miniplans'))
    }
  }

  async function handleDelete(miniplanId: number, bezeichnung: string) {
    if (!confirm(`Miniplan "${bezeichnung}" wirklich löschen?`)) return
    setError(null)
    try {
      await miniplanLoeschen(id, miniplanId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Miniplans'))
    }
  }

  return (
    <AppShell>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-pine-dark"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Übersicht
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">Miniplaene</h1>
      <p className="mt-1 text-ink-soft">
        Monatliche Dienstpläne dieser Pfarrei anlegen und bearbeiten.
      </p>
      <Link
        to={`/pfarreien/${id}/stammdaten`}
        className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-transparent px-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-pine hover:text-pine-dark"
      >
        Zu den Stammdaten
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <Card className="mt-6 animate-rise">
        <CardHeader title="Miniplaene" description="Alle Dienstpläne dieser Pfarrei." />
        {error && (
          <div className="px-5 pt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {miniplaene.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Noch keine Miniplaene angelegt" />
        ) : (
          <div>
            {miniplaene.map((miniplan) => (
              <div
                key={miniplan.id}
                className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0"
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
                <IconButton
                  label="Löschen"
                  tone="danger"
                  onClick={() =>
                    handleDelete(miniplan.id, `${monatsName(miniplan.monat)} ${miniplan.jahr}`)
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={handleCreate}
          className="flex items-end gap-2 border-t border-line p-5"
          aria-label="Miniplan anlegen"
        >
          <div>
            <Label htmlFor="miniplan-neu-monat">Monat</Label>
            <Select
              id="miniplan-neu-monat"
              value={monat}
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
              value={jahr}
              onChange={(e) => setJahr(Number(e.target.value))}
              className="w-28"
              required
            />
          </div>
          <Button type="submit">
            <Plus className="h-4 w-4" />
            Miniplan anlegen
          </Button>
        </form>
      </Card>
    </AppShell>
  )
}
