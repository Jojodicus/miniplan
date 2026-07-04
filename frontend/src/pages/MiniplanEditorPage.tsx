import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import type { GruppenAnforderung } from '../api/dienstTypen'
import { dienstTypenListe, type DienstTyp } from '../api/dienstTypen'
import {
  gottesdienstBearbeiten,
  gottesdienstErstellen,
  gottesdienstLoeschen,
  type Dienstbedarf,
  type DienstbedarfEingabe,
  type Gottesdienst,
} from '../api/gottesdienste'
import { gruppenListe, type Gruppe } from '../api/gruppen'
import { FILTERTAGS, minisListe, type Filtertag, type Mini } from '../api/minis'
import {
  miniplanAktualisieren,
  miniplanDetail,
  miniplanVorschau,
  miniplanZuVorschauEingabe,
  type Miniplan,
} from '../api/miniplaene'
import { AppShell } from '../components/layout/AppShell'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function filtertagLabel(tag: Filtertag): string {
  return { grundschueler: 'Grundschüler', schueler: 'Schüler', arbeiter: 'Arbeiter' }[tag]
}

let naechsterSchluessel = 0
function neuerSchluessel(): string {
  naechsterSchluessel += 1
  return `neu-${naechsterSchluessel}`
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
  }
}

function DienstbedarfZeile({
  bedarf,
  gruppen,
  minis,
  zeigeFehler,
  onChange,
  onRemove,
}: {
  bedarf: WorkingBedarf
  gruppen: Gruppe[]
  minis: Mini[]
  zeigeFehler: boolean
  onChange: (patch: Partial<WorkingBedarf>) => void
  onRemove: () => void
}) {
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

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
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
        <IconButton label="Dienst entfernen" tone="danger" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div>
        <Label htmlFor={`${bedarf.schluessel}-anzahl`}>Anzahl</Label>
        <Input
          id={`${bedarf.schluessel}-anzahl`}
          type="number"
          min={0}
          value={bedarf.anzahl}
          onChange={(e) => onChange({ anzahl: Number(e.target.value) })}
          className="w-24"
        />
      </div>

      <div>
        <Label>Filtertags</Label>
        <div className="flex flex-wrap gap-2">
          {FILTERTAGS.map((tag) => (
            <CheckboxChip
              key={tag}
              id={`${bedarf.schluessel}-${tag}`}
              checked={bedarf.erforderliche_filtertags.includes(tag)}
              onChange={() => toggleFiltertag(tag)}
            >
              {filtertagLabel(tag)}
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
  )
}

function GottesdienstKarte({
  gottesdienst,
  pfarreiId,
  miniplanId,
  gruppen,
  minis,
  dienstTypen,
  onReload,
}: {
  gottesdienst: Gottesdienst
  pfarreiId: number
  miniplanId: number
  gruppen: Gruppe[]
  minis: Mini[]
  dienstTypen: DienstTyp[]
  onReload: () => void
}) {
  const [datum, setDatum] = useState(gottesdienst.datum)
  const [uhrzeit, setUhrzeit] = useState(gottesdienst.uhrzeit.slice(0, 5))
  const [name, setName] = useState(gottesdienst.name)
  const [bedarfListe, setBedarfListe] = useState<WorkingBedarf[]>(
    gottesdienst.dienstbedarf.map(bedarfAusOut),
  )
  const [neuerDienstTypId, setNeuerDienstTypId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [versucht, setVersucht] = useState(false)

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

  async function handleSave() {
    setVersucht(true)
    const bedarfOhneName = bedarfListe.some(
      (b) => b.dienst_typ_id === null && !(b.name ?? '').trim(),
    )
    if (!datum || !uhrzeit || bedarfOhneName) {
      return
    }
    setError(null)
    try {
      await gottesdienstBearbeiten(pfarreiId, miniplanId, gottesdienst.id, {
        datum,
        uhrzeit,
        name,
        dienstbedarf: bedarfListe.map(zuEingabe),
      })
      onReload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Gottesdienstes'))
    }
  }

  async function handleDelete() {
    if (!confirm(`Gottesdienst "${gottesdienst.name}" wirklich löschen?`)) return
    setError(null)
    try {
      await gottesdienstLoeschen(pfarreiId, miniplanId, gottesdienst.id)
      onReload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Gottesdienstes'))
    }
  }

  return (
    <Card className="animate-rise">
      <div className="flex flex-col gap-4 p-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor={`gottesdienst-${gottesdienst.id}-datum`}>Datum</Label>
            <Input
              id={`gottesdienst-${gottesdienst.id}-datum`}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              required
              error={versucht && !datum ? 'Datum wird benötigt' : undefined}
            />
          </div>
          <div>
            <Label htmlFor={`gottesdienst-${gottesdienst.id}-uhrzeit`}>Uhrzeit</Label>
            <Input
              id={`gottesdienst-${gottesdienst.id}-uhrzeit`}
              type="time"
              value={uhrzeit}
              onChange={(e) => setUhrzeit(e.target.value)}
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
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {bedarfListe.map((bedarf) => (
            <DienstbedarfZeile
              key={bedarf.schluessel}
              bedarf={bedarf}
              gruppen={gruppen}
              minis={minis}
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
          <Button type="button" variant="danger" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Gottesdienst löschen
          </Button>
          <Button type="button" onClick={handleSave}>
            <Check className="h-4 w-4" />
            Speichern
          </Button>
        </div>
      </div>
    </Card>
  )
}

function NeuerGottesdienstForm({
  pfarreiId,
  miniplanId,
  onCreated,
}: {
  pfarreiId: number
  miniplanId: number
  onCreated: () => void
}) {
  const [datum, setDatum] = useState('')
  const [uhrzeit, setUhrzeit] = useState('')
  const [name, setName] = useState('')
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
        dienstbedarf: [],
      })
      setDatum('')
      setUhrzeit('')
      setName('')
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
        className="grid gap-4 p-5 sm:grid-cols-4"
      >
        <div>
          <Label htmlFor="neuer-gottesdienst-datum">Datum</Label>
          <Input
            id="neuer-gottesdienst-datum"
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            required
            error={versucht && !datum ? 'Datum wird benötigt' : undefined}
          />
        </div>
        <div>
          <Label htmlFor="neuer-gottesdienst-uhrzeit">Uhrzeit</Label>
          <Input
            id="neuer-gottesdienst-uhrzeit"
            type="time"
            value={uhrzeit}
            onChange={(e) => setUhrzeit(e.target.value)}
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
      </form>
    </Card>
  )
}

function FreitextSection({
  pfarreiId,
  miniplan,
  onSaved,
}: {
  pfarreiId: number
  miniplan: Miniplan
  onSaved: (miniplan: Miniplan) => void
}) {
  const [veranstaltungen, setVeranstaltungen] = useState(miniplan.veranstaltungen ?? '')
  const [ankuendigungen, setAnkuendigungen] = useState(miniplan.ankuendigungen ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    try {
      const aktualisiert = await miniplanAktualisieren(pfarreiId, miniplan.id, {
        veranstaltungen: veranstaltungen || null,
        ankuendigungen: ankuendigungen || null,
      })
      onSaved(aktualisiert)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern der Freitextfelder'))
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Veranstaltungen & Ankündigungen"
        description="Freitextfelder, die unterhalb des Plans angezeigt werden."
      />
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-col gap-4 p-5">
        <div>
          <Label htmlFor="miniplan-veranstaltungen">Veranstaltungen</Label>
          <textarea
            id="miniplan-veranstaltungen"
            value={veranstaltungen}
            onChange={(e) => setVeranstaltungen(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15"
          />
        </div>
        <div>
          <Label htmlFor="miniplan-ankuendigungen">Ankündigungen</Label>
          <textarea
            id="miniplan-ankuendigungen"
            value={ankuendigungen}
            onChange={(e) => setAnkuendigungen(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15"
          />
        </div>
        <Button type="button" onClick={handleSave} className="self-start">
          <Check className="h-4 w-4" />
          Speichern
        </Button>
      </div>
    </Card>
  )
}

function VorschauPanel({ pfarreiId, miniplan }: { pfarreiId: number; miniplan: Miniplan }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string[] | null>(null)
  const [ladend, setLadend] = useState(false)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    setLadend(true)
    const timer = setTimeout(() => {
      miniplanVorschau(pfarreiId, miniplan.id, miniplanZuVorschauEingabe(miniplan)).then(
        (ergebnis) => {
          if (abgebrochen) return
          if (ergebnis.ok) {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
            blobUrlRef.current = ergebnis.blobUrl
            setBlobUrl(ergebnis.blobUrl)
            setFehler(null)
          } else {
            setFehler(ergebnis.fehler)
          }
          setLadend(false)
        },
      )
    }, 500)
    return () => {
      abgebrochen = true
      clearTimeout(timer)
    }
  }, [pfarreiId, miniplan])

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    },
    [],
  )

  return (
    <Card className="animate-rise">
      <CardHeader
        title="PDF-Vorschau"
        description="Wird bei jeder gespeicherten Änderung automatisch aktualisiert."
      />
      <div className="flex flex-col gap-3 p-5">
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
        {ladend && <p className="text-sm text-ink-soft">Vorschau wird aktualisiert…</p>}
        {blobUrl && (
          <iframe
            title="Miniplan-PDF-Vorschau"
            src={blobUrl}
            className="h-[600px] w-full rounded-lg border border-line"
          />
        )}
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
  }, [id])

  if (!miniplan) {
    return (
      <AppShell>
        <p className="text-ink-soft">Lade Miniplan…</p>
      </AppShell>
    )
  }

  return (
    <AppShell>
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

      <div className="mt-6 flex flex-col gap-6">
        <VorschauPanel pfarreiId={id} miniplan={miniplan} />

        {miniplan.gottesdienste.map((gottesdienst) => (
          <GottesdienstKarte
            key={gottesdienst.id}
            gottesdienst={gottesdienst}
            pfarreiId={id}
            miniplanId={planId}
            gruppen={gruppen}
            minis={minis}
            dienstTypen={dienstTypen}
            onReload={reload}
          />
        ))}

        <NeuerGottesdienstForm pfarreiId={id} miniplanId={planId} onCreated={reload} />

        <FreitextSection pfarreiId={id} miniplan={miniplan} onSaved={setMiniplan} />
      </div>
    </AppShell>
  )
}
