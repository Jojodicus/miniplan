import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { GruppenAnforderung } from '../api/dienstTypen'
import { dienstTypenListe, type DienstTyp } from '../api/dienstTypen'
import { filtertagsListe, type Filtertag as FiltertagDef } from '../api/filtertags'
import {
  gottesdienstBearbeiten,
  gottesdienstErstellen,
  gottesdienstLoeschen,
  type Dienstbedarf,
  type DienstbedarfEingabe,
  type Gottesdienst,
} from '../api/gottesdienste'
import { gruppenListe, type Gruppe } from '../api/gruppen'
import { minisListe, type Filtertag, type Mini } from '../api/minis'
import {
  gottesdienstOutZuVorschau,
  miniplanAktualisieren,
  miniplanDetail,
  miniplanVorschau,
  type Miniplan,
  type MiniplanVorschauEingabe,
  type VorschauDienstbedarf,
  type VorschauGottesdienst,
} from '../api/miniplaene'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { DateInput } from '../components/ui/DateInput'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { MarkdownTextarea } from '../components/ui/MarkdownTextarea'
import { PdfViewer } from '../components/ui/PdfViewer'
import { TimeInput } from '../components/ui/TimeInput'
import { useToast } from '../components/ui/Toast'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function formatDatumKurz(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

let naechsterSchluessel = 0
function neuerSchluessel(): string {
  naechsterSchluessel += 1
  return `neu-${naechsterSchluessel}`
}

type SpeicherStatus = 'gespeichert' | 'speichert' | 'ungespeichert' | 'fehler'

function StatusAnzeige({ status }: { status: SpeicherStatus }) {
  const text: Record<SpeicherStatus, string> = {
    gespeichert: 'Gespeichert',
    speichert: 'Speichert…',
    ungespeichert: 'Änderungen unvollständig',
    fehler: 'Fehler beim Speichern',
  }
  const farbe: Record<SpeicherStatus, string> = {
    gespeichert: 'text-ink-faint',
    speichert: 'text-pine-dark',
    ungespeichert: 'text-ink-faint',
    fehler: 'text-wine',
  }
  return <span className={`text-xs ${farbe[status]}`}>{text[status]}</span>
}

interface WorkingBedarf {
  schluessel: string
  dienst_typ_id: number | null
  dienst_typ_name: string | null
  name: string | null
  anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderung[]
  mini_ids: number[]
  zeige_label: boolean
}

function bedarfAusOut(bedarf: Dienstbedarf): WorkingBedarf {
  return {
    schluessel: `bestehend-${bedarf.id}`,
    dienst_typ_id: bedarf.dienst_typ?.id ?? null,
    dienst_typ_name: bedarf.dienst_typ?.name ?? null,
    name: bedarf.name,
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a) => ({
      gruppe_id: a.gruppe.id,
      mindest_anzahl: a.mindest_anzahl,
    })),
    mini_ids: bedarf.zugewiesene_minis.map((m) => m.id),
    zeige_label: bedarf.zeige_label,
  }
}

function bedarfAusDienstTyp(dienstTyp: DienstTyp): WorkingBedarf {
  return {
    schluessel: neuerSchluessel(),
    dienst_typ_id: dienstTyp.id,
    dienst_typ_name: dienstTyp.name,
    name: null,
    anzahl: dienstTyp.standard_anzahl,
    erforderliche_filtertags: dienstTyp.erforderliche_filtertags,
    gruppen_anforderungen: dienstTyp.gruppen_anforderungen.map((a) => ({
      gruppe_id: a.gruppe.id,
      mindest_anzahl: a.mindest_anzahl,
    })),
    mini_ids: [],
    zeige_label: dienstTyp.zeige_label,
  }
}

function bedarfFreitext(): WorkingBedarf {
  return {
    schluessel: neuerSchluessel(),
    dienst_typ_id: null,
    dienst_typ_name: null,
    name: '',
    anzahl: 1,
    erforderliche_filtertags: [],
    gruppen_anforderungen: [],
    mini_ids: [],
    zeige_label: true,
  }
}

function zuEingabe(bedarf: WorkingBedarf): DienstbedarfEingabe {
  return {
    dienst_typ_id: bedarf.dienst_typ_id,
    name: bedarf.dienst_typ_id === null ? bedarf.name : null,
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen,
    mini_ids: bedarf.mini_ids,
    zeige_label: bedarf.zeige_label,
  }
}

function bedarfZuVorschau(
  bedarf: WorkingBedarf,
  gruppen: Gruppe[],
  minis: Mini[],
): VorschauDienstbedarf {
  return {
    name: bedarf.dienst_typ_name ?? bedarf.name ?? '',
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a) => ({
      gruppe_name: gruppen.find((g) => g.id === a.gruppe_id)?.name ?? '',
      mindest_anzahl: a.mindest_anzahl,
    })),
    zugewiesene_minis: bedarf.mini_ids
      .map((id) => minis.find((m) => m.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
    zeige_label: bedarf.zeige_label,
  }
}

interface GottesdienstDraft {
  datum: string
  uhrzeit: string
  name: string
  notiz: string
  bedarfListe: WorkingBedarf[]
}

function draftZuVorschau(
  draft: GottesdienstDraft,
  gruppen: Gruppe[],
  minis: Mini[],
): VorschauGottesdienst {
  return {
    datum: draft.datum,
    uhrzeit: draft.uhrzeit ? `${draft.uhrzeit}:00` : '',
    name: draft.name,
    notiz: draft.notiz.trim() ? draft.notiz : null,
    dienstbedarf: draft.bedarfListe.map((b) => bedarfZuVorschau(b, gruppen, minis)),
  }
}

function DienstbedarfZeile({
  bedarf,
  gruppen,
  minis,
  filtertags,
  zeigeFehler,
  onChange,
  onRemove,
}: {
  bedarf: WorkingBedarf
  gruppen: Gruppe[]
  minis: Mini[]
  filtertags: FiltertagDef[]
  zeigeFehler: boolean
  onChange: (patch: Partial<WorkingBedarf>) => void
  onRemove: () => void
}) {
  const [erweitertOffen, setErweitertOffen] = useState(false)

  function addGruppenAnforderung() {
    const belegteIds = new Set(bedarf.gruppen_anforderungen.map((a) => a.gruppe_id))
    const naechsteGruppe = gruppen.find((g) => !belegteIds.has(g.id))
    if (!naechsteGruppe) return
    onChange({
      gruppen_anforderungen: [
        ...bedarf.gruppen_anforderungen,
        { gruppe_id: naechsteGruppe.id, mindest_anzahl: 1 },
      ],
    })
  }

  function updateGruppenAnforderung(index: number, patch: Partial<GruppenAnforderung>) {
    onChange({
      gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a, i) =>
        i === index ? { ...a, ...patch } : a,
      ),
    })
  }

  function removeGruppenAnforderung(index: number) {
    onChange({
      gruppen_anforderungen: bedarf.gruppen_anforderungen.filter((_, i) => i !== index),
    })
  }

  function toggleFiltertag(tag: Filtertag) {
    onChange({
      erforderliche_filtertags: bedarf.erforderliche_filtertags.includes(tag)
        ? bedarf.erforderliche_filtertags.filter((t) => t !== tag)
        : [...bedarf.erforderliche_filtertags, tag],
    })
  }

  function toggleMini(miniId: number) {
    onChange({
      mini_ids: bedarf.mini_ids.includes(miniId)
        ? bedarf.mini_ids.filter((id) => id !== miniId)
        : [...bedarf.mini_ids, miniId],
    })
  }

  const anzahlEinschraenkungen =
    bedarf.erforderliche_filtertags.length +
    bedarf.gruppen_anforderungen.length +
    bedarf.mini_ids.length

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {bedarf.dienst_typ_id !== null ? (
            <span className="text-sm font-medium text-ink">{bedarf.dienst_typ_name}</span>
          ) : (
            <Input
              aria-label="Name des Dienstes"
              placeholder="z. B. Alle Ministranten"
              value={bedarf.name ?? ''}
              onChange={(e) => onChange({ name: e.target.value })}
              required
              className="max-w-xs"
              error={
                zeigeFehler && !(bedarf.name ?? '').trim()
                  ? 'Name darf nicht leer sein'
                  : undefined
              }
            />
          )}
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`${bedarf.schluessel}-anzahl`}>Anzahl</Label>
            <Input
              id={`${bedarf.schluessel}-anzahl`}
              type="number"
              min={0}
              value={bedarf.anzahl}
              onChange={(e) => onChange({ anzahl: Number(e.target.value) })}
              className="h-8 w-20"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setErweitertOffen((wert) => !wert)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft transition-colors hover:bg-pine-tint hover:text-pine-dark"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${erweitertOffen ? 'rotate-180' : ''}`}
            />
            Details
            {!erweitertOffen && anzahlEinschraenkungen > 0 && (
              <span className="rounded-full bg-pine-tint px-1.5 text-[10px] text-pine-dark">
                {anzahlEinschraenkungen}
              </span>
            )}
          </button>
          <InlineConfirmButton onConfirm={onRemove} label="Dienst entfernen" size="sm" />
        </div>
      </div>

      {erweitertOffen && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <CheckboxChip
            id={`${bedarf.schluessel}-zeige-label`}
            checked={bedarf.zeige_label}
            onChange={() => onChange({ zeige_label: !bedarf.zeige_label })}
          >
            Auf dem Plan anzeigen
          </CheckboxChip>

          <div>
            <Label>Verfügbarkeits-Status</Label>
            <div className="flex flex-wrap gap-2">
              {filtertags.map((filtertag) => (
                <CheckboxChip
                  key={filtertag.key}
                  id={`${bedarf.schluessel}-${filtertag.key}`}
                  checked={bedarf.erforderliche_filtertags.includes(filtertag.key)}
                  onChange={() => toggleFiltertag(filtertag.key)}
                >
                  {filtertag.label}
                </CheckboxChip>
              ))}
            </div>
          </div>

          <div>
            <Label hint="z. B. mind. 1 aus Gruppe Obermini">Gruppen-Mindestanzahl</Label>
            <div className="flex flex-col gap-2">
              {bedarf.gruppen_anforderungen.map((anforderung, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    value={anforderung.gruppe_id}
                    onChange={(e) =>
                      updateGruppenAnforderung(index, { gruppe_id: Number(e.target.value) })
                    }
                    className="flex-1"
                  >
                    {gruppen.map((gruppe) => (
                      <option key={gruppe.id} value={gruppe.id}>
                        {gruppe.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={anforderung.mindest_anzahl}
                    onChange={(e) =>
                      updateGruppenAnforderung(index, { mindest_anzahl: Number(e.target.value) })
                    }
                    className="w-24"
                  />
                  <IconButton
                    label="Zeile entfernen"
                    tone="danger"
                    onClick={() => removeGruppenAnforderung(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 self-start"
              onClick={addGruppenAnforderung}
              disabled={bedarf.gruppen_anforderungen.length >= gruppen.length}
            >
              <Plus className="h-4 w-4" />
              Zeile hinzufügen
            </Button>
          </div>

          <div>
            <Label>Manuell zugewiesene Minis</Label>
            <div className="flex flex-wrap gap-2">
              {minis.map((mini) => (
                <CheckboxChip
                  key={mini.id}
                  id={`${bedarf.schluessel}-mini-${mini.id}`}
                  checked={bedarf.mini_ids.includes(mini.id)}
                  onChange={() => toggleMini(mini.id)}
                >
                  {mini.name}
                </CheckboxChip>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const AUTOSAVE_DEBOUNCE_MS = 800

function GottesdienstKarte({
  gottesdienst,
  pfarreiId,
  miniplanId,
  jahr,
  gruppen,
  minis,
  dienstTypen,
  filtertags,
  onReload,
  onDraftChange,
}: {
  gottesdienst: Gottesdienst
  pfarreiId: number
  miniplanId: number
  jahr: number
  gruppen: Gruppe[]
  minis: Mini[]
  dienstTypen: DienstTyp[]
  filtertags: FiltertagDef[]
  onReload: () => void
  onDraftChange: (gottesdienstId: number, draft: GottesdienstDraft) => void
}) {
  const [datum, setDatum] = useState(gottesdienst.datum)
  const [uhrzeit, setUhrzeit] = useState(gottesdienst.uhrzeit.slice(0, 5))
  const [name, setName] = useState(gottesdienst.name)
  const [notiz, setNotiz] = useState(gottesdienst.notiz ?? '')
  const [bedarfListe, setBedarfListe] = useState<WorkingBedarf[]>(
    gottesdienst.dienstbedarf.map(bedarfAusOut),
  )
  const [neuerDienstTypId, setNeuerDienstTypId] = useState<number | ''>('')
  const [status, setStatus] = useState<SpeicherStatus>('gespeichert')
  const [versucht, setVersucht] = useState(false)
  const [offen, setOffen] = useState(false)
  const { showToast } = useToast()
  const istErstesRendern = useRef(true)

  function updateBedarf(schluessel: string, patch: Partial<WorkingBedarf>) {
    setBedarfListe((liste) =>
      liste.map((b) => (b.schluessel === schluessel ? { ...b, ...patch } : b)),
    )
  }

  function removeBedarf(schluessel: string) {
    setBedarfListe((liste) => liste.filter((b) => b.schluessel !== schluessel))
  }

  function addDienstTyp() {
    const dienstTyp = dienstTypen.find((dt) => dt.id === neuerDienstTypId)
    if (!dienstTyp) return
    setBedarfListe((liste) => [...liste, bedarfAusDienstTyp(dienstTyp)])
  }

  function addFreitext() {
    setBedarfListe((liste) => [...liste, bedarfFreitext()])
  }

  useEffect(() => {
    onDraftChange(gottesdienst.id, { datum, uhrzeit, name, notiz, bedarfListe })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, uhrzeit, name, notiz, bedarfListe])

  useEffect(() => {
    if (istErstesRendern.current) {
      istErstesRendern.current = false
      return
    }
    const bedarfOhneName = bedarfListe.some(
      (b) => b.dienst_typ_id === null && !(b.name ?? '').trim(),
    )
    if (!datum || !uhrzeit || bedarfOhneName) {
      setStatus('ungespeichert')
      return
    }
    setStatus('speichert')
    const timer = setTimeout(async () => {
      try {
        await gottesdienstBearbeiten(pfarreiId, miniplanId, gottesdienst.id, {
          datum,
          uhrzeit,
          name,
          notiz: notiz.trim() ? notiz : null,
          dienstbedarf: bedarfListe.map(zuEingabe),
        })
        setStatus('gespeichert')
        onReload()
      } catch (err) {
        setStatus('fehler')
        showToast(fehlerText(err, 'Fehler beim Speichern des Gottesdienstes'), 'error')
      }
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, uhrzeit, name, notiz, bedarfListe])

  async function handleDelete() {
    try {
      await gottesdienstLoeschen(pfarreiId, miniplanId, gottesdienst.id)
      showToast('Gottesdienst gelöscht')
      onReload()
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Löschen des Gottesdienstes'), 'error')
    }
  }

  return (
    <Card className="animate-rise">
      <button
        type="button"
        onClick={() => setOffen((wert) => !wert)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${offen ? 'rotate-180' : '-rotate-90'}`}
          />
          <div className="min-w-0">
            <span className="font-medium text-ink">{name || 'Ohne Namen'}</span>
            <span className="ml-2 text-sm text-ink-soft">
              {datum ? formatDatumKurz(datum) : 'kein Datum'}
              {uhrzeit && `, ${uhrzeit} Uhr`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="neutral">
            {bedarfListe.length} {bedarfListe.length === 1 ? 'Dienst' : 'Dienste'}
          </Badge>
          <StatusAnzeige status={status} />
        </div>
      </button>

      {offen && (
        <div className="flex flex-col gap-4 border-t border-line p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor={`gottesdienst-${gottesdienst.id}-datum`}>Datum</Label>
              <DateInput
                id={`gottesdienst-${gottesdienst.id}-datum`}
                pfarreiId={pfarreiId}
                jahr={jahr}
                value={datum}
                onChange={setDatum}
                required
                error={versucht && !datum ? 'Datum wird benötigt' : undefined}
              />
            </div>
            <div>
              <Label htmlFor={`gottesdienst-${gottesdienst.id}-uhrzeit`}>Uhrzeit</Label>
              <TimeInput
                id={`gottesdienst-${gottesdienst.id}-uhrzeit`}
                value={uhrzeit}
                onChange={setUhrzeit}
                required
                error={versucht && !uhrzeit ? 'Uhrzeit wird benötigt' : undefined}
              />
            </div>
            <div>
              <Label htmlFor={`gottesdienst-${gottesdienst.id}-name`}>Name</Label>
              <Input
                id={`gottesdienst-${gottesdienst.id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setVersucht(true)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor={`gottesdienst-${gottesdienst.id}-notiz`} hint="optional">
              Notiz
            </Label>
            <textarea
              id={`gottesdienst-${gottesdienst.id}-notiz`}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={2}
              placeholder="z. B. Bitte Kerzen mitbringen"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15"
            />
          </div>

          <div className="flex flex-col gap-3">
            {bedarfListe.map((bedarf) => (
              <DienstbedarfZeile
                key={bedarf.schluessel}
                bedarf={bedarf}
                gruppen={gruppen}
                minis={minis}
                filtertags={filtertags}
                zeigeFehler={versucht}
                onChange={(patch) => updateBedarf(bedarf.schluessel, patch)}
                onRemove={() => removeBedarf(bedarf.schluessel)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={`gottesdienst-${gottesdienst.id}-dienst-typ`}>
                Dienst-Typ hinzufügen
              </Label>
              <div className="flex gap-2">
                <Select
                  id={`gottesdienst-${gottesdienst.id}-dienst-typ`}
                  value={neuerDienstTypId}
                  onChange={(e) => setNeuerDienstTypId(Number(e.target.value))}
                  disabled={dienstTypen.length === 0}
                >
                  <option value="">Auswählen…</option>
                  {dienstTypen.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" onClick={addDienstTyp}>
                  Hinzufügen
                </Button>
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={addFreitext}>
              <Plus className="h-4 w-4" />
              Freitext-Dienst hinzufügen
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            <InlineConfirmButton
              onConfirm={handleDelete}
              label="Gottesdienst löschen"
              confirmLabel="Gottesdienst wirklich löschen?"
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function NeuerGottesdienstForm({
  pfarreiId,
  miniplanId,
  jahr,
  onCreated,
}: {
  pfarreiId: number
  miniplanId: number
  jahr: number
  onCreated: () => void
}) {
  const [datum, setDatum] = useState('')
  const [uhrzeit, setUhrzeit] = useState('')
  const [name, setName] = useState('')
  const [notiz, setNotiz] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [versucht, setVersucht] = useState(false)

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setVersucht(true)
    if (!datum || !uhrzeit) {
      return
    }
    setError(null)
    try {
      await gottesdienstErstellen(pfarreiId, miniplanId, {
        datum,
        uhrzeit,
        name,
        notiz: notiz.trim() ? notiz : null,
        dienstbedarf: [],
      })
      setDatum('')
      setUhrzeit('')
      setName('')
      setNotiz('')
      setVersucht(false)
      onCreated()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Gottesdienstes'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Neuer Gottesdienst" />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <form
        onSubmit={handleCreate}
        aria-label="Gottesdienst anlegen"
        className="flex flex-col gap-4 p-5"
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="neuer-gottesdienst-datum">Datum</Label>
            <DateInput
              id="neuer-gottesdienst-datum"
              pfarreiId={pfarreiId}
              jahr={jahr}
              value={datum}
              onChange={setDatum}
              required
              error={versucht && !datum ? 'Datum wird benötigt' : undefined}
            />
          </div>
          <div>
            <Label htmlFor="neuer-gottesdienst-uhrzeit">Uhrzeit</Label>
            <TimeInput
              id="neuer-gottesdienst-uhrzeit"
              value={uhrzeit}
              onChange={setUhrzeit}
              required
              error={versucht && !uhrzeit ? 'Uhrzeit wird benötigt' : undefined}
            />
          </div>
          <div>
            <Label htmlFor="neuer-gottesdienst-name">Name</Label>
            <Input
              id="neuer-gottesdienst-name"
              placeholder="z. B. Sonntagsmesse"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="self-end">
            <Plus className="h-4 w-4" />
            Gottesdienst anlegen
          </Button>
        </div>
        <div>
          <Label htmlFor="neuer-gottesdienst-notiz" hint="optional">
            Notiz
          </Label>
          <textarea
            id="neuer-gottesdienst-notiz"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={2}
            placeholder="z. B. Bitte Kerzen mitbringen"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15"
          />
        </div>
      </form>
    </Card>
  )
}

function FreitextSection({
  pfarreiId,
  miniplan,
  onSaved,
  onDraftChange,
}: {
  pfarreiId: number
  miniplan: Miniplan
  onSaved: (miniplan: Miniplan) => void
  onDraftChange: (veranstaltungen: string, ankuendigungen: string) => void
}) {
  const [veranstaltungen, setVeranstaltungen] = useState(miniplan.veranstaltungen ?? '')
  const [ankuendigungen, setAnkuendigungen] = useState(miniplan.ankuendigungen ?? '')
  const [status, setStatus] = useState<SpeicherStatus>('gespeichert')
  const { showToast } = useToast()
  const istErstesRendern = useRef(true)

  useEffect(() => {
    onDraftChange(veranstaltungen, ankuendigungen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veranstaltungen, ankuendigungen])

  useEffect(() => {
    if (istErstesRendern.current) {
      istErstesRendern.current = false
      return
    }
    setStatus('speichert')
    const timer = setTimeout(async () => {
      try {
        const aktualisiert = await miniplanAktualisieren(pfarreiId, miniplan.id, {
          veranstaltungen: veranstaltungen || null,
          ankuendigungen: ankuendigungen || null,
        })
        onSaved(aktualisiert)
        setStatus('gespeichert')
      } catch (err) {
        setStatus('fehler')
        showToast(fehlerText(err, 'Fehler beim Speichern der Freitextfelder'), 'error')
      }
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veranstaltungen, ankuendigungen])

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Veranstaltungen & Ankündigungen"
        description="Freitextfelder (Markdown: **fett**, *kursiv*, Aufzählungen), die unterhalb des Plans angezeigt werden."
        action={<StatusAnzeige status={status} />}
      />
      <div className="flex flex-col gap-4 p-5">
        <div>
          <Label htmlFor="miniplan-veranstaltungen">Veranstaltungen</Label>
          <MarkdownTextarea
            id="miniplan-veranstaltungen"
            value={veranstaltungen}
            onChange={setVeranstaltungen}
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="miniplan-ankuendigungen">Ankündigungen</Label>
          <MarkdownTextarea
            id="miniplan-ankuendigungen"
            value={ankuendigungen}
            onChange={setAnkuendigungen}
            rows={3}
          />
        </div>
      </div>
    </Card>
  )
}

function VorschauPanel({
  pfarreiId,
  miniplanId,
  eingabe,
}: {
  pfarreiId: number
  miniplanId: number
  eingabe: MiniplanVorschauEingabe
}) {
  const [pdfDaten, setPdfDaten] = useState<Uint8Array | null>(null)
  const [fehler, setFehler] = useState<string[] | null>(null)
  const [ladend, setLadend] = useState(false)

  useEffect(() => {
    let abgebrochen = false
    setLadend(true)
    const timer = setTimeout(() => {
      miniplanVorschau(pfarreiId, miniplanId, eingabe).then((ergebnis) => {
        if (abgebrochen) return
        if (ergebnis.ok) {
          setPdfDaten(ergebnis.daten)
          setFehler(null)
        } else {
          setFehler(ergebnis.fehler)
        }
        setLadend(false)
      })
    }, 500)
    return () => {
      abgebrochen = true
      clearTimeout(timer)
    }
  }, [pfarreiId, miniplanId, eingabe])

  return (
    <Card className="animate-rise flex h-[80svh] flex-col lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]">
      <CardHeader
        title="PDF-Vorschau"
        description="Wird bei jeder Änderung live aktualisiert (kein Speichern nötig)."
        action={ladend && <span className="text-xs text-ink-faint">Aktualisiert…</span>}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        {fehler && (
          <Alert>
            <div className="flex flex-col gap-1">
              <span className="font-medium">Fehler beim Rendern der Vorschau:</span>
              {fehler.map((eintrag, index) => (
                <span key={index}>{eintrag}</span>
              ))}
            </div>
          </Alert>
        )}
        {!pdfDaten && !fehler && <p className="text-sm text-ink-soft">Vorschau wird geladen…</p>}
        <PdfViewer data={pdfDaten} className="min-h-0 flex-1" />
      </div>
    </Card>
  )
}

export function MiniplanEditorPage() {
  const { pfarreiId, miniplanId } = useParams<{ pfarreiId: string; miniplanId: string }>()
  const id = Number(pfarreiId)
  const planId = Number(miniplanId)

  const [miniplan, setMiniplan] = useState<Miniplan | null>(null)
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [minis, setMinis] = useState<Mini[]>([])
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [filtertags, setFiltertags] = useState<FiltertagDef[]>([])
  const [gottesdienstDrafts, setGottesdienstDrafts] = useState<
    Record<number, GottesdienstDraft>
  >({})
  const [freitextDraft, setFreitextDraft] = useState<{
    veranstaltungen: string
    ankuendigungen: string
  } | null>(null)

  const reload = useCallback(() => {
    miniplanDetail(id, planId).then(setMiniplan)
  }, [id, planId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    gruppenListe(id).then(setGruppen)
    minisListe(id).then(setMinis)
    dienstTypenListe(id).then(setDienstTypen)
    filtertagsListe(id).then(setFiltertags)
  }, [id])

  const handleGottesdienstDraftChange = useCallback(
    (gottesdienstId: number, draft: GottesdienstDraft) => {
      setGottesdienstDrafts((aktuell) => ({ ...aktuell, [gottesdienstId]: draft }))
    },
    [],
  )

  const handleFreitextDraftChange = useCallback((veranstaltungen: string, ankuendigungen: string) => {
    setFreitextDraft({ veranstaltungen, ankuendigungen })
  }, [])

  const vorschauEingabe = useMemo<MiniplanVorschauEingabe | null>(() => {
    if (!miniplan) return null
    return {
      monat: miniplan.monat,
      jahr: miniplan.jahr,
      veranstaltungen: freitextDraft
        ? freitextDraft.veranstaltungen || null
        : miniplan.veranstaltungen,
      ankuendigungen: freitextDraft
        ? freitextDraft.ankuendigungen || null
        : miniplan.ankuendigungen,
      gottesdienste: miniplan.gottesdienste.map((gd) => {
        const draft = gottesdienstDrafts[gd.id]
        return draft ? draftZuVorschau(draft, gruppen, minis) : gottesdienstOutZuVorschau(gd)
      }),
    }
  }, [miniplan, gottesdienstDrafts, freitextDraft, gruppen, minis])

  if (!miniplan || !vorschauEingabe) {
    return (
      <AppShell wide>
        <p className="text-ink-soft">Lade Miniplan…</p>
      </AppShell>
    )
  }

  return (
    <AppShell wide>
      <Link
        to={`/pfarreien/${id}/miniplaene`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-pine-dark"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zu den Miniplänen
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
        Miniplan {miniplan.monat}/{miniplan.jahr}
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {miniplan.gottesdienste.map((gottesdienst) => (
            <GottesdienstKarte
              key={gottesdienst.id}
              gottesdienst={gottesdienst}
              pfarreiId={id}
              miniplanId={planId}
              jahr={miniplan.jahr}
              gruppen={gruppen}
              minis={minis}
              dienstTypen={dienstTypen}
              filtertags={filtertags}
              onReload={reload}
              onDraftChange={handleGottesdienstDraftChange}
            />
          ))}

          <NeuerGottesdienstForm
            pfarreiId={id}
            miniplanId={planId}
            jahr={miniplan.jahr}
            onCreated={reload}
          />

          <FreitextSection
            pfarreiId={id}
            miniplan={miniplan}
            onSaved={setMiniplan}
            onDraftChange={handleFreitextDraftChange}
          />
        </div>

        <div className="min-w-0">
          <VorschauPanel pfarreiId={id} miniplanId={planId} eingabe={vorschauEingabe} />
        </div>
      </div>
    </AppShell>
  )
}
