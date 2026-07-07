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
} from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  dienstTypBearbeiten,
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
  miniBearbeiten,
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
import {
  BearbeitenAbschnitt,
  NeuAnlegenAbschnitt,
  Row,
} from '../components/ui/CardSections'
import { EmptyState } from '../components/ui/EmptyState'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { TabBar } from '../components/ui/TabBar'
import { useToast } from '../components/ui/Toast'
import { formatDatum } from '../lib/datum'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function filtertagLabel(filtertags: FiltertagDef[], key: Filtertag): string {
  return filtertags.find((f) => f.key === key)?.label ?? key
}

// Gemeinsame Chip-Auswahl für alle "genau eine Option aus einer kleinen Liste"-Felder (Gruppe,
// Verfügbarkeits-Status), damit sie nicht mal als <select>, mal als Chips daherkommen.
function ChipAuswahl<T extends string | number>({
  label,
  hint,
  options,
  ausgewaehlt,
  onChange,
  idPrefix,
  allowNone = false,
  noneLabel = 'Keiner',
  emptyText,
}: {
  label: string
  hint?: string
  options: { key: T; label: string }[]
  ausgewaehlt: T | null
  onChange: (wert: T | null) => void
  idPrefix: string
  allowNone?: boolean
  noneLabel?: string
  emptyText?: string
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-ink-soft">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowNone && (
            <CheckboxChip
              id={`${idPrefix}-keiner`}
              checked={ausgewaehlt === null}
              onChange={() => onChange(null)}
            >
              {noneLabel}
            </CheckboxChip>
          )}
          {options.map((option) => (
            <CheckboxChip
              key={option.key}
              id={`${idPrefix}-${option.key}`}
              checked={ausgewaehlt === option.key}
              onChange={() => onChange(option.key)}
            >
              {option.label}
            </CheckboxChip>
          ))}
        </div>
      )}
    </div>
  )
}

function FiltertagAuswahl({
  filtertags,
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  filtertags: FiltertagDef[]
  ausgewaehlt: Filtertag | null
  onChange: (tag: Filtertag | null) => void
  idPrefix: string
}) {
  return (
    <ChipAuswahl
      label="Verfügbarkeits-Status"
      options={filtertags.map((f) => ({ key: f.key, label: f.label }))}
      ausgewaehlt={ausgewaehlt}
      onChange={onChange}
      idPrefix={idPrefix}
      allowNone
      emptyText="Noch keine Verfügbarkeits-Status angelegt (Reiter „Verfügbarkeits-Status“)."
    />
  )
}

function GruppenAuswahl({
  gruppen,
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  gruppen: Gruppe[]
  ausgewaehlt: number | ''
  onChange: (gruppeId: number) => void
  idPrefix: string
}) {
  return (
    <ChipAuswahl
      label="Gruppe"
      options={gruppen.map((g) => ({ key: g.id, label: g.name }))}
      ausgewaehlt={ausgewaehlt === '' ? null : ausgewaehlt}
      onChange={(wert) => {
        if (wert !== null) onChange(wert)
      }}
      idPrefix={idPrefix}
      emptyText="Noch keine Gruppen angelegt (Reiter „Gruppen“)."
    />
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
        description="Erfahrungsstufen der Ministranten (z. B. „neu“, „normal“, „Obermini“), auf die sich Mindestbesetzungen beziehen."
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
              <BearbeitenAbschnitt key={gruppe.id}>
                <form onSubmit={handleUpdate} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`gruppe-${gruppe.id}-edit-name`}>Name</Label>
                    <Input
                      id={`gruppe-${gruppe.id}-edit-name`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <Button type="submit" size="sm">
                    <Check className="h-4 w-4" />
                    Speichern
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditId(null)}>
                    Abbrechen
                  </Button>
                </form>
              </BearbeitenAbschnitt>
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
      <NeuAnlegenAbschnitt>
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="gruppe-neu">Name</Label>
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
      </NeuAnlegenAbschnitt>
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
  const [ausgewaehlterFiltertag, setAusgewaehlterFiltertag] = useState<Filtertag | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editGruppeId, setEditGruppeId] = useState<number | ''>('')
  const [editFiltertag, setEditFiltertag] = useState<Filtertag | null>(null)
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
        filtertags: ausgewaehlterFiltertag ? [ausgewaehlterFiltertag] : [],
      })
      setName('')
      setAusgewaehlterFiltertag(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Minis'))
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault()
    if (editId === null || editGruppeId === '') return
    setError(null)
    try {
      await miniBearbeiten(pfarreiId, editId, {
        name: editName,
        gruppe_id: editGruppeId,
        filtertags: editFiltertag ? [editFiltertag] : [],
      })
      setEditId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Bearbeiten des Minis'))
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
          {minis.map((mini) =>
            editId === mini.id ? (
              <BearbeitenAbschnitt key={mini.id}>
                <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                  <div className="sm:max-w-xs">
                    <Label htmlFor={`mini-${mini.id}-edit-name`}>Name</Label>
                    <Input
                      id={`mini-${mini.id}-edit-name`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <GruppenAuswahl
                    gruppen={gruppen}
                    ausgewaehlt={editGruppeId}
                    onChange={setEditGruppeId}
                    idPrefix={`mini-${mini.id}-edit-gruppe`}
                  />
                  <FiltertagAuswahl
                    filtertags={filtertags}
                    ausgewaehlt={editFiltertag}
                    onChange={setEditFiltertag}
                    idPrefix={`mini-${mini.id}-edit`}
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      <Check className="h-4 w-4" />
                      Speichern
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              </BearbeitenAbschnitt>
            ) : (
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
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Bearbeiten"
                    onClick={() => {
                      setEditId(mini.id)
                      setEditName(mini.name)
                      setEditGruppeId(mini.gruppe_id)
                      setEditFiltertag(mini.filtertags[0] ?? null)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <InlineConfirmButton onConfirm={() => handleDelete(mini.id)} />
                </div>
              </Row>
            ),
          )}
        </div>
      )}
      <NeuAnlegenAbschnitt>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="sm:max-w-xs">
            <Label htmlFor="mini-neu-name">Name</Label>
            <Input
              id="mini-neu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <GruppenAuswahl
            gruppen={gruppen}
            ausgewaehlt={gruppeId}
            onChange={setGruppeId}
            idPrefix="mini-neu-gruppe"
          />
          <FiltertagAuswahl
            filtertags={filtertags}
            ausgewaehlt={ausgewaehlterFiltertag}
            onChange={setAusgewaehlterFiltertag}
            idPrefix="mini-neu"
          />
          <Button type="submit" disabled={gruppen.length === 0} className="self-start">
            <Plus className="h-4 w-4" />
            Mini anlegen
          </Button>
        </form>
      </NeuAnlegenAbschnitt>
    </Card>
  )
}

function GruppenAnforderungenEditor({
  gruppen,
  anforderungen,
  onChange,
  idPrefix,
  maxAnzahl,
}: {
  gruppen: Gruppe[]
  anforderungen: GruppenAnforderung[]
  onChange: (anforderungen: GruppenAnforderung[]) => void
  idPrefix: string
  maxAnzahl: number
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
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              id={`${idPrefix}-gruppe-${index}`}
              value={anforderung.gruppe_id}
              onChange={(e) => updateRow(index, { gruppe_id: Number(e.target.value) })}
              className="min-w-[9rem] flex-1"
            >
              {gruppen.map((gruppe) => (
                <option key={gruppe.id} value={gruppe.id}>
                  {gruppe.name}
                </option>
              ))}
            </Select>
            <span className="shrink-0 text-sm text-ink-soft">mind.</span>
            <Input
              id={`${idPrefix}-mindestanzahl-${index}`}
              type="number"
              min={1}
              max={maxAnzahl}
              value={anforderung.mindest_anzahl}
              onChange={(e) =>
                updateRow(index, {
                  mindest_anzahl: Math.min(Number(e.target.value), maxAnzahl),
                })
              }
              className="w-16 shrink-0 text-center"
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
}: {
  pfarreiId: number
  gruppen: Gruppe[]
}) {
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [gruppenAnforderungen, setGruppenAnforderungen] = useState<GruppenAnforderung[]>([])
  const [zeigeLabel, setZeigeLabel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editStandardAnzahl, setEditStandardAnzahl] = useState(1)
  const [editGruppenAnforderungen, setEditGruppenAnforderungen] = useState<GruppenAnforderung[]>(
    [],
  )
  const [editZeigeLabel, setEditZeigeLabel] = useState(false)
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
      gruppen_anforderungen: gruppenAnforderungen,
      zeige_label: zeigeLabel,
    }
    try {
      await dienstTypErstellen(pfarreiId, daten)
      setName('')
      setStandardAnzahl(1)
      setGruppenAnforderungen([])
      setZeigeLabel(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Dienst-Typs'))
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault()
    if (editId === null) return
    setError(null)
    try {
      await dienstTypBearbeiten(pfarreiId, editId, {
        name: editName,
        standard_anzahl: editStandardAnzahl,
        gruppen_anforderungen: editGruppenAnforderungen,
        zeige_label: editZeigeLabel,
      })
      setEditId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Bearbeiten des Dienst-Typs'))
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
          {dienstTypen.map((dienstTyp) =>
            editId === dienstTyp.id ? (
              <BearbeitenAbschnitt key={dienstTyp.id}>
                <form onSubmit={handleUpdate} className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="min-w-[10rem] flex-1">
                      <Label htmlFor={`dienst-typ-${dienstTyp.id}-edit-name`}>Name</Label>
                      <Input
                        id={`dienst-typ-${dienstTyp.id}-edit-name`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor={`dienst-typ-${dienstTyp.id}-edit-anzahl`}>
                        Standard-Anzahl
                      </Label>
                      <Input
                        id={`dienst-typ-${dienstTyp.id}-edit-anzahl`}
                        type="number"
                        min={1}
                        value={editStandardAnzahl}
                        onChange={(e) => setEditStandardAnzahl(Number(e.target.value))}
                        required
                        className="w-16 text-center"
                      />
                    </div>
                  </div>
                  <GruppenAnforderungenEditor
                    gruppen={gruppen}
                    anforderungen={editGruppenAnforderungen}
                    maxAnzahl={editStandardAnzahl}
                    onChange={setEditGruppenAnforderungen}
                    idPrefix={`dienst-typ-${dienstTyp.id}-edit`}
                  />
                  <CheckboxChip
                    id={`dienst-typ-${dienstTyp.id}-edit-zeige-label`}
                    checked={editZeigeLabel}
                    onChange={() => setEditZeigeLabel((wert) => !wert)}
                    title="Name erscheint als Beschriftung auf dem PDF-Plan."
                  >
                    Auf dem Plan anzeigen
                  </CheckboxChip>
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      <Check className="h-4 w-4" />
                      Speichern
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              </BearbeitenAbschnitt>
            ) : (
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
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Bearbeiten"
                    onClick={() => {
                      setEditId(dienstTyp.id)
                      setEditName(dienstTyp.name)
                      setEditStandardAnzahl(dienstTyp.standard_anzahl)
                      setEditGruppenAnforderungen(
                        dienstTyp.gruppen_anforderungen.map((a) => ({
                          gruppe_id: a.gruppe.id,
                          mindest_anzahl: a.mindest_anzahl,
                        })),
                      )
                      setEditZeigeLabel(dienstTyp.zeige_label)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <InlineConfirmButton onConfirm={() => handleDelete(dienstTyp.id)} />
                </div>
              </Row>
            ),
          )}
        </div>
      )}
      <NeuAnlegenAbschnitt>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[10rem] flex-1">
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
                className="w-16 text-center"
              />
            </div>
          </div>
          <GruppenAnforderungenEditor
            gruppen={gruppen}
            anforderungen={gruppenAnforderungen}
            maxAnzahl={standardAnzahl}
            onChange={setGruppenAnforderungen}
            idPrefix="dienst-typ-neu"
          />
          <CheckboxChip
            id="dienst-typ-neu-zeige-label"
            checked={zeigeLabel}
            onChange={() => setZeigeLabel((wert) => !wert)}
            title="Name erscheint als Beschriftung auf dem PDF-Plan."
          >
            Auf dem Plan anzeigen
          </CheckboxChip>
          <Button type="submit" className="self-start">
            <Plus className="h-4 w-4" />
            Dienst-Typ anlegen
          </Button>
        </form>
      </NeuAnlegenAbschnitt>
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
        {blocker.start_zeit.slice(0, 5)}–{blocker.end_zeit.slice(0, 5)} Uhr
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
    const daten: FiltertagEingabe = { label, ist_schueler_artig: istSchuelerArtig }
    try {
      await filtertagErstellen(pfarreiId, daten)
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
        description="Wann ein Mini nicht verfügbar ist – je Status mit wöchentlichen Sperrzeiten, z. B. Schulzeiten für „Schüler“."
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
              <BearbeitenAbschnitt key={filtertag.id}>
                <form onSubmit={handleUpdate} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[10rem] flex-1">
                    <Label htmlFor={`filtertag-${filtertag.id}-edit-label`}>Bezeichnung</Label>
                    <Input
                      id={`filtertag-${filtertag.id}-edit-label`}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <CheckboxChip
                    id={`filtertag-${filtertag.id}-edit-schueler-artig`}
                    checked={editIstSchuelerArtig}
                    onChange={() => setEditIstSchuelerArtig((wert) => !wert)}
                    title="Ferien und schulfreie Feiertage gelten für diesen Status als frei."
                  >
                    folgt Schulferien-Regeln
                  </CheckboxChip>
                  <Button type="submit" size="sm">
                    <Check className="h-4 w-4" />
                    Speichern
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditId(null)}>
                    Abbrechen
                  </Button>
                </form>
              </BearbeitenAbschnitt>
            ) : (
              <div key={filtertag.id} className="border-b border-line last:border-b-0">
                <Row>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{filtertag.label}</span>
                    {filtertag.ist_schueler_artig && (
                      <Badge tone="gold">folgt Schulferien-Regeln</Badge>
                    )}
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
                  {WOCHENTAGE.map((wochentagName, wochentag) => {
                    const eintraege = blocker.filter(
                      (b) => b.filtertag_id === filtertag.id && b.wochentag === wochentag,
                    )
                    if (eintraege.length === 0) return null
                    return (
                      <div key={wochentag}>
                        <p className="pt-2 text-xs font-medium text-ink-faint">{wochentagName}</p>
                        {eintraege.map((b) => (
                          <FiltertagBlockerZeile
                            key={b.id}
                            blocker={b}
                            onDelete={() => handleBlockerDelete(b.id)}
                          />
                        ))}
                      </div>
                    )
                  })}
                  <NeuerBlockerForm filtertagId={filtertag.id} onCreate={handleBlockerCreate} />
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <NeuAnlegenAbschnitt>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
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
            title="Ferien und schulfreie Feiertage gelten für diesen Status als frei."
          >
            folgt Schulferien-Regeln
          </CheckboxChip>
          <Button type="submit">
            <Plus className="h-4 w-4" />
            Anlegen
          </Button>
        </form>
      </NeuAnlegenAbschnitt>
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
    setAktualisiert(false)
    try {
      const aktualisiertePfarrei = await bundeslandSetzen(pfarreiId, bundesland)
      setPfarreiInfo(aktualisiertePfarrei)
      // Das Setzen des Bundeslands stößt serverseitig direkt einen Ferien-Sync an - die Liste
      // hier muss daher neu geladen werden, um die neuen Daten anzuzeigen.
      const neueFerien = await ferienListe(pfarreiId)
      setFerien(neueFerien)
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
        <EmptyState icon={CalendarDays} title="Noch keine Ferien geladen" />
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
        description={`Feiertage ${jahr}, mit Unterscheidung ob schulfrei und/oder arbeitsfrei.`}
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
                  arbeitsfrei
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
      <Alert tone="info">
        Während der Ferien und an schulfreien Feiertagen gelten die Sperrzeiten von
        Verfügbarkeits-Status, die Schulferien-Regeln folgen, nicht.
      </Alert>
      <TabBar tabs={VERFUEGBARKEIT_TABS} active={subTab} onChange={setSubTab} />
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
      <Link
        to={`/pfarreien/${id}/miniplaene`}
        className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-transparent px-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-pine hover:text-pine-dark"
      >
        Zu den Miniplänen
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mt-6" />

      <div className="mt-6">
        {tab === 'gruppen' && (
          <GruppenSection pfarreiId={id} gruppen={gruppen} reload={reloadGruppen} />
        )}
        {tab === 'minis' && (
          <MinisSection pfarreiId={id} gruppen={gruppen} filtertags={filtertags} />
        )}
        {tab === 'dienst-typen' && <DienstTypenSection pfarreiId={id} gruppen={gruppen} />}
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
