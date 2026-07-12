import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  UserRound,
  X,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from 'react'
import { useParams } from 'react-router-dom'
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
import { feiertagEinstellungSetzen, feiertageListe, type Feiertag } from '../api/feiertage'
import { ferienAktualisieren, ferienListe, type Ferienzeitraum } from '../api/ferien'
import {
  filtertagBlockerBearbeiten,
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
import { bundeslandSetzen, pfarreiDetail, BUNDESLAENDER, type Bundesland } from '../api/pfarreien'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Row } from '../components/ui/CardSections'
import { EmptyState } from '../components/ui/EmptyState'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { Modal } from '../components/ui/Modal'
import { Popover } from '../components/ui/Popover'
import { ListSkeleton } from '../components/ui/Skeleton'
import { TabBar } from '../components/ui/TabBar'
import { useToast } from '../components/ui/Toast'
import { formatDatum } from '../lib/datum'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function filtertagLabel(filtertags: FiltertagDef[], key: Filtertag): string {
  return filtertags.find((f) => f.key === key)?.label ?? key
}

// Kleiner "+ Neu"-Button für die Kartenkopfzeile, dient zugleich als Anker für das
// Anlege-Popover.
const NeuButton = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(
  ({ label, onClick }, ref) => (
    <Button ref={ref} type="button" size="sm" title={label} onClick={onClick}>
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  ),
)
NeuButton.displayName = 'NeuButton'

// Einfaches Ein-Feld-Anlege-Formular im Popover (Name + Speichern/Abbrechen).
function InlineNeuForm({
  fieldId,
  fieldLabel = 'Name',
  placeholder,
  onSave,
  onCancel,
}: {
  fieldId: string
  fieldLabel?: string
  placeholder?: string
  onSave: (wert: string) => void
  onCancel: () => void
}) {
  const [wert, setWert] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(wert)
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <Label htmlFor={fieldId}>{fieldLabel}</Label>
        <Input
          id={fieldId}
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          placeholder={placeholder}
          autoFocus
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={!wert.trim()}>
          Anlegen
        </Button>
      </div>
    </form>
  )
}

// Inline-Bearbeiten einer einfachen Textzeile (Zeile wechselt selbst in einen Eingabe-Zustand)
// statt eines separaten Modals - für einfache Ein-Feld-Entitäten wie Gruppen.
function InlineTextEdit({
  fieldId,
  fieldLabel = 'Name',
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  fieldId: string
  fieldLabel?: string
  value: string
  onSave: (wert: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [wert, setWert] = useState(value)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(wert)
      }}
      className="flex flex-1 items-center gap-2"
    >
      <Input
        id={fieldId}
        aria-label={fieldLabel}
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        placeholder={placeholder}
        autoFocus
        required
        className="h-9"
      />
      <IconButton label="Speichern" type="submit">
        <Check className="h-4 w-4" />
      </IconButton>
      <IconButton label="Abbrechen" onClick={onCancel}>
        <X className="h-4 w-4" />
      </IconButton>
    </form>
  )
}

// Aktionsleiste am Ende eines Modal-Formulars (Abbrechen + Speichern).
function ModalAktionen({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  )
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
  geladen,
  reload,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  geladen: boolean
  reload: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null)
  const neuButtonRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()

  async function handleErstellen(name: string) {
    setError(null)
    try {
      await gruppeErstellen(pfarreiId, name)
      showToast('Gruppe angelegt')
      setNeuOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen der Gruppe'))
    }
  }

  async function handleBearbeiten(gruppeId: number, name: string) {
    setError(null)
    try {
      await gruppeBearbeiten(pfarreiId, gruppeId, name)
      showToast('Gruppe gespeichert')
      setBearbeitenId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern der Gruppe'))
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
    <Card>
      <CardHeader
        title="Gruppen"
        description="Erfahrungsstufen, auf die sich Mindestbesetzungen beziehen."
        action={<NeuButton ref={neuButtonRef} label="Gruppe" onClick={() => setNeuOffen(true)} />}
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Gruppe anlegen"
      >
        <InlineNeuForm
          fieldId="gruppe-neu-name"
          placeholder="z. B. Obermini"
          onSave={handleErstellen}
          onCancel={() => setNeuOffen(false)}
        />
      </Popover>
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : gruppen.length === 0 ? (
        <EmptyState icon={Users} title="Noch keine Gruppen angelegt" />
      ) : (
        <div>
          {gruppen.map((gruppe) =>
            bearbeitenId === gruppe.id ? (
              <Row key={gruppe.id}>
                <InlineTextEdit
                  fieldId={`gruppe-${gruppe.id}-name`}
                  value={gruppe.name}
                  onSave={(name) => handleBearbeiten(gruppe.id, name)}
                  onCancel={() => setBearbeitenId(null)}
                />
              </Row>
            ) : (
              <Row key={gruppe.id}>
                <span className="text-sm font-medium text-ink">{gruppe.name}</span>
                <div className="flex items-center gap-1">
                  <IconButton label="Bearbeiten" onClick={() => setBearbeitenId(gruppe.id)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <InlineConfirmButton onConfirm={() => handleDelete(gruppe.id)} />
                </div>
              </Row>
            ),
          )}
        </div>
      )}
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
  const [geladen, setGeladen] = useState(false)
  const [suche, setSuche] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalOffen, setModalOffen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [gruppeId, setGruppeId] = useState<number | ''>('')
  const [ausgewaehlterFiltertag, setAusgewaehlterFiltertag] = useState<Filtertag | null>(null)
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

  function oeffnenNeu() {
    setEditId(null)
    setName('')
    setGruppeId(gruppen[0]?.id ?? '')
    setAusgewaehlterFiltertag(null)
    setError(null)
    setModalOffen(true)
  }

  function oeffnenBearbeiten(mini: Mini) {
    setEditId(mini.id)
    setName(mini.name)
    setGruppeId(mini.gruppe_id)
    setAusgewaehlterFiltertag(mini.filtertags[0] ?? null)
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
          <div key={index} className="flex items-center gap-2">
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
              className="!w-16 shrink-0 text-center"
            />
            <span className="shrink-0 text-sm text-ink-soft">aus</span>
            <Select
              id={`${idPrefix}-gruppe-${index}`}
              value={anforderung.gruppe_id}
              onChange={(e) => updateRow(index, { gruppe_id: Number(e.target.value) })}
              className="min-w-0 flex-1"
            >
              {gruppen.map((gruppe) => (
                <option key={gruppe.id} value={gruppe.id}>
                  {gruppe.name}
                </option>
              ))}
            </Select>
            <IconButton label="Zeile entfernen" tone="danger" onClick={() => removeRow(index)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
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
  const [geladen, setGeladen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOffen, setModalOffen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [gruppenAnforderungen, setGruppenAnforderungen] = useState<GruppenAnforderung[]>([])
  const [zeigeLabel, setZeigeLabel] = useState(false)
  const { showToast } = useToast()

  const reload = useCallback(() => {
    dienstTypenListe(pfarreiId).then((liste) => {
      setDienstTypen(liste)
      setGeladen(true)
    })
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  function oeffnenNeu() {
    setEditId(null)
    setName('')
    setStandardAnzahl(1)
    setGruppenAnforderungen([])
    setZeigeLabel(true)
    setError(null)
    setModalOffen(true)
  }

  function oeffnenBearbeiten(dienstTyp: DienstTyp) {
    setEditId(dienstTyp.id)
    setName(dienstTyp.name)
    setStandardAnzahl(dienstTyp.standard_anzahl)
    setGruppenAnforderungen(
      dienstTyp.gruppen_anforderungen.map((a) => ({
        gruppe_id: a.gruppe.id,
        mindest_anzahl: a.mindest_anzahl,
      })),
    )
    setZeigeLabel(dienstTyp.zeige_label)
    setError(null)
    setModalOffen(true)
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: DienstTypEingabe = {
      name,
      standard_anzahl: standardAnzahl,
      gruppen_anforderungen: gruppenAnforderungen,
      zeige_label: zeigeLabel,
    }
    try {
      if (editId === null) {
        await dienstTypErstellen(pfarreiId, daten)
        showToast('Dienst-Typ angelegt')
      } else {
        await dienstTypBearbeiten(pfarreiId, editId, daten)
        showToast('Dienst-Typ gespeichert')
      }
      setModalOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Dienst-Typs'))
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
    <Card>
      <CardHeader
        title="Dienst-Typen"
        description="Arten von Diensten mit üblicher Besetzung."
        action={<NeuButton label="Dienst-Typ" onClick={oeffnenNeu} />}
      />
      {error && !modalOffen && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : dienstTypen.length === 0 ? (
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
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Bearbeiten" onClick={() => oeffnenBearbeiten(dienstTyp)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <InlineConfirmButton onConfirm={() => handleDelete(dienstTyp.id)} />
              </div>
            </Row>
          ))}
        </div>
      )}
      <Modal
        open={modalOffen}
        onClose={() => setModalOffen(false)}
        title={editId === null ? 'Dienst-Typ anlegen' : 'Dienst-Typ bearbeiten'}
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="dienst-typ-name">Name</Label>
            <Input
              id="dienst-typ-name"
              placeholder="z. B. Messdiener"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <div className="mt-2">
              <CheckboxChip
                id="dienst-typ-zeige-label"
                checked={zeigeLabel}
                onChange={() => setZeigeLabel((wert) => !wert)}
                title="Ist dies aus, erscheint auf dem Plan nur die Anzahl/Einschränkung, nicht der Name."
              >
                Name auf dem Plan zeigen
              </CheckboxChip>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Bewusst kein `Label` hier: das trägt für die übliche Stapelung (Label über Feld) ein
                `mb-1.5`, das in dieser einzeiligen Anordnung Label und Feld vertikal gegeneinander
                verschieben würde. */}
            <label
              htmlFor="dienst-typ-anzahl"
              className="shrink-0 text-sm font-medium text-ink-soft"
            >
              Übliche Besetzung
            </label>
            <Input
              id="dienst-typ-anzahl"
              type="number"
              min={0}
              value={standardAnzahl}
              onChange={(e) => setStandardAnzahl(Number(e.target.value))}
              required
              className="!w-16"
            />
            <span className="text-xs text-ink-faint">Minis pro Termin</span>
          </div>
          <GruppenAnforderungenEditor
            gruppen={gruppen}
            anforderungen={gruppenAnforderungen}
            maxAnzahl={standardAnzahl}
            onChange={setGruppenAnforderungen}
            idPrefix="dienst-typ"
          />
          <ModalAktionen
            onCancel={() => setModalOffen(false)}
            submitLabel={editId === null ? 'Anlegen' : 'Speichern'}
          />
        </form>
      </Modal>
    </Card>
  )
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const STUNDEN_RASTER = Array.from({ length: 24 }, (_, i) => i)
const SPERRZEIT_ZEILENHOEHE = 16

function zeitZuMinuten(zeit: string): number {
  const [stunde, minute] = zeit.split(':').map(Number)
  return stunde * 60 + minute
}

function kurzeZeit(zeit: string): string {
  const hhmm = zeit.slice(0, 5)
  return hhmm.endsWith(':00') ? hhmm.slice(0, -3) : hhmm
}

// Eigene Spalte mit Stunden-Beschriftung, links und rechts vom Wochenraster verwendet - der
// leere Kopf oben sorgt dafür, dass die Stunden trotz der Wochentags-Kopfzeile im Raster mit den
// tatsächlichen Uhrzeiten fluchten.
function StundenSpalte({ align }: { align: 'right' | 'left' }) {
  return (
    <div className="w-8 shrink-0">
      <div className="py-1 text-center text-[10px] leading-none">&nbsp;</div>
      {STUNDEN_RASTER.filter((s) => s % 3 === 0).map((s) => (
        <div
          key={s}
          style={{ height: SPERRZEIT_ZEILENHOEHE * 3 }}
          className={`text-[10px] leading-none text-ink-faint ${align === 'right' ? 'text-left' : 'text-right'}`}
        >
          {String(s).padStart(2, '0')}
        </div>
      ))}
    </div>
  )
}

// Wochenraster (7 Tage × 24 Stunden) statt einer reinen Liste: Sperrzeiten lassen sich per Ziehen
// direkt anlegen (auf volle Stunden geklippt) und per Klick auf ein bestehendes Zeitfenster
// bearbeiten - das `NeuerBlockerForm` bleibt als Text-Alternative für minutengenaue Eingaben
// erreichbar, ersetzt aber nicht mehr die Hauptansicht.
function WochenSperrzeiten({
  filtertagId,
  blocker,
  onCreate,
  onUpdate,
  onDelete,
}: {
  filtertagId: number
  blocker: FiltertagBlocker[]
  onCreate: (daten: FiltertagBlockerEingabe) => void
  onUpdate: (blockerId: number, daten: FiltertagBlockerEingabe) => void
  onDelete: (blockerId: number) => void
}) {
  const [drag, setDrag] = useState<{
    wochentag: number
    startStunde: number
    endStunde: number
  } | null>(null)
  const [bearbeiten, setBearbeiten] = useState<FiltertagBlocker | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnde, setEditEnde] = useState('')
  const editAnchorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  useEffect(() => {
    if (!drag) return
    function beenden() {
      const aktuell = dragRef.current
      if (!aktuell) return
      const von = Math.min(aktuell.startStunde, aktuell.endStunde)
      const bis = Math.max(aktuell.startStunde, aktuell.endStunde) + 1
      onCreate({
        filtertag_id: filtertagId,
        wochentag: aktuell.wochentag,
        start_zeit: `${String(von).padStart(2, '0')}:00:00`,
        end_zeit: `${String(bis).padStart(2, '0')}:00:00`,
      })
      setDrag(null)
    }
    window.addEventListener('mouseup', beenden)
    return () => window.removeEventListener('mouseup', beenden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  function oeffnenBearbeiten(b: FiltertagBlocker, anker: HTMLDivElement) {
    editAnchorRef.current = anker
    setBearbeiten(b)
    setEditStart(b.start_zeit.slice(0, 5))
    setEditEnde(b.end_zeit.slice(0, 5))
  }

  function speichernBearbeiten(event: SubmitEvent) {
    event.preventDefault()
    if (!bearbeiten) return
    onUpdate(bearbeiten.id, {
      filtertag_id: filtertagId,
      wochentag: bearbeiten.wochentag,
      start_zeit: `${editStart}:00`,
      end_zeit: `${editEnde}:00`,
    })
    setBearbeiten(null)
  }

  return (
    <div className="px-5 py-3">
      <p className="mb-2 text-xs text-ink-faint">
        Ziehen für eine neue Sperrzeit (auf volle Stunden geklippt) · Klick auf ein bestehendes
        Zeitfenster zum Bearbeiten.
      </p>
      <div className="flex select-none">
        <StundenSpalte align="left" />
        <div className="mx-1 grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-md bg-line">
          {WOCHENTAGE.map((label, wochentag) => {
            const tagesBlocker = blocker.filter((b) => b.wochentag === wochentag)
            return (
              <div key={label} className="bg-paper">
                <p className="py-1 text-center text-[10px] font-medium text-ink-faint">
                  {label.slice(0, 2)}
                </p>
                <div
                  className="relative"
                  style={{ height: SPERRZEIT_ZEILENHOEHE * 24 }}
                  onMouseLeave={() => {
                    if (drag?.wochentag === wochentag) setDrag(null)
                  }}
                >
                  {STUNDEN_RASTER.map((stunde) => {
                    const inDrag =
                      drag &&
                      drag.wochentag === wochentag &&
                      stunde >= Math.min(drag.startStunde, drag.endStunde) &&
                      stunde <= Math.max(drag.startStunde, drag.endStunde)
                    return (
                      <div
                        key={stunde}
                        onMouseDown={() =>
                          setDrag({ wochentag, startStunde: stunde, endStunde: stunde })
                        }
                        onMouseEnter={() =>
                          setDrag((aktuell) =>
                            aktuell && aktuell.wochentag === wochentag
                              ? { ...aktuell, endStunde: stunde }
                              : aktuell,
                          )
                        }
                        style={{ height: SPERRZEIT_ZEILENHOEHE }}
                        className={`cursor-pointer border-t border-line/50 first:border-t-0 ${
                          inDrag ? 'bg-pine/25' : 'hover:bg-pine-tint'
                        }`}
                      />
                    )
                  })}
                  {tagesBlocker.map((b) => {
                    const startMin = zeitZuMinuten(b.start_zeit)
                    const endMin = zeitZuMinuten(b.end_zeit)
                    return (
                      <div
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => oeffnenBearbeiten(b, e.currentTarget)}
                        title={`${b.start_zeit.slice(0, 5)}–${b.end_zeit.slice(0, 5)} Uhr (bearbeiten)`}
                        style={{
                          top: (startMin / 60) * SPERRZEIT_ZEILENHOEHE,
                          height: Math.max(((endMin - startMin) / 60) * SPERRZEIT_ZEILENHOEHE, 4),
                        }}
                        className="absolute inset-x-0.5 flex cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-wine/50 bg-wine-tint/80 transition-colors hover:bg-wine-tint"
                      >
                        <span className="truncate px-0.5 text-[8px] leading-none whitespace-nowrap text-wine-dark">
                          {kurzeZeit(b.start_zeit)}–{kurzeZeit(b.end_zeit)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <StundenSpalte align="right" />
      </div>
      <Popover
        open={bearbeiten !== null}
        onClose={() => setBearbeiten(null)}
        anchorRef={editAnchorRef}
        title={bearbeiten ? `Sperrzeit · ${WOCHENTAGE[bearbeiten.wochentag]}` : undefined}
      >
        {bearbeiten && (
          <form onSubmit={speichernBearbeiten} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div>
                <Label htmlFor="sperrzeit-edit-start">Startzeit</Label>
                <Input
                  id="sperrzeit-edit-start"
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="sperrzeit-edit-ende">Endzeit</Label>
                <Input
                  id="sperrzeit-edit-ende"
                  type="time"
                  value={editEnde}
                  onChange={(e) => setEditEnde(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <InlineConfirmButton
                label="Löschen"
                size="sm"
                onConfirm={() => {
                  onDelete(bearbeiten.id)
                  setBearbeiten(null)
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBearbeiten(null)}
                >
                  Abbrechen
                </Button>
                <Button type="submit" size="sm">
                  Speichern
                </Button>
              </div>
            </div>
          </form>
        )}
      </Popover>
    </div>
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

// Bezeichnung + "folgt Schulferien-Regeln"-Checkbox, gemeinsam für Inline-Bearbeiten und
// Popover-Anlegen verwendet.
function FiltertagFormFelder({
  idPrefix,
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  idPrefix: string
  initial: FiltertagEingabe
  onSave: (daten: FiltertagEingabe) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [label, setLabel] = useState(initial.label)
  const [istSchuelerArtig, setIstSchuelerArtig] = useState(initial.ist_schueler_artig)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ label, ist_schueler_artig: istSchuelerArtig })
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <Label htmlFor={`${idPrefix}-label`}>Bezeichnung</Label>
        <Input
          id={`${idPrefix}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="z. B. Azubi"
          autoFocus
          required
        />
      </div>
      <CheckboxChip
        id={`${idPrefix}-schueler-artig`}
        checked={istSchuelerArtig}
        onChange={() => setIstSchuelerArtig((wert) => !wert)}
        title="Ferien und schulfreie Feiertage gelten für diesen Status als frei."
      >
        folgt Schulferien-Regeln
      </CheckboxChip>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={!label.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function FiltertagsSection({
  pfarreiId,
  filtertags,
  geladen,
  reload,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  geladen: boolean
  reload: () => void
}) {
  const [blocker, setBlocker] = useState<FiltertagBlocker[]>([])
  const [offeneSperrzeiten, setOffeneSperrzeiten] = useState<Set<number>>(new Set())
  const [offenesTextForm, setOffenesTextForm] = useState<Set<number>>(new Set())
  const [neuOffen, setNeuOffen] = useState(false)
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const neuButtonRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()

  const reloadBlocker = useCallback(() => {
    filtertagBlockerListe(pfarreiId).then(setBlocker)
  }, [pfarreiId])

  useEffect(() => {
    reloadBlocker()
  }, [reloadBlocker])

  async function handleErstellen(daten: FiltertagEingabe) {
    setError(null)
    try {
      await filtertagErstellen(pfarreiId, daten)
      showToast('Verfügbarkeits-Status angelegt')
      setNeuOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Verfügbarkeits-Status'))
    }
  }

  async function handleBearbeiten(filtertagId: number, daten: FiltertagEingabe) {
    setError(null)
    try {
      await filtertagBearbeiten(pfarreiId, filtertagId, daten)
      showToast('Verfügbarkeits-Status gespeichert')
      setBearbeitenId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Verfügbarkeits-Status'))
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

  async function handleBlockerUpdate(blockerId: number, daten: FiltertagBlockerEingabe) {
    setError(null)
    try {
      await filtertagBlockerBearbeiten(pfarreiId, blockerId, daten)
      showToast('Zeitfenster gespeichert')
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Zeitfensters'))
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

  function toggleSperrzeiten(filtertagId: number) {
    setOffeneSperrzeiten((offen) => {
      const neu = new Set(offen)
      if (neu.has(filtertagId)) {
        neu.delete(filtertagId)
      } else {
        neu.add(filtertagId)
      }
      return neu
    })
  }

  function toggleTextForm(filtertagId: number) {
    setOffenesTextForm((offen) => {
      const neu = new Set(offen)
      if (neu.has(filtertagId)) {
        neu.delete(filtertagId)
      } else {
        neu.add(filtertagId)
      }
      return neu
    })
  }

  return (
    <Card>
      <CardHeader
        title="Verfügbarkeits-Status"
        description="Wöchentliche Sperrzeiten je Status, z. B. Schulzeiten für „Schüler“."
        action={<NeuButton ref={neuButtonRef} label="Status" onClick={() => setNeuOffen(true)} />}
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Verfügbarkeits-Status anlegen"
      >
        <FiltertagFormFelder
          idPrefix="filtertag-neu"
          initial={{ label: '', ist_schueler_artig: false }}
          onSave={handleErstellen}
          onCancel={() => setNeuOffen(false)}
          submitLabel="Anlegen"
        />
      </Popover>
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : filtertags.length === 0 ? (
        <EmptyState icon={Clock} title="Noch keine Verfügbarkeits-Status angelegt" />
      ) : (
        <div>
          {filtertags.map((filtertag) => (
            <div key={filtertag.id} className="border-b border-line last:border-b-0">
              {bearbeitenId === filtertag.id ? (
                <div className="px-5 py-3">
                  <FiltertagFormFelder
                    idPrefix={`filtertag-${filtertag.id}`}
                    initial={{
                      label: filtertag.label,
                      ist_schueler_artig: filtertag.ist_schueler_artig,
                    }}
                    onSave={(daten) => handleBearbeiten(filtertag.id, daten)}
                    onCancel={() => setBearbeitenId(null)}
                    submitLabel="Speichern"
                  />
                </div>
              ) : (
                <Row>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSperrzeiten(filtertag.id)}
                      className="inline-flex cursor-pointer items-center rounded-md p-1 text-ink-soft transition-colors hover:bg-pine-tint hover:text-pine-dark"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${
                          offeneSperrzeiten.has(filtertag.id) ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-ink">{filtertag.label}</span>
                    {filtertag.ist_schueler_artig && (
                      <Badge tone="gold">folgt Schulferien-Regeln</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSperrzeiten(filtertag.id)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft transition-colors hover:bg-pine-tint hover:text-pine-dark"
                    >
                      <span className="rounded-full bg-pine-tint px-1.5 text-[10px] text-pine-dark">
                        {blocker.filter((b) => b.filtertag_id === filtertag.id).length}
                      </span>
                      Sperrzeiten
                    </button>
                    <IconButton label="Bearbeiten" onClick={() => setBearbeitenId(filtertag.id)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <InlineConfirmButton onConfirm={() => handleDelete(filtertag.id)} />
                  </div>
                </Row>
              )}
              {offeneSperrzeiten.has(filtertag.id) && (
                <div className="bg-pine-tint/20">
                  <WochenSperrzeiten
                    filtertagId={filtertag.id}
                    blocker={blocker.filter((b) => b.filtertag_id === filtertag.id)}
                    onCreate={handleBlockerCreate}
                    onUpdate={handleBlockerUpdate}
                    onDelete={handleBlockerDelete}
                  />
                  <div className="border-t border-line/60 px-5 py-2">
                    <button
                      type="button"
                      onClick={() => toggleTextForm(filtertag.id)}
                      className="text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-pine-dark"
                    >
                      {offenesTextForm.has(filtertag.id)
                        ? 'Text-Formular ausblenden'
                        : 'Stattdessen per Text-Formular hinzufügen'}
                    </button>
                  </div>
                  {offenesTextForm.has(filtertag.id) && (
                    <NeuerBlockerForm filtertagId={filtertag.id} onCreate={handleBlockerCreate} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  const [auswahl, setAuswahl] = useState<Bundesland>('BY')
  const [ferien, setFerien] = useState<Ferienzeitraum[]>([])
  const [geladen, setGeladen] = useState(false)
  const [speichertGerade, setSpeichertGerade] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    pfarreiDetail(pfarreiId).then((info) => setAuswahl(info.bundesland))
    ferienListe(pfarreiId).then((liste) => {
      setFerien(liste)
      setGeladen(true)
    })
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleSpeichern() {
    setError(null)
    setGespeichert(false)
    setSpeichertGerade(true)
    try {
      // Setzt das Bundesland der gesamten Pfarrei (gilt für alle Ministranten/Dienstpläne) und
      // stößt serverseitig bereits einen Ferien-Sync an - explizit erneut abrufen statt nur der
      // Server-Antwort zu vertrauen, damit auch bei einem Ferien-Sync-Fehler klares Feedback kommt
      // (statt eines still veralteten Kalenders) und die Liste hier sicher aktuell ist.
      await bundeslandSetzen(pfarreiId, auswahl)
      const neueFerien = await ferienAktualisieren(pfarreiId)
      setFerien(neueFerien)
      setGespeichert(true)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Bundeslands'))
    } finally {
      setSpeichertGerade(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Ferien" description="Automatisch abgerufen für das gewählte Bundesland." />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4 border-b border-line p-5">
        <div>
          <Label htmlFor="ferien-bundesland" hint="gilt für die ganze Pfarrei">
            Bundesland
          </Label>
          <Select
            id="ferien-bundesland"
            value={auswahl}
            onChange={(e) => {
              setAuswahl(e.target.value as Bundesland)
              setGespeichert(false)
            }}
          >
            {BUNDESLAENDER.map((code) => (
              <option key={code} value={code}>
                {BUNDESLAND_NAMEN[code]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" onClick={handleSpeichern} disabled={speichertGerade}>
          <RefreshCw className="h-4 w-4" />
          {speichertGerade ? 'Speichert…' : 'Speichern'}
        </Button>
        {gespeichert && (
          <span className="text-sm text-ink-soft">Gespeichert, Ferienkalender aktualisiert.</span>
        )}
      </div>
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : ferien.length === 0 ? (
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
  const [geladen, setGeladen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Umschaltbar, weil z. B. im Dezember bereits der Januar des Folgejahres geplant wird.
  const [jahr, setJahr] = useState(() => new Date().getFullYear())

  const reload = useCallback(() => {
    feiertageListe(pfarreiId, jahr).then((liste) => {
      setFeiertage(liste)
      setGeladen(true)
    })
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
    <Card>
      <CardHeader
        title="Gesetzliche Feiertage"
        description="Mit Unterscheidung ob schulfrei und/oder arbeitsfrei."
        action={
          <div className="flex items-center gap-1">
            <IconButton label="Vorheriges Jahr" onClick={() => setJahr((j) => j - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <span className="w-12 text-center text-sm font-medium tabular-nums text-ink">
              {jahr}
            </span>
            <IconButton label="Nächstes Jahr" onClick={() => setJahr((j) => j + 1)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        }
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={4} />
      ) : feiertage.length === 0 ? (
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
  filtertagsGeladen,
  reloadFiltertags,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  filtertagsGeladen: boolean
  reloadFiltertags: () => void
}) {
  const [subTab, setSubTab] = useState<VerfuegbarkeitTabKey>('status')

  return (
    <div className="flex flex-col gap-4">
      <TabBar tabs={VERFUEGBARKEIT_TABS} active={subTab} onChange={setSubTab} variant="pills" />
      {subTab === 'status' && (
        <FiltertagsSection
          pfarreiId={pfarreiId}
          filtertags={filtertags}
          geladen={filtertagsGeladen}
          reload={reloadFiltertags}
        />
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
  const [gruppenGeladen, setGruppenGeladen] = useState(false)
  const [filtertags, setFiltertags] = useState<FiltertagDef[]>([])
  const [filtertagsGeladen, setFiltertagsGeladen] = useState(false)
  const [tab, setTab] = useState<TabKey>('gruppen')

  const reloadGruppen = useCallback(() => {
    gruppenListe(id).then((liste) => {
      setGruppen(liste)
      setGruppenGeladen(true)
    })
  }, [id])

  const reloadFiltertags = useCallback(() => {
    filtertagsListe(id).then((liste) => {
      setFiltertags(liste)
      setFiltertagsGeladen(true)
    })
  }, [id])

  useEffect(() => {
    reloadGruppen()
  }, [reloadGruppen])

  useEffect(() => {
    reloadFiltertags()
  }, [reloadFiltertags])

  return (
    <AppShell pfarreiId={id}>
      <h1 className="font-display text-3xl font-semibold text-ink">Stammdaten</h1>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mt-6" />

      <div className="mt-6">
        {tab === 'gruppen' && (
          <GruppenSection
            pfarreiId={id}
            gruppen={gruppen}
            geladen={gruppenGeladen}
            reload={reloadGruppen}
          />
        )}
        {tab === 'minis' && (
          <MinisSection pfarreiId={id} gruppen={gruppen} filtertags={filtertags} />
        )}
        {tab === 'dienst-typen' && <DienstTypenSection pfarreiId={id} gruppen={gruppen} />}
        {tab === 'verfuegbarkeit' && (
          <VerfuegbarkeitSection
            pfarreiId={id}
            filtertags={filtertags}
            filtertagsGeladen={filtertagsGeladen}
            reloadFiltertags={reloadFiltertags}
          />
        )}
      </div>
    </AppShell>
  )
}
