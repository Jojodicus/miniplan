import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  dienstTypErstellen,
  dienstTypLoeschen,
  dienstTypenListe,
  type DienstTyp,
  type DienstTypEingabe,
  type GruppenAnforderung,
} from '../api/dienstTypen'
import {
  feiertagEinstellungSetzen,
  feiertageListe,
  type Feiertag,
} from '../api/feiertage'
import { ferienAktualisieren, ferienListe, type Ferienzeitraum } from '../api/ferien'
import {
  filtertagBlockerErstellen,
  filtertagBlockerListe,
  filtertagBlockerLoeschen,
  type FiltertagBlocker,
  type FiltertagBlockerEingabe,
} from '../api/filtertagBlocker'
import {
  gruppeBearbeiten,
  gruppeErstellen,
  gruppeLoeschen,
  gruppenListe,
  type Gruppe,
} from '../api/gruppen'
import {
  miniErstellen,
  miniLoeschen,
  minisListe,
  FILTERTAGS,
  type Filtertag,
  type Mini,
} from '../api/minis'
import {
  bundeslandSetzen,
  pfarreiDetail,
  BUNDESLAENDER,
  type Bundesland,
  type Pfarrei as PfarreiInfo,
} from '../api/pfarreien'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function filtertagLabel(tag: Filtertag): string {
  return { grundschueler: 'Grundschüler', schueler: 'Schüler', arbeiter: 'Arbeiter' }[tag]
}

function FiltertagChips({
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  ausgewaehlt: Filtertag[]
  onChange: (tags: Filtertag[]) => void
  idPrefix: string
}) {
  function toggle(tag: Filtertag) {
    onChange(
      ausgewaehlt.includes(tag) ? ausgewaehlt.filter((t) => t !== tag) : [...ausgewaehlt, tag],
    )
  }

  return (
    <div>
      <Label>Filtertags</Label>
      <div className="flex flex-wrap gap-2">
        {FILTERTAGS.map((tag) => (
          <CheckboxChip
            key={tag}
            id={`${idPrefix}-${tag}`}
            checked={ausgewaehlt.includes(tag)}
            onChange={() => toggle(tag)}
          >
            {filtertagLabel(tag)}
          </CheckboxChip>
        ))}
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0">
      {children}
    </div>
  )
}

function GruppenSection({
  pfarreiId,
  gruppen,
  reload,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  reload: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    try {
      await gruppeErstellen(pfarreiId, name)
      setName('')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen der Gruppe'))
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault()
    if (editId === null) return
    setError(null)
    try {
      await gruppeBearbeiten(pfarreiId, editId, editName)
      setEditId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Bearbeiten der Gruppe'))
    }
  }

  async function handleDelete(gruppeId: number, gruppeName: string) {
    if (!confirm(`Gruppe "${gruppeName}" wirklich löschen?`)) return
    setError(null)
    try {
      await gruppeLoeschen(pfarreiId, gruppeId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen der Gruppe'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Gruppen"
        description="Altersstufen oder Untergruppen der Ministranten, z. B. „neu“, „normal“, „Obermini“."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {gruppen.length === 0 ? (
        <EmptyState icon={Users} title="Noch keine Gruppen angelegt" />
      ) : (
        <div>
          {gruppen.map((gruppe) =>
            editId === gruppe.id ? (
              <Row key={gruppe.id}>
                <form onSubmit={handleUpdate} className="flex flex-1 items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    autoFocus
                    className="h-9"
                  />
                  <IconButton label="Speichern" type="submit">
                    <Check className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Abbrechen" type="button" onClick={() => setEditId(null)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </form>
              </Row>
            ) : (
              <Row key={gruppe.id}>
                <span className="text-sm font-medium text-ink">{gruppe.name}</span>
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Bearbeiten"
                    onClick={() => {
                      setEditId(gruppe.id)
                      setEditName(gruppe.name)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Löschen"
                    tone="danger"
                    onClick={() => handleDelete(gruppe.id, gruppe.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </Row>
            ),
          )}
        </div>
      )}
      <form onSubmit={handleCreate} className="flex items-end gap-2 border-t border-line p-5">
        <div className="flex-1">
          <Label htmlFor="gruppe-neu">Neue Gruppe</Label>
          <Input
            id="gruppe-neu"
            placeholder="z. B. Obermini"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit">
          <Plus className="h-4 w-4" />
          Anlegen
        </Button>
      </form>
    </Card>
  )
}

function MinisSection({ pfarreiId, gruppen }: { pfarreiId: number; gruppen: Gruppe[] }) {
  const [minis, setMinis] = useState<Mini[]>([])
  const [name, setName] = useState('')
  const [gruppeId, setGruppeId] = useState<number | ''>('')
  const [filtertags, setFiltertags] = useState<Filtertag[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    minisListe(pfarreiId).then(setMinis)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (gruppeId === '' && gruppen.length > 0) {
      setGruppeId(gruppen[0].id)
    }
  }, [gruppen, gruppeId])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    if (gruppeId === '') return
    try {
      await miniErstellen(pfarreiId, { name, gruppe_id: gruppeId, filtertags })
      setName('')
      setFiltertags([])
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Minis'))
    }
  }

  async function handleDelete(miniId: number, miniName: string) {
    if (!confirm(`Mini "${miniName}" wirklich löschen?`)) return
    setError(null)
    try {
      await miniLoeschen(pfarreiId, miniId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Minis'))
    }
  }

  function gruppenName(id: number): string {
    return gruppen.find((g) => g.id === id)?.name ?? '?'
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Minis" description="Die Ministranten, die im Dienstplan eingeteilt werden." />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {minis.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Noch keine Minis angelegt"
          description={gruppen.length === 0 ? 'Lege zuerst eine Gruppe an.' : undefined}
        />
      ) : (
        <div>
          {minis.map((mini) => (
            <Row key={mini.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{mini.name}</span>
                <Badge tone="pine">{gruppenName(mini.gruppe_id)}</Badge>
                {mini.filtertags.map((tag) => (
                  <Badge key={tag} tone="gold">
                    {filtertagLabel(tag)}
                  </Badge>
                ))}
              </div>
              <IconButton
                label="Löschen"
                tone="danger"
                onClick={() => handleDelete(mini.id, mini.name)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Row>
          ))}
        </div>
      )}
      <form onSubmit={handleCreate} className="flex flex-col gap-4 border-t border-line p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="mini-neu-name">Name</Label>
            <Input
              id="mini-neu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="mini-neu-gruppe">Gruppe</Label>
            <Select
              id="mini-neu-gruppe"
              value={gruppeId}
              onChange={(e) => setGruppeId(Number(e.target.value))}
              required
              disabled={gruppen.length === 0}
            >
              {gruppen.map((gruppe) => (
                <option key={gruppe.id} value={gruppe.id}>
                  {gruppe.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <FiltertagChips ausgewaehlt={filtertags} onChange={setFiltertags} idPrefix="mini-neu" />
        <Button type="submit" disabled={gruppen.length === 0} className="self-start">
          <Plus className="h-4 w-4" />
          Mini anlegen
        </Button>
      </form>
    </Card>
  )
}

function GruppenAnforderungenEditor({
  gruppen,
  anforderungen,
  onChange,
  idPrefix,
}: {
  gruppen: Gruppe[]
  anforderungen: GruppenAnforderung[]
  onChange: (anforderungen: GruppenAnforderung[]) => void
  idPrefix: string
}) {
  function addRow() {
    const belegteIds = new Set(anforderungen.map((a) => a.gruppe_id))
    const naechsteGruppe = gruppen.find((g) => !belegteIds.has(g.id))
    if (!naechsteGruppe) return
    onChange([...anforderungen, { gruppe_id: naechsteGruppe.id, mindest_anzahl: 1 }])
  }

  function updateRow(index: number, patch: Partial<GruppenAnforderung>) {
    onChange(anforderungen.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  function removeRow(index: number) {
    onChange(anforderungen.filter((_, i) => i !== index))
  }

  return (
    <div>
      <Label hint="z. B. mind. 1 aus Gruppe Obermini">Gruppen-Mindestanzahl</Label>
      <div className="flex flex-col gap-2">
        {anforderungen.map((anforderung, index) => (
          <div key={index} className="flex items-center gap-2">
            <Select
              id={`${idPrefix}-gruppe-${index}`}
              value={anforderung.gruppe_id}
              onChange={(e) => updateRow(index, { gruppe_id: Number(e.target.value) })}
              className="flex-1"
            >
              {gruppen.map((gruppe) => (
                <option key={gruppe.id} value={gruppe.id}>
                  {gruppe.name}
                </option>
              ))}
            </Select>
            <Input
              id={`${idPrefix}-mindestanzahl-${index}`}
              type="number"
              min={0}
              value={anforderung.mindest_anzahl}
              onChange={(e) => updateRow(index, { mindest_anzahl: Number(e.target.value) })}
              className="w-24"
            />
            <IconButton label="Zeile entfernen" tone="danger" onClick={() => removeRow(index)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="mt-2 self-start"
        onClick={addRow}
        disabled={anforderungen.length >= gruppen.length}
      >
        <Plus className="h-4 w-4" />
        Zeile hinzufügen
      </Button>
    </div>
  )
}

function DienstTypenSection({ pfarreiId, gruppen }: { pfarreiId: number; gruppen: Gruppe[] }) {
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [erforderlicheTags, setErforderlicheTags] = useState<Filtertag[]>([])
  const [gruppenAnforderungen, setGruppenAnforderungen] = useState<GruppenAnforderung[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    dienstTypenListe(pfarreiId).then(setDienstTypen)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: DienstTypEingabe = {
      name,
      standard_anzahl: standardAnzahl,
      erforderliche_filtertags: erforderlicheTags,
      gruppen_anforderungen: gruppenAnforderungen,
    }
    try {
      await dienstTypErstellen(pfarreiId, daten)
      setName('')
      setStandardAnzahl(1)
      setErforderlicheTags([])
      setGruppenAnforderungen([])
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Dienst-Typs'))
    }
  }

  async function handleDelete(dienstTypId: number, dienstTypName: string) {
    if (!confirm(`Dienst-Typ "${dienstTypName}" wirklich löschen?`)) return
    setError(null)
    try {
      await dienstTypLoeschen(pfarreiId, dienstTypId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Dienst-Typs'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Dienst-Typen"
        description="Arten von Diensten (z. B. Messdienst, Prozession) mit Standard-Besetzung."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {dienstTypen.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Noch keine Dienst-Typen angelegt" />
      ) : (
        <div>
          {dienstTypen.map((dienstTyp) => (
            <Row key={dienstTyp.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{dienstTyp.name}</span>
                <Badge tone="neutral">{dienstTyp.standard_anzahl}× besetzt</Badge>
                {dienstTyp.gruppen_anforderungen.map((a) => (
                  <Badge key={a.gruppe.id} tone="pine">
                    mind. {a.mindest_anzahl}× {a.gruppe.name}
                  </Badge>
                ))}
                {dienstTyp.erforderliche_filtertags.map((tag) => (
                  <Badge key={tag} tone="gold">
                    {filtertagLabel(tag)}
                  </Badge>
                ))}
              </div>
              <IconButton
                label="Löschen"
                tone="danger"
                onClick={() => handleDelete(dienstTyp.id, dienstTyp.name)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Row>
          ))}
        </div>
      )}
      <form onSubmit={handleCreate} className="flex flex-col gap-4 border-t border-line p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dienst-typ-neu-name">Name</Label>
            <Input
              id="dienst-typ-neu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="dienst-typ-neu-anzahl">Standard-Anzahl</Label>
            <Input
              id="dienst-typ-neu-anzahl"
              type="number"
              min={1}
              value={standardAnzahl}
              onChange={(e) => setStandardAnzahl(Number(e.target.value))}
              required
            />
          </div>
        </div>
        <GruppenAnforderungenEditor
          gruppen={gruppen}
          anforderungen={gruppenAnforderungen}
          onChange={setGruppenAnforderungen}
          idPrefix="dienst-typ-neu"
        />
        <FiltertagChips
          ausgewaehlt={erforderlicheTags}
          onChange={setErforderlicheTags}
          idPrefix="dienst-typ-neu"
        />
        <Button type="submit" className="self-start">
          <Plus className="h-4 w-4" />
          Dienst-Typ anlegen
        </Button>
      </form>
    </Card>
  )
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function VerfuegbarkeitSection({ pfarreiId }: { pfarreiId: number }) {
  const [blocker, setBlocker] = useState<FiltertagBlocker[]>([])
  const [filtertag, setFiltertag] = useState<Filtertag>('grundschueler')
  const [wochentag, setWochentag] = useState(0)
  const [startZeit, setStartZeit] = useState('08:00')
  const [endZeit, setEndZeit] = useState('13:00')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    filtertagBlockerListe(pfarreiId).then(setBlocker)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: FiltertagBlockerEingabe = {
      filtertag,
      wochentag,
      start_zeit: `${startZeit}:00`,
      end_zeit: `${endZeit}:00`,
    }
    try {
      await filtertagBlockerErstellen(pfarreiId, daten)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Blockers'))
    }
  }

  async function handleDelete(blockerId: number) {
    setError(null)
    try {
      await filtertagBlockerLoeschen(pfarreiId, blockerId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Blockers'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Verfügbarkeits-Blocker"
        description="Zeitfenster, in denen Minis mit einem bestimmten Filtertag nicht eingeplant werden dürfen (z. B. Schulzeit)."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {blocker.length === 0 ? (
        <EmptyState icon={Clock} title="Noch keine Verfügbarkeits-Blocker angelegt" />
      ) : (
        <div>
          {FILTERTAGS.map((tag) => {
            const eintraege = blocker.filter((b) => b.filtertag === tag)
            if (eintraege.length === 0) return null
            return (
              <div key={tag}>
                <div className="border-b border-line bg-pine-tint/40 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {filtertagLabel(tag)}
                </div>
                {eintraege.map((b) => (
                  <Row key={b.id}>
                    <span className="text-sm text-ink">
                      {WOCHENTAGE[b.wochentag]}, {b.start_zeit.slice(0, 5)}–{b.end_zeit.slice(0, 5)}{' '}
                      Uhr
                    </span>
                    <IconButton label="Löschen" tone="danger" onClick={() => handleDelete(b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </Row>
                ))}
              </div>
            )
          })}
        </div>
      )}
      <form onSubmit={handleCreate} className="flex flex-col gap-4 border-t border-line p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="blocker-neu-filtertag">Filtertag</Label>
            <Select
              id="blocker-neu-filtertag"
              value={filtertag}
              onChange={(e) => setFiltertag(e.target.value as Filtertag)}
            >
              {FILTERTAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {filtertagLabel(tag)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="blocker-neu-wochentag">Wochentag</Label>
            <Select
              id="blocker-neu-wochentag"
              value={wochentag}
              onChange={(e) => setWochentag(Number(e.target.value))}
            >
              {WOCHENTAGE.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="blocker-neu-start">Startzeit</Label>
            <Input
              id="blocker-neu-start"
              type="time"
              value={startZeit}
              onChange={(e) => setStartZeit(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="blocker-neu-ende">Endzeit</Label>
            <Input
              id="blocker-neu-ende"
              type="time"
              value={endZeit}
              onChange={(e) => setEndZeit(e.target.value)}
              required
            />
          </div>
        </div>
        <Button type="submit" className="self-start">
          <Plus className="h-4 w-4" />
          Blocker anlegen
        </Button>
      </form>
    </Card>
  )
}

const BUNDESLAND_NAMEN: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
}

function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

function FerienSection({ pfarreiId }: { pfarreiId: number }) {
  const [pfarreiInfo, setPfarreiInfo] = useState<PfarreiInfo | null>(null)
  const [ferien, setFerien] = useState<Ferienzeitraum[]>([])
  const [aktualisiert, setAktualisiert] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    pfarreiDetail(pfarreiId).then(setPfarreiInfo)
    ferienListe(pfarreiId).then(setFerien)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleBundeslandChange(bundesland: Bundesland) {
    setError(null)
    try {
      const aktualisiertePfarrei = await bundeslandSetzen(pfarreiId, bundesland)
      setPfarreiInfo(aktualisiertePfarrei)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Ändern des Bundeslands'))
    }
  }

  async function handleAktualisieren() {
    setError(null)
    setAktualisiert(false)
    try {
      const neueFerien = await ferienAktualisieren(pfarreiId)
      setFerien(neueFerien)
      setAktualisiert(true)
    } catch (err) {
      setError(fehlerText(err, 'Ferienkalender konnte nicht aktualisiert werden'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Ferien"
        description="Schulferien des laufenden Schuljahrs, automatisch abgerufen für das gewählte Bundesland."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4 border-b border-line p-5">
        <div>
          <Label htmlFor="ferien-bundesland">Bundesland</Label>
          <Select
            id="ferien-bundesland"
            value={pfarreiInfo?.bundesland ?? 'BY'}
            onChange={(e) => handleBundeslandChange(e.target.value as Bundesland)}
          >
            {BUNDESLAENDER.map((code) => (
              <option key={code} value={code}>
                {BUNDESLAND_NAMEN[code]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" onClick={handleAktualisieren}>
          <RefreshCw className="h-4 w-4" />
          Jetzt aktualisieren
        </Button>
        {aktualisiert && <span className="text-sm text-ink-soft">Ferienkalender aktualisiert.</span>}
      </div>
      {ferien.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Noch keine Ferien geladen"
          description='Auf "Jetzt aktualisieren" klicken, um den Ferienkalender zu laden.'
        />
      ) : (
        <div>
          {ferien.map((f) => (
            <Row key={f.id}>
              <span className="text-sm text-ink">
                {f.name} ({formatDatum(f.start_datum)}–{formatDatum(f.end_datum)})
              </span>
              <Badge tone="neutral">Schuljahr {f.schuljahr}</Badge>
            </Row>
          ))}
        </div>
      )}
    </Card>
  )
}

function FeiertageSection({ pfarreiId }: { pfarreiId: number }) {
  const [feiertage, setFeiertage] = useState<Feiertag[]>([])
  const [error, setError] = useState<string | null>(null)
  const jahr = new Date().getFullYear()

  const reload = useCallback(() => {
    feiertageListe(pfarreiId, jahr).then(setFeiertage)
  }, [pfarreiId, jahr])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleToggle(feiertag: Feiertag, feld: 'schulfrei' | 'arbeiter_frei') {
    setError(null)
    const aktualisiert = { ...feiertag, [feld]: !feiertag[feld] }
    setFeiertage((aktuell) => aktuell.map((f) => (f.key === feiertag.key ? aktualisiert : f)))
    try {
      await feiertagEinstellungSetzen(pfarreiId, feiertag.key, {
        schulfrei: aktualisiert.schulfrei,
        arbeiter_frei: aktualisiert.arbeiter_frei,
      })
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern der Feiertags-Einstellung'))
      reload()
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Gesetzliche Feiertage"
        description={`Feiertage ${jahr}, mit Unterscheidung ob schulfrei und/oder auch für Arbeiter frei.`}
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {feiertage.length === 0 ? (
        <EmptyState icon={Landmark} title="Keine Feiertage gefunden" />
      ) : (
        <div>
          {feiertage.map((f) => (
            <Row key={f.key}>
              <span className="text-sm text-ink">
                {f.name} ({formatDatum(f.datum)})
              </span>
              <div className="flex items-center gap-2">
                <CheckboxChip
                  id={`feiertag-${f.key}-schulfrei`}
                  checked={f.schulfrei}
                  onChange={() => handleToggle(f, 'schulfrei')}
                >
                  schulfrei
                </CheckboxChip>
                <CheckboxChip
                  id={`feiertag-${f.key}-arbeiterfrei`}
                  checked={f.arbeiter_frei}
                  onChange={() => handleToggle(f, 'arbeiter_frei')}
                >
                  auch frei für Arbeiter
                </CheckboxChip>
              </div>
            </Row>
          ))}
        </div>
      )}
    </Card>
  )
}

const TABS = [
  { key: 'gruppen', label: 'Gruppen', icon: Users },
  { key: 'minis', label: 'Minis', icon: UserRound },
  { key: 'dienst-typen', label: 'Dienst-Typen', icon: ClipboardList },
  { key: 'verfuegbarkeit', label: 'Verfügbarkeit', icon: Clock },
  { key: 'ferien', label: 'Ferien', icon: CalendarDays },
  { key: 'feiertage', label: 'Feiertage', icon: Landmark },
] as const

type TabKey = (typeof TABS)[number]['key']

export function StammdatenPage() {
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [tab, setTab] = useState<TabKey>('gruppen')

  const reloadGruppen = useCallback(() => {
    gruppenListe(id).then(setGruppen)
  }, [id])

  useEffect(() => {
    reloadGruppen()
  }, [reloadGruppen])

  return (
    <AppShell>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-pine-dark"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Übersicht
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">Stammdaten</h1>
      <p className="mt-1 text-ink-soft">
        Gruppen, Minis und Dienst-Typen dieser Pfarrei verwalten.
      </p>
      <Link
        to={`/pfarreien/${id}/miniplaene`}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-pine-dark"
      >
        Zu den Miniplänen
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <div className="mt-6 flex gap-1 border-b border-line">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-pine text-pine-dark'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'gruppen' && (
          <GruppenSection pfarreiId={id} gruppen={gruppen} reload={reloadGruppen} />
        )}
        {tab === 'minis' && <MinisSection pfarreiId={id} gruppen={gruppen} />}
        {tab === 'dienst-typen' && <DienstTypenSection pfarreiId={id} gruppen={gruppen} />}
        {tab === 'verfuegbarkeit' && <VerfuegbarkeitSection pfarreiId={id} />}
        {tab === 'ferien' && <FerienSection pfarreiId={id} />}
        {tab === 'feiertage' && <FeiertageSection pfarreiId={id} />}
      </div>
    </AppShell>
  )
}
