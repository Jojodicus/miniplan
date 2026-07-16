import { Pencil, Search, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from 'react'
import { fehlerText } from '../../api/client'
import type { Filtertag as FiltertagDef } from '../../api/filtertags'
import type { Gruppe } from '../../api/gruppen'
import {
  miniBearbeiten,
  miniErstellen,
  miniLoeschen,
  minisListe,
  type Filtertag,
  type Mini,
} from '../../api/minis'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { Row } from '../../components/ui/CardSections'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Label } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { Modal } from '../../components/ui/Modal'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/useToast'
import { FiltertagAuswahl, GruppenAuswahl, ModalAktionen, NeuButton } from './shared'
import { filtertagLabel } from './helpers'

export function MinisSection({
  pfarreiId,
  gruppen,
  filtertags,
  aktiv,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
  aktiv: boolean
}) {
  const [minis, setMinis] = useState<Mini[]>([])
  const [geladen, setGeladen] = useState(false)
  const [suche, setSuche] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalOffen, setModalOffen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [gruppeId, setGruppeId] = useState<number | ''>('')
  const [ausgewaehlterFiltertag, setAusgewaehlterFiltertag] = useState<Filtertag | null>(null)
  const [maxEinsaetze, setMaxEinsaetze] = useState<number | null>(null)
  const { showToast } = useToast()

  const reload = useCallback(() => {
    minisListe(pfarreiId).then((liste) => {
      setMinis(liste)
      setGeladen(true)
    })
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  // Siehe Kommentar in GruppenSection - portalte Modals überstehen sonst einen Tab-Wechsel.
  useEffect(() => {
    if (!aktiv) setModalOffen(false)
  }, [aktiv])

  function oeffnenNeu() {
    setEditId(null)
    setName('')
    setGruppeId(gruppen[0]?.id ?? '')
    setAusgewaehlterFiltertag(null)
    setMaxEinsaetze(null)
    setError(null)
    setModalOffen(true)
  }

  function oeffnenBearbeiten(mini: Mini) {
    setEditId(mini.id)
    setName(mini.name)
    setGruppeId(mini.gruppe_id)
    setAusgewaehlterFiltertag(mini.filtertags[0] ?? null)
    setMaxEinsaetze(mini.max_einsaetze_pro_monat)
    setError(null)
    setModalOffen(true)
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    if (gruppeId === '') return
    const daten = {
      name,
      gruppe_id: gruppeId,
      filtertags: ausgewaehlterFiltertag ? [ausgewaehlterFiltertag] : [],
      max_einsaetze_pro_monat: maxEinsaetze,
    }
    try {
      if (editId === null) {
        await miniErstellen(pfarreiId, daten)
        showToast('Mini angelegt')
      } else {
        await miniBearbeiten(pfarreiId, editId, daten)
        showToast('Mini gespeichert')
      }
      setModalOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Minis'))
    }
  }

  async function handleDelete(miniId: number) {
    setError(null)
    try {
      await miniLoeschen(pfarreiId, miniId)
      showToast('Mini gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Minis'))
    }
  }

  function gruppenName(id: number): string {
    return gruppen.find((g) => g.id === id)?.name ?? '?'
  }

  const sichtbareMinis = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    return minis
      .filter((mini) => !begriff || mini.name.toLowerCase().includes(begriff))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [minis, suche])

  return (
    <Card>
      <CardHeader title="Minis" action={<NeuButton label="Mini" onClick={oeffnenNeu} />} />
      {error && !modalOffen && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {geladen && minis.length > 8 && (
        <div className="border-b border-line px-5 py-3">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              aria-label="Minis durchsuchen"
              placeholder="Suchen…"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={4} />
      ) : minis.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Noch keine Minis angelegt"
          description={gruppen.length === 0 ? 'Lege zuerst eine Gruppe an.' : undefined}
        />
      ) : sichtbareMinis.length === 0 ? (
        <EmptyState icon={Search} title={`Kein Mini passt zu „${suche.trim()}“`} />
      ) : (
        <div>
          {sichtbareMinis.map((mini) => (
            <Row key={mini.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{mini.name}</span>
                <Badge tone="pine">{gruppenName(mini.gruppe_id)}</Badge>
                {mini.filtertags.map((tag) => (
                  <Badge key={tag} tone="gold">
                    {filtertagLabel(filtertags, tag)}
                  </Badge>
                ))}
                {mini.max_einsaetze_pro_monat !== null && (
                  <Badge tone="neutral">max. {mini.max_einsaetze_pro_monat}× pro Miniplan</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Bearbeiten" onClick={() => oeffnenBearbeiten(mini)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <InlineConfirmButton onConfirm={() => handleDelete(mini.id)} />
              </div>
            </Row>
          ))}
        </div>
      )}
      <Modal
        open={modalOffen}
        onClose={() => setModalOffen(false)}
        title={editId === null ? 'Mini anlegen' : 'Mini bearbeiten'}
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="mini-name">Name</Label>
            <Input
              id="mini-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <GruppenAuswahl
            gruppen={gruppen}
            ausgewaehlt={gruppeId}
            onChange={setGruppeId}
            idPrefix="mini-gruppe"
          />
          <FiltertagAuswahl
            filtertags={filtertags}
            ausgewaehlt={ausgewaehlterFiltertag}
            onChange={setAusgewaehlterFiltertag}
            idPrefix="mini"
          />
          <div>
            <Label htmlFor="mini-max-einsaetze" hint="leer = kein Limit">
              Max. Einsätze pro Miniplan
            </Label>
            <Input
              id="mini-max-einsaetze"
              type="number"
              min={0}
              placeholder="kein Limit"
              value={maxEinsaetze ?? ''}
              onChange={(e) =>
                setMaxEinsaetze(e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <ModalAktionen
            onCancel={() => setModalOffen(false)}
            submitLabel={editId === null ? 'Anlegen' : 'Speichern'}
            disabled={gruppen.length === 0}
          />
        </form>
      </Modal>
    </Card>
  )
}
