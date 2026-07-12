import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  GripVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings2,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { useParams } from 'react-router-dom'
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
  type DienstbedarfZuweisung,
  type Gottesdienst,
} from '../api/gottesdienste'
import { gruppenListe, type Gruppe } from '../api/gruppen'
import { minisListe, type Filtertag, type Mini } from '../api/minis'
import {
  gottesdienstOutZuVorschau,
  miniplanAktualisieren,
  miniplanDetail,
  miniplanFuellen,
  miniplanPdfHerunterladen,
  miniplanStatusAendern,
  miniplanVorschau,
  miniplanZuweisungenLeeren,
  miniplanZuweisungFixieren,
  miniplanZuweisungenTauschen,
  miniplanZuteilungEinstellungenSetzen,
  type Miniplan,
  type MiniplanVorschauEingabe,
  type VorschauDienstbedarf,
  type VorschauGottesdienst,
  type ZuteilungEinstellungen,
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
import { Modal } from '../components/ui/Modal'
import { PdfViewer } from '../components/ui/PdfViewer'
import { Popover } from '../components/ui/Popover'
import { TimeInput } from '../components/ui/TimeInput'
import { useToast } from '../components/ui/Toast'
import { formatDatumMitWochentag, monatsName } from '../lib/datum'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

let naechsterSchluessel = 0
function neuerSchluessel(): string {
  naechsterSchluessel += 1
  return `neu-${naechsterSchluessel}`
}

type SpeicherStatus = 'gespeichert' | 'speichert' | 'ungespeichert' | 'fehler'

function StatusAnzeige({ status, className = 'text-xs' }: { status: SpeicherStatus; className?: string }) {
  const text: Record<SpeicherStatus, string> = {
    gespeichert: 'Gespeichert',
    speichert: 'Speichert…',
    ungespeichert: 'Nicht gespeichert – Angaben fehlen',
    fehler: 'Fehler beim Speichern',
  }
  const farbe: Record<SpeicherStatus, string> = {
    gespeichert: 'text-ink-faint',
    speichert: 'text-pine-dark',
    ungespeichert: 'text-gold-dark',
    fehler: 'text-wine',
  }
  return <span className={`${className} ${farbe[status]}`}>{text[status]}</span>
}

// Für die Gesamt-Anzeige neben dem Titel: der "schlechteste" Status gewinnt.
function gesamtStatus(statusListe: SpeicherStatus[]): SpeicherStatus {
  if (statusListe.includes('fehler')) return 'fehler'
  if (statusListe.includes('ungespeichert')) return 'ungespeichert'
  if (statusListe.includes('speichert')) return 'speichert'
  return 'gespeichert'
}

interface WorkingBedarf {
  schluessel: string
  // null für noch nie gespeicherten Bedarf (frisch hinzugefügter Dienst-Typ/Freitext) - erst nach
  // dem ersten Speichern existiert eine echte Dienstbedarf-Zeile, auf die sich Drag-Ziele/
  // Zuweisungs-IDs beziehen können.
  dienstbedarfId: number | null
  dienst_typ_id: number | null
  dienst_typ_name: string | null
  name: string | null
  anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderung[]
  fixierteMiniIds: number[]
  zeige_label: boolean
}

function bedarfAusOut(bedarf: Dienstbedarf): WorkingBedarf {
  return {
    schluessel: `bestehend-${bedarf.id}`,
    dienstbedarfId: bedarf.id,
    dienst_typ_id: bedarf.dienst_typ?.id ?? null,
    dienst_typ_name: bedarf.dienst_typ?.name ?? null,
    name: bedarf.name,
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a) => ({
      gruppe_id: a.gruppe.id,
      mindest_anzahl: a.mindest_anzahl,
    })),
    fixierteMiniIds: bedarf.zuweisungen.filter((z) => z.manuell_fixiert).map((z) => z.mini.id),
    zeige_label: bedarf.zeige_label,
  }
}

function bedarfAusDienstTyp(dienstTyp: DienstTyp): WorkingBedarf {
  return {
    schluessel: neuerSchluessel(),
    dienstbedarfId: null,
    dienst_typ_id: dienstTyp.id,
    dienst_typ_name: dienstTyp.name,
    name: null,
    anzahl: dienstTyp.standard_anzahl,
    erforderliche_filtertags: [],
    gruppen_anforderungen: dienstTyp.gruppen_anforderungen.map((a) => ({
      gruppe_id: a.gruppe.id,
      mindest_anzahl: a.mindest_anzahl,
    })),
    fixierteMiniIds: [],
    zeige_label: dienstTyp.zeige_label,
  }
}

function bedarfFreitext(): WorkingBedarf {
  return {
    schluessel: neuerSchluessel(),
    dienstbedarfId: null,
    dienst_typ_id: null,
    dienst_typ_name: null,
    name: '',
    anzahl: 1,
    erforderliche_filtertags: [],
    gruppen_anforderungen: [],
    fixierteMiniIds: [],
    zeige_label: true,
  }
}

function zuEingabe(bedarf: WorkingBedarf, autoMiniIds: number[]): DienstbedarfEingabe {
  return {
    dienst_typ_id: bedarf.dienst_typ_id,
    name: bedarf.dienst_typ_id === null ? bedarf.name : null,
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen,
    fixierte_mini_ids: bedarf.fixierteMiniIds,
    auto_mini_ids: autoMiniIds,
    zeige_label: bedarf.zeige_label,
  }
}

function bedarfZuVorschau(
  bedarf: WorkingBedarf,
  gruppen: Gruppe[],
  minis: Mini[],
  autoZuweisungen: DienstbedarfZuweisung[],
): VorschauDienstbedarf {
  return {
    name: bedarf.dienst_typ_name ?? bedarf.name ?? '',
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a) => ({
      gruppe_name: gruppen.find((g) => g.id === a.gruppe_id)?.name ?? '',
      mindest_anzahl: a.mindest_anzahl,
    })),
    zugewiesene_minis: [
      ...bedarf.fixierteMiniIds
        .map((id) => minis.find((m) => m.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
      ...autoZuweisungen.map((z) => z.mini.name),
    ],
    zeige_label: bedarf.zeige_label,
  }
}

interface GottesdienstDraft {
  datum: string
  uhrzeit: string
  name: string
  notiz: string
  bedarfListe: WorkingBedarf[]
  // Serverstand der Zuweisungen je Bedarf-Schlüssel (für automatisch zugewiesene Minis, die nicht
  // Teil des editierbaren Drafts sind, aber trotzdem in der Vorschau auftauchen sollen).
  serverZuweisungenBySchluessel: Record<string, DienstbedarfZuweisung[]>
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
    dienstbedarf: draft.bedarfListe.map((b) =>
      bedarfZuVorschau(
        b,
        gruppen,
        minis,
        (draft.serverZuweisungenBySchluessel[b.schluessel] ?? []).filter(
          (z) => !z.manuell_fixiert,
        ),
      ),
    ),
  }
}

// Payload, das ein Zuweisungs-Chip beim Ziehen mitgibt (Tauschen zweier Chips über den gemeinsamen
// DndContext, ohne Prop-Drilling).
export interface ZuweisungDragData {
  zuweisungId: number
  dienstbedarfId: number
  manuellFixiert: boolean
}

function ZuweisungsChip({
  name,
  tone,
  dienstbedarfId,
  zuweisung,
  readonly,
  onRemove,
  onPin,
}: {
  name: string
  tone: 'fest' | 'auto'
  dienstbedarfId: number | null
  zuweisung: DienstbedarfZuweisung | null
  readonly?: boolean
  onRemove?: () => void
  onPin?: () => void
}) {
  const dragData: ZuweisungDragData | undefined =
    !readonly && zuweisung && dienstbedarfId !== null
      ? { zuweisungId: zuweisung.id, dienstbedarfId, manuellFixiert: zuweisung.manuell_fixiert }
      : undefined
  const dragId = zuweisung ? `zuweisung-${zuweisung.id}` : undefined
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragId ?? 'zuweisung-unbekannt',
    data: dragData,
    disabled: !dragData,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dragId ?? 'zuweisung-unbekannt-drop',
    data: dragData,
    disabled: !dragData,
  })

  return (
    <span
      data-testid={`chip-${tone}`}
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      {...(dragData ? { ...listeners, ...attributes } : {})}
      className={`inline-flex w-fit shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        tone === 'auto'
          ? 'border-dashed border-gold-dark/50 bg-gold-tint text-gold-dark'
          : 'border-pine bg-pine-tint text-pine-dark'
      } ${dragData ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''} ${
        isOver ? 'ring-2 ring-pine' : ''
      }`}
    >
      {name}
      {onPin && (
        <button
          type="button"
          aria-label={`${name} fest zuweisen`}
          title="Fest zuweisen (bleibt beim Füllen erhalten)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onPin}
          className="cursor-pointer text-current opacity-60 hover:opacity-100"
        >
          <Pin className="h-3 w-3" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`${name} entfernen`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="cursor-pointer text-current opacity-60 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

// Durchsuchbarer Mini-Hinzufügen-Bereich: einziger Einstiegspunkt zum Besetzen offener Stellen
// (die "offen"-Chips sind reine Anzeige, kein zweiter Trigger mehr - vorher lösten beide dieselbe
// Aktion aus). Erscheint direkt als kompaktes Suchfeld, solange offene Stellen existieren, statt
// erst über einen "+ Mini"-Button aufgeklappt werden zu müssen. Zeigt bei vielen Treffern
// "+X weitere", damit klar ist, dass die Suche die Chip-Liste einschränkt (statt scheinbar keine
// Minis zu haben).
const ADDER_LIMIT = 24

function MiniAdder({
  minis,
  belegteMiniIds,
  disabled,
  onAdd,
}: {
  minis: Mini[]
  belegteMiniIds: Set<number>
  disabled: boolean
  onAdd: (miniId: number) => void
}) {
  const [suche, setSuche] = useState('')
  const begriff = suche.trim().toLowerCase()
  const verfuegbar = useMemo(
    () =>
      minis
        .filter((m) => !belegteMiniIds.has(m.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [minis, belegteMiniIds],
  )
  const gefiltert = begriff ? verfuegbar.filter((m) => m.name.toLowerCase().includes(begriff)) : []
  const sichtbar = gefiltert.slice(0, ADDER_LIMIT)
  const rest = gefiltert.length - sichtbar.length

  if (disabled) return null

  return (
    <div className="w-full rounded-lg border border-line bg-paper-dim/40 p-2">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          aria-label="Minis durchsuchen"
          placeholder="Mini hinzufügen…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="h-8 pl-9"
        />
      </div>
      {verfuegbar.length === 0 ? (
        <p className="px-1 py-1 text-xs text-ink-faint">Alle Minis sind bereits zugewiesen.</p>
      ) : !begriff ? null : gefiltert.length === 0 ? (
        <p className="px-1 py-1 text-xs text-ink-faint">Kein Mini passt zu „{suche.trim()}“.</p>
      ) : (
        // Einzeilig mit horizontalem Scroll (Desktop) statt umbrechend über mehrere Zeilen -
        // die Karte soll durch Suchergebnisse nicht in der Höhe wachsen.
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sichtbar.map((mini) => (
            <button
              key={mini.id}
              type="button"
              onClick={() => onAdd(mini.id)}
              className="shrink-0 rounded-full border border-line px-2.5 py-1 text-sm whitespace-nowrap text-ink-soft transition-colors hover:border-pine hover:bg-pine-tint hover:text-pine-dark"
            >
              {mini.name}
            </button>
          ))}
          {rest > 0 && (
            <span className="shrink-0 self-center px-1 text-xs whitespace-nowrap text-ink-faint">
              +{rest} weitere – Suche eingrenzen
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Kurzbeschreibung eines Dienstes für die stets sichtbare Zeile (Name und/oder Einschränkungen).
function dienstEinschraenkungen(bedarf: WorkingBedarf, gruppen: Gruppe[], filtertags: FiltertagDef[]): string[] {
  return [
    ...bedarf.erforderliche_filtertags.map(
      (tag) => filtertags.find((f) => f.key === tag)?.label ?? tag,
    ),
    ...bedarf.gruppen_anforderungen.map(
      (a) => `mind. ${a.mindest_anzahl}× ${gruppen.find((g) => g.id === a.gruppe_id)?.name ?? '?'}`,
    ),
  ]
}

// Stets sichtbare Belegungs-Zeile eines Dienstes: fest zugewiesene (pine) und automatisch
// zugewiesene (gold, gestrichelt) Minis, offene Stellen als weinrote Platzhalter (auf dem PDF
// ebenfalls hervorgehoben) und ein durchsuchbarer Mini-Adder. So lässt sich die Belegung ohne
// Aufklappen mehrerer Ebenen direkt bearbeiten.
function DienstbedarfBelegung({
  bedarf,
  gruppen,
  minis,
  filtertags,
  serverZuweisungen,
  gottesdienstBelegteMiniIds,
  dienstbedarfId,
  readonly,
  collapsed,
  onToggleCollapsed,
  onChange,
  onClearAuto,
  onPinAuto,
}: {
  bedarf: WorkingBedarf
  gruppen: Gruppe[]
  minis: Mini[]
  filtertags: FiltertagDef[]
  serverZuweisungen: DienstbedarfZuweisung[]
  // Minis, die bereits einem anderen Dienst desselben Gottesdienstes zugewiesen sind - der Adder
  // soll sie nicht nochmal anbieten, auch wenn sie für diesen Dienstbedarf selbst noch frei sind.
  gottesdienstBelegteMiniIds: Set<number>
  dienstbedarfId: number | null
  readonly: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onChange: (patch: Partial<WorkingBedarf>) => void
  onClearAuto: () => void
  onPinAuto: (zuweisungId: number) => void
}) {
  function toggleMini(miniId: number) {
    onChange({
      fixierteMiniIds: bedarf.fixierteMiniIds.includes(miniId)
        ? bedarf.fixierteMiniIds.filter((id) => id !== miniId)
        : [...bedarf.fixierteMiniIds, miniId],
    })
  }

  const autoZuweisungen = serverZuweisungen.filter((z) => !z.manuell_fixiert)
  const belegteMiniIds = new Set([
    ...bedarf.fixierteMiniIds,
    ...autoZuweisungen.map((z) => z.mini.id),
  ])
  const offeneStellen = Math.max(bedarf.anzahl - belegteMiniIds.size, 0)
  const voll = belegteMiniIds.size >= bedarf.anzahl
  const einschraenkungen = dienstEinschraenkungen(bedarf, gruppen, filtertags)
  const anzeigeName = bedarf.dienst_typ_name ?? bedarf.name ?? 'Dienst'

  return (
    <div data-testid="dienst-belegung" className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2 text-left"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
          )}
          <span className="text-sm font-medium text-ink">{anzeigeName}</span>
          <span className="text-xs text-ink-faint">
            {belegteMiniIds.size}/{bedarf.anzahl}
          </span>
          {einschraenkungen.length > 0 && (
            <span className="text-xs text-ink-faint">· {einschraenkungen.join(', ')}</span>
          )}
        </button>
        {!readonly && autoZuweisungen.length > 0 && (
          <button
            type="button"
            onClick={onClearAuto}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ink-faint transition-colors hover:bg-wine-tint hover:text-wine"
          >
            <Eraser className="h-3.5 w-3.5" />
            Auto leeren
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {bedarf.fixierteMiniIds.map((miniId) => {
              const mini = minis.find((m) => m.id === miniId)
              if (!mini) return null
              const zuweisung =
                serverZuweisungen.find((z) => z.manuell_fixiert && z.mini.id === miniId) ?? null
              return (
                <ZuweisungsChip
                  key={`fest-${miniId}`}
                  name={mini.name}
                  tone="fest"
                  dienstbedarfId={dienstbedarfId}
                  zuweisung={zuweisung}
                  readonly={readonly}
                  onRemove={readonly ? undefined : () => toggleMini(miniId)}
                />
              )
            })}
            {autoZuweisungen.map((zuweisung) => (
              <ZuweisungsChip
                key={`auto-${zuweisung.id}`}
                name={zuweisung.mini.name}
                tone="auto"
                dienstbedarfId={dienstbedarfId}
                zuweisung={zuweisung}
                readonly={readonly}
                onPin={readonly ? undefined : () => onPinAuto(zuweisung.id)}
              />
            ))}
            {/* Reine Anzeige unbesetzter Stellen - kein zweiter Klick-Trigger mehr für den Picker
                (vorher lösten diese Chips und der MiniAdder dieselbe Aktion redundant aus). */}
            {Array.from({ length: offeneStellen }, (_, i) => (
              <span
                key={`offen-${i}`}
                className="inline-flex items-center rounded-full border border-dashed border-wine/50 bg-wine-tint/40 px-3 py-1.5 text-sm text-wine"
              >
                offen
              </span>
            ))}
          </div>
          {!readonly && (
            <div className="mt-2">
              <MiniAdder
                minis={minis}
                belegteMiniIds={gottesdienstBelegteMiniIds}
                disabled={voll}
                onAdd={(miniId) => toggleMini(miniId)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Strukturelle Einstellungen eines Dienstes (Name/Anzahl/Einschränkungen) – im Bearbeiten-Modal,
// getrennt von der stets sichtbaren Belegung.
function DienstbedarfEinstellungen({
  bedarf,
  gruppen,
  filtertags,
  onChange,
  onRemove,
}: {
  bedarf: WorkingBedarf
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bedarf.schluessel,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-3 rounded-lg border border-line bg-paper p-3 ${isDragging ? 'z-10 opacity-60' : ''}`}
    >
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3">
        <button
          type="button"
          aria-label="Dienst verschieben"
          className="cursor-grab touch-none text-ink-faint hover:text-ink-soft active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {bedarf.dienst_typ_id !== null ? (
          <span className="min-w-0 truncate text-sm font-medium text-ink">
            {bedarf.dienst_typ_name}
          </span>
        ) : (
          <Input
            aria-label="Name des Dienstes"
            placeholder="z. B. Alle Ministranten"
            value={bedarf.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            required
            error={!(bedarf.name ?? '').trim() ? 'Name darf nicht leer sein' : undefined}
          />
        )}
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`${bedarf.schluessel}-anzahl`}>Anzahl</Label>
          <Input
            id={`${bedarf.schluessel}-anzahl`}
            type="number"
            min={1}
            value={bedarf.anzahl}
            onChange={(e) => onChange({ anzahl: Number(e.target.value) })}
            className="!w-16"
          />
        </div>
        <CheckboxChip
          id={`${bedarf.schluessel}-zeige-label`}
          checked={bedarf.zeige_label}
          onChange={() => onChange({ zeige_label: !bedarf.zeige_label })}
          title="Ist dies aus, erscheint auf dem Plan nur die Anzahl/Einschränkung, nicht der Name."
        >
          Auf Plan
        </CheckboxChip>
        <InlineConfirmButton onConfirm={onRemove} label="Dienst entfernen" size="sm" />
      </div>

      {filtertags.length > 0 && (
        <div>
          <Label>Nur mit Verfügbarkeits-Status</Label>
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
      )}

      <div>
        <Label hint="z. B. mind. 1 aus Gruppe Obermini">Gruppen-Mindestanzahl</Label>
        <div className="flex flex-col gap-2">
          {bedarf.gruppen_anforderungen.map((anforderung, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-ink-soft">mind.</span>
              <Input
                type="number"
                min={1}
                max={bedarf.anzahl}
                value={anforderung.mindest_anzahl}
                onChange={(e) =>
                  updateGruppenAnforderung(index, {
                    mindest_anzahl: Math.min(Number(e.target.value), bedarf.anzahl),
                  })
                }
                className="!w-16 shrink-0 text-center"
              />
              <span className="shrink-0 text-sm text-ink-soft">aus</span>
              <Select
                value={anforderung.gruppe_id}
                onChange={(e) =>
                  updateGruppenAnforderung(index, { gruppe_id: Number(e.target.value) })
                }
                className="min-w-0 flex-1"
              >
                {gruppen.map((gruppe) => (
                  <option key={gruppe.id} value={gruppe.id}>
                    {gruppe.name}
                  </option>
                ))}
              </Select>
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
          size="sm"
          className="mt-2 self-start"
          onClick={addGruppenAnforderung}
          disabled={bedarf.gruppen_anforderungen.length >= gruppen.length}
        >
          <Plus className="h-4 w-4" />
          Zeile hinzufügen
        </Button>
      </div>
    </div>
  )
}

// Gemeinsames Formular für Anlegen und Bearbeiten eines Gottesdienstes (Metadaten + Dienste in
// einem Schritt statt getrennter Anlege-/Bearbeiten-Modale) - Zustand/Setter kommen als Props,
// damit sowohl `GottesdienstKarte` (bestehender State, Autosave) als auch `NeuerGottesdienstModal`
// (frischer lokaler State) dieselbe Form nutzen können.
function GottesdienstDetailsForm({
  idPrefix,
  pfarreiId,
  jahr,
  monat,
  datum,
  setDatum,
  uhrzeit,
  setUhrzeit,
  name,
  setName,
  notiz,
  setNotiz,
  bedarfListe,
  setBedarfListe,
  gruppen,
  filtertags,
  dienstTypen,
  zeigeFehler,
}: {
  idPrefix: string
  pfarreiId: number
  jahr: number
  monat: number
  datum: string
  setDatum: (v: string) => void
  uhrzeit: string
  setUhrzeit: (v: string) => void
  name: string
  setName: (v: string) => void
  notiz: string
  setNotiz: (v: string) => void
  bedarfListe: WorkingBedarf[]
  setBedarfListe: React.Dispatch<React.SetStateAction<WorkingBedarf[]>>
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
  dienstTypen: DienstTyp[]
  zeigeFehler: boolean
}) {
  const dndSensoren = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function updateBedarf(schluessel: string, patch: Partial<WorkingBedarf>) {
    setBedarfListe((liste) =>
      liste.map((b) => (b.schluessel === schluessel ? { ...b, ...patch } : b)),
    )
  }

  function removeBedarf(schluessel: string) {
    setBedarfListe((liste) => liste.filter((b) => b.schluessel !== schluessel))
  }

  function addDienstTyp(dienstTyp: DienstTyp) {
    setBedarfListe((liste) => [...liste, bedarfAusDienstTyp(dienstTyp)])
  }

  function addFreitext() {
    setBedarfListe((liste) => [...liste, bedarfFreitext()])
  }

  function handleDienstDragEnd(event: DragEndEvent) {
    const aktivId = event.active.id
    const zielId = event.over?.id
    if (!zielId || aktivId === zielId) return
    setBedarfListe((liste) => {
      const von = liste.findIndex((b) => b.schluessel === aktivId)
      const zu = liste.findIndex((b) => b.schluessel === zielId)
      if (von === -1 || zu === -1) return liste
      return arrayMove(liste, von, zu)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${idPrefix}-datum`}>Datum</Label>
          <DateInput
            id={`${idPrefix}-datum`}
            pfarreiId={pfarreiId}
            jahr={jahr}
            monat={monat}
            value={datum}
            onChange={setDatum}
            required
            error={zeigeFehler && !datum ? 'Datum wird benötigt' : undefined}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-uhrzeit`}>Uhrzeit</Label>
          <TimeInput
            id={`${idPrefix}-uhrzeit`}
            value={uhrzeit}
            onChange={setUhrzeit}
            required
            error={zeigeFehler && !uhrzeit ? 'Uhrzeit wird benötigt' : undefined}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-name`} hint="optional">
            Name
          </Label>
          <Input
            id={`${idPrefix}-name`}
            placeholder="z. B. Sonntagsmesse"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-notiz`} hint="optional">
          Notiz
        </Label>
        <textarea
          id={`${idPrefix}-notiz`}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          rows={2}
          placeholder="z. B. Bitte Kerzen mitbringen"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15"
        />
      </div>

      <DndContext
        sensors={dndSensoren}
        collisionDetection={closestCenter}
        onDragEnd={handleDienstDragEnd}
      >
        <SortableContext
          items={bedarfListe.map((b) => b.schluessel)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {bedarfListe.map((bedarf) => (
              <DienstbedarfEinstellungen
                key={bedarf.schluessel}
                bedarf={bedarf}
                gruppen={gruppen}
                filtertags={filtertags}
                onChange={(patch) => updateBedarf(bedarf.schluessel, patch)}
                onRemove={() => removeBedarf(bedarf.schluessel)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div>
        <Label>Dienst hinzufügen</Label>
        <div className="flex flex-wrap gap-2">
          {dienstTypen.map((dt) => (
            <Button
              key={dt.id}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addDienstTyp(dt)}
            >
              <Plus className="h-3.5 w-3.5" />
              {dt.name}
            </Button>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addFreitext}>
            <Plus className="h-3.5 w-3.5" />
            Freitext-Dienst
          </Button>
        </div>
      </div>
    </div>
  )
}

const AUTOSAVE_DEBOUNCE_MS = 800

// Datum um ganze Tage verschieben (für "Duplizieren": gleicher Gottesdienst eine Woche später).
function datumPlusTage(iso: string, tage: number): string {
  const datum = new Date(`${iso}T00:00:00`)
  datum.setDate(datum.getDate() + tage)
  const monat = String(datum.getMonth() + 1).padStart(2, '0')
  const tag = String(datum.getDate()).padStart(2, '0')
  return `${datum.getFullYear()}-${monat}-${tag}`
}

function GottesdienstKarte({
  gottesdienst,
  pfarreiId,
  miniplanId,
  jahr,
  monat,
  gruppen,
  minis,
  dienstTypen,
  filtertags,
  readonly,
  onReload,
  onDraftChange,
  onStatusChange,
  onDuplicated,
  onClearAutoBereich,
  onPinAuto,
  oeffneEditor = false,
  onEditorGeoeffnet,
}: {
  gottesdienst: Gottesdienst
  pfarreiId: number
  miniplanId: number
  jahr: number
  monat: number
  gruppen: Gruppe[]
  minis: Mini[]
  dienstTypen: DienstTyp[]
  filtertags: FiltertagDef[]
  readonly: boolean
  onReload: () => void
  onDraftChange: (gottesdienstId: number, draft: GottesdienstDraft) => void
  onStatusChange: (gottesdienstId: number, status: SpeicherStatus) => void
  onDuplicated: (gottesdienstId: number) => void
  onClearAutoBereich: (bereich: { gottesdienstId?: number; dienstbedarfId?: number }) => void
  onPinAuto: (zuweisungId: number) => void
  oeffneEditor?: boolean
  onEditorGeoeffnet?: (gottesdienstId: number) => void
}) {
  const [datum, setDatum] = useState(gottesdienst.datum)
  const [uhrzeit, setUhrzeit] = useState(gottesdienst.uhrzeit.slice(0, 5))
  const [name, setName] = useState(gottesdienst.name ?? '')
  const [notiz, setNotiz] = useState(gottesdienst.notiz ?? '')
  const [bedarfListe, setBedarfListe] = useState<WorkingBedarf[]>(
    gottesdienst.dienstbedarf.map(bedarfAusOut),
  )
  // Serverstand der Zuweisungen je Bedarf-Schlüssel - getrennt von `bedarfListe`, damit
  // Auffrischen nach einem Speichern nicht den Autosave-Effekt erneut auslöst.
  const [serverZuweisungenMap, setServerZuweisungenMap] = useState<
    Record<string, DienstbedarfZuweisung[]>
  >(() => Object.fromEntries(gottesdienst.dienstbedarf.map((b) => [`bestehend-${b.id}`, b.zuweisungen])))
  // Echte dienstbedarfId je Schlüssel (frisch hinzugefügter Bedarf startet mit `null`, bekommt sie
  // nach dem ersten Speichern) - getrennt von `bedarfListe`, damit kein Autosave ausgelöst wird.
  const [dienstbedarfIdMap, setDienstbedarfIdMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(gottesdienst.dienstbedarf.map((b) => [`bestehend-${b.id}`, b.id])),
  )
  const [status, setStatus] = useState<SpeicherStatus>('gespeichert')
  const [editorOffen, setEditorOffen] = useState(oeffneEditor)
  // Klapp-Zustand je Dienst in der stets sichtbaren Belegungs-Liste (Default: ausgeklappt) -
  // reduziert Unübersichtlichkeit bei vielen Diensten, ohne Informationen dauerhaft zu verstecken.
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const { showToast } = useToast()
  const istErstesRendern = useRef(true)

  // Frisch angelegte/duplizierte Gottesdienste öffnen den Editor automatisch. Den Auslöser danach
  // sofort zurücksetzen, damit ein späterer Remount (z.B. nach Füllen/Leeren via
  // `zuteilungsRevision`) den Editor nicht erneut aufreißt.
  useEffect(() => {
    if (oeffneEditor) onEditorGeoeffnet?.(gottesdienst.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateBedarf(schluessel: string, patch: Partial<WorkingBedarf>) {
    setBedarfListe((liste) =>
      liste.map((b) => (b.schluessel === schluessel ? { ...b, ...patch } : b)),
    )
  }

  // Minis, die irgendeinem Dienst dieses Gottesdienstes bereits zugewiesen sind - über alle
  // Dienstbedarf-Einträge hinweg, damit der Adder denselben Mini nicht für einen zweiten Dienst
  // desselben Gottesdienstes vorschlägt.
  const gottesdienstBelegteMiniIds = useMemo(() => {
    const ids = new Set<number>()
    bedarfListe.forEach((b) => {
      b.fixierteMiniIds.forEach((id) => ids.add(id))
      ;(serverZuweisungenMap[b.schluessel] ?? [])
        .filter((z) => !z.manuell_fixiert)
        .forEach((z) => ids.add(z.mini.id))
    })
    return ids
  }, [bedarfListe, serverZuweisungenMap])

  function toggleCollapsed(schluessel: string) {
    setCollapsedMap((karte) => ({ ...karte, [schluessel]: !karte[schluessel] }))
  }

  useEffect(() => {
    onDraftChange(gottesdienst.id, {
      datum,
      uhrzeit,
      name,
      notiz,
      bedarfListe,
      serverZuweisungenBySchluessel: serverZuweisungenMap,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, uhrzeit, name, notiz, bedarfListe, serverZuweisungenMap])

  useEffect(() => {
    onStatusChange(gottesdienst.id, status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (istErstesRendern.current) {
      istErstesRendern.current = false
      return
    }
    // Ein abgeschlossener Plan ist schreibgeschützt (Backend lehnt Mutationen mit 409 ab) - die
    // UI verhindert Änderungen bereits, aber sicherheitshalber auch hier keinen Autosave auslösen.
    if (readonly) return
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
        const gespeichert = await gottesdienstBearbeiten(pfarreiId, miniplanId, gottesdienst.id, {
          datum,
          uhrzeit,
          name,
          notiz: notiz.trim() ? notiz : null,
          dienstbedarf: bedarfListe.map((bedarf) =>
            zuEingabe(
              bedarf,
              (serverZuweisungenMap[bedarf.schluessel] ?? [])
                .filter((z) => !z.manuell_fixiert)
                .map((z) => z.mini.id),
            ),
          ),
        })
        setStatus('gespeichert')
        // Server-Zuweisungen (v.a. neu vergebene IDs für gerade fixierte Minis) und dienstbedarfIds
        // anhand der Positions-Reihenfolge auffrischen - separat von `bedarfListe`, damit das hier
        // keinen erneuten Autosave-Lauf auslöst.
        setServerZuweisungenMap((karte) => {
          const aktualisiert = { ...karte }
          bedarfListe.forEach((bedarf, index) => {
            aktualisiert[bedarf.schluessel] = gespeichert.dienstbedarf[index]?.zuweisungen ?? []
          })
          return aktualisiert
        })
        setDienstbedarfIdMap((karte) => {
          const aktualisiert = { ...karte }
          bedarfListe.forEach((bedarf, index) => {
            const id = gespeichert.dienstbedarf[index]?.id
            if (id !== undefined) aktualisiert[bedarf.schluessel] = id
          })
          return aktualisiert
        })
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
      setEditorOffen(false)
      onReload()
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Löschen des Gottesdienstes'), 'error')
    }
  }

  // Kopiert den Gottesdienst eine Woche später - Dienste und Einschränkungen bleiben erhalten,
  // manuell zugewiesene Minis nicht (die gelten für den konkreten Termin, nicht die Struktur).
  async function handleDuplicate() {
    try {
      const erstellt = await gottesdienstErstellen(pfarreiId, miniplanId, {
        datum: datumPlusTage(datum, 7),
        uhrzeit,
        name,
        notiz: notiz.trim() ? notiz : null,
        dienstbedarf: bedarfListe.map((bedarf) => ({
          ...zuEingabe(bedarf, []),
          fixierte_mini_ids: [],
          auto_mini_ids: [],
        })),
      })
      showToast('Gottesdienst dupliziert (eine Woche später)')
      onDuplicated(erstellt.id)
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Duplizieren des Gottesdienstes'), 'error')
    }
  }

  const hatAuto = bedarfListe.some(
    (b) => (serverZuweisungenMap[b.schluessel] ?? []).some((z) => !z.manuell_fixiert),
  )

  return (
    <Card className="animate-rise">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-ink">
              {datum ? formatDatumMitWochentag(datum) : 'Kein Datum'}
              {uhrzeit && `, ${uhrzeit} Uhr`}
            </span>
            {name && <span className="text-sm text-ink-soft">{name}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status !== 'gespeichert' && <StatusAnzeige status={status} className="mr-1 text-xs" />}
          {!readonly && hatAuto && (
            <IconButton
              label="Automatische Zuweisungen dieses Gottesdienstes leeren"
              onClick={() => onClearAutoBereich({ gottesdienstId: gottesdienst.id })}
            >
              <Eraser className="h-4 w-4" />
            </IconButton>
          )}
          {!readonly && (
            <IconButton
              label="Duplizieren (eine Woche später)"
              onClick={handleDuplicate}
              disabled={!datum || !uhrzeit}
              className="disabled:pointer-events-none disabled:opacity-40"
            >
              <Copy className="h-4 w-4" />
            </IconButton>
          )}
          {!readonly && (
            <IconButton label="Bearbeiten" onClick={() => setEditorOffen(true)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          )}
          {!readonly && (
            <InlineConfirmButton
              onConfirm={handleDelete}
              label="Gottesdienst löschen"
              confirmLabel="Wirklich löschen?"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {bedarfListe.length === 0 ? (
          <p className="text-sm text-ink-faint">
            {readonly
              ? 'Keine Dienste angelegt.'
              : 'Noch keine Dienste – über „Bearbeiten“ hinzufügen.'}
          </p>
        ) : (
          bedarfListe.map((bedarf) => (
            <DienstbedarfBelegung
              key={bedarf.schluessel}
              bedarf={bedarf}
              gruppen={gruppen}
              minis={minis}
              filtertags={filtertags}
              serverZuweisungen={serverZuweisungenMap[bedarf.schluessel] ?? []}
              gottesdienstBelegteMiniIds={gottesdienstBelegteMiniIds}
              dienstbedarfId={dienstbedarfIdMap[bedarf.schluessel] ?? bedarf.dienstbedarfId}
              readonly={readonly}
              collapsed={collapsedMap[bedarf.schluessel] ?? false}
              onToggleCollapsed={() => toggleCollapsed(bedarf.schluessel)}
              onChange={(patch) => updateBedarf(bedarf.schluessel, patch)}
              onClearAuto={() => {
                const id = dienstbedarfIdMap[bedarf.schluessel] ?? bedarf.dienstbedarfId
                if (id !== null) onClearAutoBereich({ dienstbedarfId: id })
              }}
              onPinAuto={onPinAuto}
            />
          ))
        )}
      </div>

      <Modal
        open={editorOffen}
        onClose={() => setEditorOffen(false)}
        title="Gottesdienst bearbeiten"
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <GottesdienstDetailsForm
            idPrefix={`gottesdienst-${gottesdienst.id}`}
            pfarreiId={pfarreiId}
            jahr={jahr}
            monat={monat}
            datum={datum}
            setDatum={setDatum}
            uhrzeit={uhrzeit}
            setUhrzeit={setUhrzeit}
            name={name}
            setName={setName}
            notiz={notiz}
            setNotiz={setNotiz}
            bedarfListe={bedarfListe}
            setBedarfListe={setBedarfListe}
            gruppen={gruppen}
            filtertags={filtertags}
            dienstTypen={dienstTypen}
            zeigeFehler
          />

          <div className="flex justify-end border-t border-line pt-4">
            <Button type="button" onClick={() => setEditorOffen(false)}>
              Fertig
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

function NeuerGottesdienstModal({
  pfarreiId,
  miniplanId,
  jahr,
  monat,
  gruppen,
  filtertags,
  dienstTypen,
  open,
  onClose,
  onCreated,
}: {
  pfarreiId: number
  miniplanId: number
  jahr: number
  monat: number
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
  dienstTypen: DienstTyp[]
  open: boolean
  onClose: () => void
  onCreated: (gottesdienstId: number) => void
}) {
  const [datum, setDatum] = useState('')
  const [uhrzeit, setUhrzeit] = useState('')
  const [name, setName] = useState('')
  const [notiz, setNotiz] = useState('')
  const [bedarfListe, setBedarfListe] = useState<WorkingBedarf[]>([])
  const [error, setError] = useState<string | null>(null)
  const [versucht, setVersucht] = useState(false)

  function reset() {
    setDatum('')
    setUhrzeit('')
    setName('')
    setNotiz('')
    setBedarfListe([])
    setVersucht(false)
    setError(null)
  }

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setVersucht(true)
    const bedarfOhneName = bedarfListe.some(
      (b) => b.dienst_typ_id === null && !(b.name ?? '').trim(),
    )
    if (!datum || !uhrzeit || bedarfOhneName) {
      return
    }
    setError(null)
    try {
      const erstellt = await gottesdienstErstellen(pfarreiId, miniplanId, {
        datum,
        uhrzeit,
        name,
        notiz: notiz.trim() ? notiz : null,
        dienstbedarf: bedarfListe.map((bedarf) => zuEingabe(bedarf, [])),
      })
      reset()
      onCreated(erstellt.id)
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Gottesdienstes'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Neuer Gottesdienst"
      maxWidth="max-w-2xl"
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <form onSubmit={handleCreate} aria-label="Gottesdienst anlegen" className="flex flex-col gap-4">
        <GottesdienstDetailsForm
          idPrefix="neuer-gottesdienst"
          pfarreiId={pfarreiId}
          jahr={jahr}
          monat={monat}
          datum={datum}
          setDatum={setDatum}
          uhrzeit={uhrzeit}
          setUhrzeit={setUhrzeit}
          name={name}
          setName={setName}
          notiz={notiz}
          setNotiz={setNotiz}
          bedarfListe={bedarfListe}
          setBedarfListe={setBedarfListe}
          gruppen={gruppen}
          filtertags={filtertags}
          dienstTypen={dienstTypen}
          zeigeFehler={versucht}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit">
            <Plus className="h-4 w-4" />
            Anlegen
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function FreitextSection({
  pfarreiId,
  miniplan,
  readonly,
  onSaved,
  onDraftChange,
  onStatusChange,
}: {
  pfarreiId: number
  miniplan: Miniplan
  readonly: boolean
  onSaved: (miniplan: Miniplan) => void
  onDraftChange: (veranstaltungen: string, ankuendigungen: string) => void
  onStatusChange: (status: SpeicherStatus) => void
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
    onStatusChange(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (istErstesRendern.current) {
      istErstesRendern.current = false
      return
    }
    if (readonly) return
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
        description="Erscheinen unterhalb des Plans auf dem PDF."
        action={status !== 'gespeichert' && <StatusAnzeige status={status} />}
      />
      <div className="flex flex-col gap-4 p-5">
        <div>
          <Label htmlFor="miniplan-veranstaltungen">Veranstaltungen</Label>
          <MarkdownTextarea
            id="miniplan-veranstaltungen"
            value={veranstaltungen}
            onChange={setVeranstaltungen}
            rows={3}
            disabled={readonly}
          />
        </div>
        <div>
          <Label htmlFor="miniplan-ankuendigungen">Ankündigungen</Label>
          <MarkdownTextarea
            id="miniplan-ankuendigungen"
            value={ankuendigungen}
            onChange={setAnkuendigungen}
            rows={3}
            disabled={readonly}
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
  // Nach jedem Autosave lädt die Seite den Plan neu, wodurch `eingabe` ein neues Objekt mit
  // identischem Inhalt wird - der Vergleich erspart die zweite, überflüssige Typst-Kompilierung.
  const letzteEingabe = useRef<string | null>(null)

  useEffect(() => {
    const eingabeJson = JSON.stringify(eingabe)
    if (eingabeJson === letzteEingabe.current) return
    let abgebrochen = false
    setLadend(true)
    const timer = setTimeout(() => {
      miniplanVorschau(pfarreiId, miniplanId, eingabe).then((ergebnis) => {
        if (abgebrochen) return
        // Erst nach erfolgreich angewendetem Ergebnis als "aktuell" markieren - sonst würde ein
        // zwischenzeitlich abgebrochener Aufruf (abgebrochen=true, s.u.) fälschlich als erledigt
        // gelten und ein späterer Effect-Lauf mit demselben Inhalt gar keinen neuen Request mehr
        // auslösen, obwohl `pdfDaten`/`ladend` nie aktualisiert wurden (Vorschau bliebe für immer
        // auf "wird geladen" stehen).
        letzteEingabe.current = eingabeJson
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
        <PdfViewer data={pdfDaten} className="w-full min-h-0 flex-1" />
      </div>
    </Card>
  )
}

// Konfiguration der automatischen Zuteilung ("Füllen") als Popover am Füllen-Button - eigener
// Endpunkt statt Teil des Freitext-Autosaves, damit sich beide unabhängig ändern lassen.
function ZuteilungEinstellungenPopover({
  open,
  onClose,
  anchorRef,
  miniplan,
  onSave,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  miniplan: Miniplan
  onSave: (einstellungen: ZuteilungEinstellungen) => void | Promise<void>
}) {
  const [fairness, setFairness] = useState(miniplan.fairness_gewicht)
  const [mindestabstand, setMindestabstand] = useState(miniplan.mindestabstand_tage)
  const [mixing, setMixing] = useState(miniplan.mixing_gewicht)
  const [wiederholung, setWiederholung] = useState(miniplan.wiederholung_gewicht)

  useEffect(() => {
    if (!open) return
    setFairness(miniplan.fairness_gewicht)
    setMindestabstand(miniplan.mindestabstand_tage)
    setMixing(miniplan.mixing_gewicht)
    setWiederholung(miniplan.wiederholung_gewicht)
  }, [open, miniplan])

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} title="Auto-Fill-Einstellungen" width={340}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            fairness_gewicht: fairness,
            mindestabstand_tage: mindestabstand,
            mixing_gewicht: mixing,
            wiederholung_gewicht: wiederholung,
          })
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <Label htmlFor="einstellung-fairness" hint="0 = aus">
            Fairness-Stärke
          </Label>
          <Input
            id="einstellung-fairness"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={fairness}
            onChange={(e) => setFairness(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="einstellung-abstand" hint="Tage">
            Mindestabstand zwischen Diensten
          </Label>
          <Input
            id="einstellung-abstand"
            type="number"
            min={0}
            max={31}
            value={mindestabstand}
            onChange={(e) => setMindestabstand(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="einstellung-mixing" hint="0 = aus">
            Teams durchmischen
          </Label>
          <Input
            id="einstellung-mixing"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={mixing}
            onChange={(e) => setMixing(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Höher = seltener dieselben Minis gemeinsam einteilen.
          </p>
        </div>
        <div>
          <Label htmlFor="einstellung-wiederholung" hint="0 = aus">
            Feste Zuteilung bevorzugen
          </Label>
          <Input
            id="einstellung-wiederholung"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={wiederholung}
            onChange={(e) => setWiederholung(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Höher = Minis bleiben eher bei demselben wiederkehrenden Dienst (Gegenteil von
            Durchmischen).
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" size="sm">
            Speichern
          </Button>
        </div>
      </form>
    </Popover>
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
  const [neuesterGottesdienstId, setNeuesterGottesdienstId] = useState<number | null>(null)
  const [neuGottesdienstOffen, setNeuGottesdienstOffen] = useState(false)
  const [freitextDraft, setFreitextDraft] = useState<{
    veranstaltungen: string
    ankuendigungen: string
  } | null>(null)
  const [kartenStatus, setKartenStatus] = useState<Record<number, SpeicherStatus>>({})
  const [freitextStatus, setFreitextStatus] = useState<SpeicherStatus>('gespeichert')
  const [statusWirdGeaendert, setStatusWirdGeaendert] = useState(false)
  const [downloadFehler, setDownloadFehler] = useState<string | null>(null)
  const [fuelltGerade, setFuelltGerade] = useState(false)
  const [einstellungenOffen, setEinstellungenOffen] = useState(false)
  const fuellenButtonRef = useRef<HTMLButtonElement>(null)
  // Jede Gottesdienst-Karte hält ihre Zuweisungen in eigenem State (nur beim ersten Rendern aus den
  // Props übernommen) - nach "Füllen"/"Leeren"/Tauschen/Fixieren ändert sich das serverseitig, ohne
  // dass die Karten das von selbst bemerken. Ein Revisions-Zähler im Karten-`key` erzwingt daher
  // einen Remount mit den frisch geladenen Zuweisungen.
  const [zuteilungsRevision, setZuteilungsRevision] = useState(0)
  const { showToast } = useToast()
  const dndSensoren = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const reload = useCallback(() => {
    miniplanDetail(id, planId).then(setMiniplan)
  }, [id, planId])

  // Von "Füllen", "Leeren" und den Drag-Aktionen (Tauschen/Fixieren) gemeinsam genutzt: alle ändern
  // Zuweisungen serverseitig, ohne dass die betroffenen Karten das selbst bemerken.
  function refreshNachMutation(aktualisiert: Miniplan) {
    setMiniplan(aktualisiert)
    setZuteilungsRevision((revision) => revision + 1)
  }

  async function handleFuellen() {
    setFuelltGerade(true)
    try {
      const aktualisiert = await miniplanFuellen(id, planId)
      refreshNachMutation(aktualisiert)
      showToast('Miniplan automatisch befüllt')
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim automatischen Befüllen'), 'error')
    } finally {
      setFuelltGerade(false)
    }
  }

  async function handleEinstellungenSpeichern(einstellungen: ZuteilungEinstellungen) {
    try {
      const aktualisiert = await miniplanZuteilungEinstellungenSetzen(id, planId, einstellungen)
      setMiniplan(aktualisiert)
      setEinstellungenOffen(false)
      showToast('Auto-Fill-Einstellungen gespeichert')
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Speichern der Einstellungen'), 'error')
    }
  }

  async function handleClearAuto(bereich: { gottesdienstId?: number; dienstbedarfId?: number } = {}) {
    try {
      const aktualisiert = await miniplanZuweisungenLeeren(id, planId, bereich)
      refreshNachMutation(aktualisiert)
      showToast('Automatische Zuweisungen geleert')
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Leeren'), 'error')
    }
  }

  async function handlePinAuto(zuweisungId: number) {
    try {
      const aktualisiert = await miniplanZuweisungFixieren(id, planId, zuweisungId, true)
      refreshNachMutation(aktualisiert)
      showToast('Zuweisung fest übernommen')
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Fixieren'), 'error')
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const aktivDaten = event.active.data.current as ZuweisungDragData | undefined
    const zielDaten = event.over?.data.current as ZuweisungDragData | undefined
    if (!aktivDaten || !zielDaten) return
    if (zielDaten.zuweisungId === aktivDaten.zuweisungId) return
    miniplanZuweisungenTauschen(id, planId, aktivDaten.zuweisungId, zielDaten.zuweisungId)
      .then((aktualisiert) => {
        refreshNachMutation(aktualisiert)
        showToast('Zuweisungen getauscht')
      })
      .catch((err) => showToast(fehlerText(err, 'Fehler beim Tauschen'), 'error'))
  }

  async function handleStatusWechsel(neuerStatus: 'abgeschlossen' | 'in_bearbeitung') {
    setStatusWirdGeaendert(true)
    try {
      const aktualisiert = await miniplanStatusAendern(id, planId, neuerStatus)
      setMiniplan(aktualisiert)
      showToast(
        neuerStatus === 'abgeschlossen' ? 'Miniplan abgeschlossen' : 'Miniplan wieder geöffnet',
      )
    } catch (err) {
      showToast(fehlerText(err, 'Fehler beim Ändern des Status'), 'error')
    } finally {
      setStatusWirdGeaendert(false)
    }
  }

  async function handleDownload() {
    if (!miniplan) return
    setDownloadFehler(null)
    try {
      await miniplanPdfHerunterladen(id, miniplan)
    } catch (err) {
      setDownloadFehler(err instanceof Error ? err.message : 'PDF konnte nicht heruntergeladen werden')
    }
  }

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

  const handleKartenStatusChange = useCallback(
    (gottesdienstId: number, status: SpeicherStatus) => {
      setKartenStatus((aktuell) => ({ ...aktuell, [gottesdienstId]: status }))
    },
    [],
  )

  // Nur Statusmeldungen noch existierender Gottesdienste zählen (gelöschte Karten hinterlassen
  // sonst veraltete Einträge in der Map).
  const speicherStatus = useMemo(() => {
    if (!miniplan) return 'gespeichert' as SpeicherStatus
    const kartenStatusListe = miniplan.gottesdienste.map(
      (gd) => kartenStatus[gd.id] ?? 'gespeichert',
    )
    return gesamtStatus([...kartenStatusListe, freitextStatus])
  }, [miniplan, kartenStatus, freitextStatus])

  useEffect(() => {
    if (speicherStatus === 'gespeichert') return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [speicherStatus])

  const hatAutoZuweisungen = useMemo(
    () =>
      miniplan?.gottesdienste.some((gd) =>
        gd.dienstbedarf.some((b) => b.zuweisungen.some((z) => !z.manuell_fixiert)),
      ) ?? false,
    [miniplan],
  )

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
      <AppShell wide pfarreiId={id}>
        <p className="text-ink-soft">Lade Miniplan…</p>
      </AppShell>
    )
  }

  // Ein abgeschlossener Plan bleibt unverändert, bis er über den Status-Button wieder geöffnet
  // wird - nur dieser Übergang selbst ist weiterhin erlaubt (siehe handleStatusWechsel).
  const readonly = miniplan.status === 'abgeschlossen'

  return (
    <AppShell wide pfarreiId={id}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-3xl font-semibold text-ink">
            Miniplan {monatsName(miniplan.monat)} {miniplan.jahr}
          </h1>
          <Badge tone={miniplan.status === 'abgeschlossen' ? 'pine' : 'neutral'}>
            {miniplan.status === 'abgeschlossen' ? 'Abgeschlossen' : 'In Bearbeitung'}
          </Badge>
          {readonly && (
            <span className="text-sm text-ink-faint">
              Schreibgeschützt – zum Bearbeiten wieder öffnen
            </span>
          )}
          <StatusAnzeige status={speicherStatus} className="text-sm" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!readonly && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNeuGottesdienstOffen(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              Gottesdienst
            </Button>
          )}
          {!readonly && (
            <Button
              ref={fuellenButtonRef}
              variant="secondary"
              size="sm"
              disabled={fuelltGerade || miniplan.gottesdienste.length === 0}
              onClick={handleFuellen}
            >
              <Wand2 className="h-4 w-4" />
              {fuelltGerade ? 'Befüllt…' : 'Füllen'}
            </Button>
          )}
          {!readonly && (
            <IconButton
              label="Auto-Fill-Einstellungen"
              onClick={() => setEinstellungenOffen((o) => !o)}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
          )}
          {!readonly && hatAutoZuweisungen && (
            <Button variant="secondary" size="sm" onClick={() => handleClearAuto()}>
              <Eraser className="h-4 w-4" />
              Auto leeren
            </Button>
          )}
          {miniplan.status === 'abgeschlossen' ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                PDF herunterladen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={statusWirdGeaendert}
                onClick={() => handleStatusWechsel('in_bearbeitung')}
              >
                Wieder öffnen
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={statusWirdGeaendert}
              onClick={() => handleStatusWechsel('abgeschlossen')}
            >
              Plan abschließen
            </Button>
          )}
        </div>
      </div>
      <ZuteilungEinstellungenPopover
        open={einstellungenOffen}
        onClose={() => setEinstellungenOffen(false)}
        anchorRef={fuellenButtonRef}
        miniplan={miniplan}
        onSave={handleEinstellungenSpeichern}
      />
      {downloadFehler && (
        <div className="mt-4">
          <Alert>{downloadFehler}</Alert>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] lg:items-start">
        <DndContext sensors={dndSensoren} onDragEnd={handleDragEnd}>
        <div className="flex min-w-0 flex-col gap-6">
          {miniplan.gottesdienste.map((gottesdienst) => (
            <GottesdienstKarte
              key={`${gottesdienst.id}-${zuteilungsRevision}`}
              gottesdienst={gottesdienst}
              pfarreiId={id}
              miniplanId={planId}
              jahr={miniplan.jahr}
              monat={miniplan.monat}
              readonly={readonly}
              gruppen={gruppen}
              minis={minis}
              dienstTypen={dienstTypen}
              filtertags={filtertags}
              onReload={reload}
              onDraftChange={handleGottesdienstDraftChange}
              onStatusChange={handleKartenStatusChange}
              onClearAutoBereich={handleClearAuto}
              onPinAuto={handlePinAuto}
              onDuplicated={(gottesdienstId) => {
                setNeuesterGottesdienstId(gottesdienstId)
                reload()
              }}
              oeffneEditor={gottesdienst.id === neuesterGottesdienstId}
              onEditorGeoeffnet={(gid) =>
                setNeuesterGottesdienstId((cur) => (cur === gid ? null : cur))
              }
            />
          ))}

          {miniplan.gottesdienste.length === 0 && (
            <Card className="animate-rise">
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-sm text-ink-soft">Noch keine Gottesdienste angelegt.</p>
                {!readonly && (
                  <Button type="button" onClick={() => setNeuGottesdienstOffen(true)}>
                    <CalendarPlus className="h-4 w-4" />
                    Ersten Gottesdienst anlegen
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Zusätzlicher, stets sichtbarer Einstiegspunkt am Ende der Liste - der Toolbar-Button
              oben bleibt (nützlich bei langer, gescrollter Liste), ist danach aber leicht aus dem
              Blick, sobald schon Gottesdienste existieren. */}
          {!readonly && miniplan.gottesdienste.length > 0 && (
            <button
              type="button"
              onClick={() => setNeuGottesdienstOffen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-soft transition-colors hover:border-pine hover:bg-pine-tint hover:text-pine-dark"
            >
              <CalendarPlus className="h-4 w-4" />
              Gottesdienst hinzufügen
            </button>
          )}

          <FreitextSection
            pfarreiId={id}
            miniplan={miniplan}
            readonly={readonly}
            onSaved={setMiniplan}
            onDraftChange={handleFreitextDraftChange}
            onStatusChange={setFreitextStatus}
          />
        </div>
        </DndContext>

        <div className="min-w-0">
          <VorschauPanel pfarreiId={id} miniplanId={planId} eingabe={vorschauEingabe} />
        </div>
      </div>

      <NeuerGottesdienstModal
        pfarreiId={id}
        miniplanId={planId}
        jahr={miniplan.jahr}
        monat={miniplan.monat}
        gruppen={gruppen}
        filtertags={filtertags}
        dienstTypen={dienstTypen}
        open={neuGottesdienstOffen}
        onClose={() => setNeuGottesdienstOffen(false)}
        onCreated={() => {
          setNeuGottesdienstOffen(false)
          reload()
        }}
      />
    </AppShell>
  )
}
