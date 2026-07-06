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
  filtertagBearbeiten,
  filtertagErstellen,
  filtertagLoeschen,
  filtertagsListe,
  type Filtertag as FiltertagDef,
  type FiltertagEingabe,
} from '../api/filtertags'
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
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { useToast } from '../components/ui/Toast'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function filtertagLabel(filtertags: FiltertagDef[], key: Filtertag): string {
  return filtertags.find((f) => f.key === key)?.label ?? key
}

function FiltertagChips({
  filtertags,
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  filtertags: FiltertagDef[]
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
      <Label hint="Status: wann ein Mini verfügbar ist">Verfügbarkeits-Status</Label>
      {filtertags.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Noch keine Verfügbarkeits-Status angelegt (Reiter „Verfügbarkeits-Status“).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtertags.map((filtertag) => (
            <CheckboxChip
              key={filtertag.key}
              id={`${idPrefix}-${filtertag.key}`}
              checked={ausgewaehlt.includes(filtertag.key)}
              onChange={() => toggle(filtertag.key)}
            >
              {filtertag.label}
            </CheckboxChip>
          ))}
        </div>
      )}
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
  const { showToast } = useToast()

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

  async function handleDelete(gruppeId: number) {
    setError(null)
    try {
      await gruppeLoeschen(pfarreiId, gruppeId)
      showToast('Gruppe gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen der Gruppe'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Gruppen"
        description="Gruppe: Erfahrungsstufe für Mindestbesetzung (Altersstufen oder Untergruppen der Ministranten, z. B. „neu“, „normal“, „Obermini“)."
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
                  <InlineConfirmButton onConfirm={() => handleDelete(gruppe.id)} />
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

function MinisSection({
  pfarreiId,
  gruppen,
  filtertags,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
}) {
  const [minis, setMinis] = useState<Mini[]>([])
  const [name, setName] = useState('')
  const [gruppeId, setGruppeId] = useState<number | ''>('')
  const [ausgewaehlteFiltertags, setAusgewaehlteFiltertags] = useState<Filtertag[]>([])
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

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
      await miniErstellen(pfarreiId, {
        name,
        gruppe_id: gruppeId,
        filtertags: ausgewaehlteFiltertags,
      })
      setName('')
      setAusgewaehlteFiltertags([])
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Minis'))
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
                    {filtertagLabel(filtertags, tag)}
                  </Badge>
                ))}
              </div>
              <InlineConfirmButton onConfirm={() => handleDelete(mini.id)} />
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
        <FiltertagChips
          filtertags={filtertags}
          ausgewaehlt={ausgewaehlteFiltertags}
          onChange={setAusgewaehlteFiltertags}
          idPrefix="mini-neu"
        />
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
              onChange={(e) =>
                updateRow(index, { mindest_anzahl: Number(e.target.value) })
              }
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

function DienstTypenSection({
  pfarreiId,
  gruppen,
  filtertags,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
}) {
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [erforderlicheTags, setErforderlicheTags] = useState<Filtertag[]>([])
  const [gruppenAnforderungen, setGruppenAnforderungen] = useState<GruppenAnforderung[]>([])
  const [zeigeLabel, setZeigeLabel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

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
      zeige_label: zeigeLabel,
    }
    try {
      await dienstTypErstellen(pfarreiId, daten)
      setName('')
      setStandardAnzahl(1)
      setErforderlicheTags([])
      setGruppenAnforderungen([])
      setZeigeLabel(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Dienst-Typs'))
    }
  }

  async function handleDelete(dienstTypId: number) {
    setError(null)
    try {
      await dienstTypLoeschen(pfarreiId, dienstTypId)
      showToast('Dienst-Typ gelöscht')
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
                {dienstTyp.zeige_label && <Badge tone="neutral">auf Plan sichtbar</Badge>}
                {dienstTyp.gruppen_anforderungen.map((a) => (
                  <Badge key={a.gruppe.id} tone="pine">
                    mind. {a.mindest_anzahl}× {a.gruppe.name}
                  </Badge>
                ))}
                {dienstTyp.erforderliche_filtertags.map((tag) => (
                  <Badge key={tag} tone="gold">
                    {filtertagLabel(filtertags, tag)}
                  </Badge>
                ))}
              </div>
              <InlineConfirmButton onConfirm={() => handleDelete(dienstTyp.id)} />
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
          filtertags={filtertags}
          ausgewaehlt={erforderlicheTags}
          onChange={setErforderlicheTags}
          idPrefix="dienst-typ-neu"
        />
        <CheckboxChip
          id="dienst-typ-neu-zeige-label"
          checked={zeigeLabel}
          onChange={() => setZeigeLabel((wert) => !wert)}
        >
          Auf dem Plan anzeigen
        </CheckboxChip>
        <Button type="submit" className="self-start">
          <Plus className="h-4 w-4" />
          Dienst-Typ anlegen
        </Button>
      </form>
    </Card>
  )
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function FiltertagBlockerZeile({
  blocker,
  onDelete,
}: {
  blocker: FiltertagBlocker
  onDelete: () => void
}) {
  return (
    <Row>
      <span className="text-sm text-ink">
        {WOCHENTAGE[blocker.wochentag]}, {blocker.start_zeit.slice(0, 5)}–
        {blocker.end_zeit.slice(0, 5)} Uhr
      </span>
      <InlineConfirmButton onConfirm={onDelete} size="sm" />
    </Row>
  )
}

function NeuerBlockerForm({
  filtertagId,
  onCreate,
}: {
  filtertagId: number
  onCreate: (daten: FiltertagBlockerEingabe) => void
}) {
  const [wochentag, setWochentag] = useState(0)
  const [startZeit, setStartZeit] = useState('08:00')
  const [endZeit, setEndZeit] = useState('13:00')

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    onCreate({
      filtertag_id: filtertagId,
      wochentag,
      start_zeit: `${startZeit}:00`,
      end_zeit: `${endZeit}:00`,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 px-5 py-3">
      <div>
        <Label htmlFor={`blocker-neu-${filtertagId}-wochentag`}>Wochentag</Label>
        <Select
          id={`blocker-neu-${filtertagId}-wochentag`}
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
        <Label htmlFor={`blocker-neu-${filtertagId}-start`}>Startzeit</Label>
        <Input
          id={`blocker-neu-${filtertagId}-start`}
          type="time"
          value={startZeit}
          onChange={(e) => setStartZeit(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor={`blocker-neu-${filtertagId}-ende`}>Endzeit</Label>
        <Input
          id={`blocker-neu-${filtertagId}-ende`}
          type="time"
          value={endZeit}
          onChange={(e) => setEndZeit(e.target.value)}
          required
        />
      </div>
      <Button type="submit" variant="secondary">
        <Plus className="h-4 w-4" />
        Zeitfenster hinzufügen
      </Button>
    </form>
  )
}

function FiltertagsSection({
  pfarreiId,
  filtertags,
  reload,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  reload: () => void
}) {
  const [blocker, setBlocker] = useState<FiltertagBlocker[]>([])
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [istSchuelerArtig, setIstSchuelerArtig] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIstSchuelerArtig, setEditIstSchuelerArtig] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  const reloadBlocker = useCallback(() => {
    filtertagBlockerListe(pfarreiId).then(setBlocker)
  }, [pfarreiId])

  useEffect(() => {
    reloadBlocker()
  }, [reloadBlocker])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: FiltertagEingabe = { key, label, ist_schueler_artig: istSchuelerArtig }
    try {
      await filtertagErstellen(pfarreiId, daten)
      setKey('')
      setLabel('')
      setIstSchuelerArtig(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Verfügbarkeits-Status'))
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault()
    if (editId === null) return
    setError(null)
    try {
      await filtertagBearbeiten(pfarreiId, editId, {
        label: editLabel,
        ist_schueler_artig: editIstSchuelerArtig,
      })
      setEditId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Bearbeiten des Verfügbarkeits-Status'))
    }
  }

  async function handleDelete(filtertagId: number) {
    setError(null)
    try {
      await filtertagLoeschen(pfarreiId, filtertagId)
      showToast('Verfügbarkeits-Status gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Verfügbarkeits-Status'))
    }
  }

  async function handleBlockerCreate(daten: FiltertagBlockerEingabe) {
    setError(null)
    try {
      await filtertagBlockerErstellen(pfarreiId, daten)
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Zeitfensters'))
    }
  }

  async function handleBlockerDelete(blockerId: number) {
    setError(null)
    try {
      await filtertagBlockerLoeschen(pfarreiId, blockerId)
      showToast('Zeitfenster gelöscht')
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Zeitfensters'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Verfügbarkeits-Status"
        description="Status: wann ein Mini verfügbar ist (z. B. „Schüler“ blockiert Schulzeiten). Anders als die Gruppe hat der Status keinen Einfluss auf die Mindestbesetzung, sondern nur auf die Verfügbarkeit."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {filtertags.length === 0 ? (
        <EmptyState icon={Clock} title="Noch keine Verfügbarkeits-Status angelegt" />
      ) : (
        <div>
          {filtertags.map((filtertag) =>
            editId === filtertag.id ? (
              <Row key={filtertag.id}>
                <form onSubmit={handleUpdate} className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    required
                    autoFocus
                    className="h-9"
                  />
                  <CheckboxChip
                    id={`filtertag-${filtertag.id}-edit-schueler-artig`}
                    checked={editIstSchuelerArtig}
                    onChange={() => setEditIstSchuelerArtig((wert) => !wert)}
                  >
                    schüler-artig
                  </CheckboxChip>
                  <IconButton label="Speichern" type="submit">
                    <Check className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Abbrechen" type="button" onClick={() => setEditId(null)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </form>
              </Row>
            ) : (
              <div key={filtertag.id} className="border-b border-line last:border-b-0">
                <Row>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{filtertag.label}</span>
                    <Badge tone="neutral">{filtertag.key}</Badge>
                    {filtertag.ist_schueler_artig && <Badge tone="gold">schüler-artig</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Bearbeiten"
                      onClick={() => {
                        setEditId(filtertag.id)
                        setEditLabel(filtertag.label)
                        setEditIstSchuelerArtig(filtertag.ist_schueler_artig)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <InlineConfirmButton onConfirm={() => handleDelete(filtertag.id)} />
                  </div>
                </Row>
                <div className="bg-pine-tint/20 pl-4">
                  {blocker
                    .filter((b) => b.filtertag_id === filtertag.id)
                    .map((b) => (
                      <FiltertagBlockerZeile
                        key={b.id}
                        blocker={b}
                        onDelete={() => handleBlockerDelete(b.id)}
                      />
                    ))}
                  <NeuerBlockerForm filtertagId={filtertag.id} onCreate={handleBlockerCreate} />
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 border-t border-line p-5">
        <div>
          <Label htmlFor="filtertag-neu-key" hint="technischer Schlüssel, z. B. „azubi“">
            Key
          </Label>
          <Input
            id="filtertag-neu-key"
            placeholder="z. B. azubi"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="filtertag-neu-label">Bezeichnung</Label>
          <Input
            id="filtertag-neu-label"
            placeholder="z. B. Azubi"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>
        <CheckboxChip
          id="filtertag-neu-schueler-artig"
          checked={istSchuelerArtig}
          onChange={() => setIstSchuelerArtig((wert) => !wert)}
        >
          schüler-artig (Ferien-/Feiertagsregeln wie bei Schülern)
        </CheckboxChip>
        <Button type="submit">
          <Plus className="h-4 w-4" />
          Anlegen
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
] as const

type TabKey = (typeof TABS)[number]['key']

const VERFUEGBARKEIT_TABS = [
  { key: 'status', label: 'Verfügbarkeits-Status', icon: Clock },
  { key: 'ferien', label: 'Ferien', icon: CalendarDays },
  { key: 'feiertage', label: 'Feiertage', icon: Landmark },
] as const

type VerfuegbarkeitTabKey = (typeof VERFUEGBARKEIT_TABS)[number]['key']

function VerfuegbarkeitSection({
  pfarreiId,
  filtertags,
  reloadFiltertags,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  reloadFiltertags: () => void
}) {
  const [subTab, setSubTab] = useState<VerfuegbarkeitTabKey>('status')

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <span>
          Drei zusammenspielende Mechanismen bestimmen, wann ein Mini verfügbar ist: <b>Ferien</b>{' '}
          und <b>Feiertage</b> gelten pfarreiweit für alle „schüler-artigen“ Verfügbarkeits-Status
          und <b>überschreiben</b> dabei die wöchentlichen <b>Blocker-Regeln</b> des jeweiligen
          Verfügbarkeits-Status (z. B. blockiert „Schüler“ normalerweise Schulzeiten, aber nicht
          während der Ferien).
        </span>
      </Alert>
      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {VERFUEGBARKEIT_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              subTab === key
                ? 'border-pine text-pine-dark'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {subTab === 'status' && (
        <FiltertagsSection pfarreiId={pfarreiId} filtertags={filtertags} reload={reloadFiltertags} />
      )}
      {subTab === 'ferien' && <FerienSection pfarreiId={pfarreiId} />}
      {subTab === 'feiertage' && <FeiertageSection pfarreiId={pfarreiId} />}
    </div>
  )
}

export function StammdatenPage() {
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [filtertags, setFiltertags] = useState<FiltertagDef[]>([])
  const [tab, setTab] = useState<TabKey>('gruppen')

  const reloadGruppen = useCallback(() => {
    gruppenListe(id).then(setGruppen)
  }, [id])

  const reloadFiltertags = useCallback(() => {
    filtertagsListe(id).then(setFiltertags)
  }, [id])

  useEffect(() => {
    reloadGruppen()
  }, [reloadGruppen])

  useEffect(() => {
    reloadFiltertags()
  }, [reloadFiltertags])

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
        className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-transparent px-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-pine hover:text-pine-dark"
      >
        Zu den Miniplänen
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <div className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
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
        {tab === 'minis' && (
          <MinisSection pfarreiId={id} gruppen={gruppen} filtertags={filtertags} />
        )}
        {tab === 'dienst-typen' && (
          <DienstTypenSection pfarreiId={id} gruppen={gruppen} filtertags={filtertags} />
        )}
        {tab === 'verfuegbarkeit' && (
          <VerfuegbarkeitSection
            pfarreiId={id}
            filtertags={filtertags}
            reloadFiltertags={reloadFiltertags}
          />
        )}
      </div>
    </AppShell>
  )
}
