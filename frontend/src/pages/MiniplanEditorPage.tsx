import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
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
  Check,
  Copy,
  Download,
  Eraser,
  Eye,
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
import { fehlerText } from '../api/client'
import type { GruppenAnforderung } from '../api/dienstTypen'
import { dienstTypenListe, type DienstTyp } from '../api/dienstTypen'
import { filtertagsListe, type Filtertag as FiltertagDef } from '../api/filtertags'
import {
  gottesdienstErstellen,
  gottesdienstLoeschen,
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
  miniplanMiniLimitEntfernen,
  miniplanMiniLimitSetzen,
  miniplanPdfHerunterladen,
  miniplanStatusAendern,
  miniplanVorschau,
  miniplanZuweisungenLeeren,
  miniplanZuweisungFixieren,
  miniplanZuweisungenTauschen,
  miniplanZuteilungEinstellungenSetzen,
  ZUTEILUNG_DEFAULTS,
  type MiniLimit,
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
import { Collapse } from '../components/ui/Collapse'
import { DateInput } from '../components/ui/DateInput'
import {
  CheckboxChip,
  Input,
  Label,
  Select,
  SliderWithNumberInput,
} from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { MarkdownTextarea } from '../components/ui/MarkdownTextarea'
import { Modal } from '../components/ui/Modal'
import { PdfViewer } from '../components/ui/PdfViewer'
import { Popover } from '../components/ui/Popover'
import { TimeInput } from '../components/ui/TimeInput'
import { useToast } from '../components/ui/useToast'
import { formatDatumMitWochentag, monatsName } from '../lib/datum'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import {
  AUTOSAVE_DEBOUNCE_MS,
  bedarfAusDienstTyp,
  bedarfFreitext,
  gesamtStatus,
  useGottesdienstAutosave,
  zuEingabe,
  type GottesdienstDraft,
  type SpeicherStatus,
  type WorkingBedarf,
} from './useGottesdienstAutosave'

// Zählt unbesetzte Stellen über den ganzen Plan - harte Constraints (Gruppen-Mindestanzahl,
// Filtertags, Verfügbarkeit) können beim automatischen Füllen dazu führen, dass Stellen offen
// bleiben; ohne diesen Hinweis müsste man jede Karte einzeln nach weinroten "offen"-Chips absuchen.
function offeneStellenAnzahl(plan: Miniplan): number {
  return plan.gottesdienste.reduce(
    (summe, gd) =>
      summe +
      gd.dienstbedarf.reduce(
        (s, bedarf) => s + Math.max(0, bedarf.anzahl - bedarf.zuweisungen.length),
        0,
      ),
    0,
  )
}

// Für den per-Gottesdienst-Revisions-Zähler Tauschen/Fixieren/Leeren eines einzelnen
// Dienstbedarfs geben nur eine Zuweisungs- bzw. Dienstbedarf-ID mit, nicht die Gottesdienst-ID
// selbst. Dienstbedarf-Zeilen behalten ihre ID über diese Mutationen hinweg (anders als beim
// Autosave, das die komplette Liste ersetzt), daher kann hier sicher im *alten* Planstand gesucht
// werden, bevor die Mutation angewendet wird.
function gottesdienstIdFuerDienstbedarf(plan: Miniplan, dienstbedarfId: number): number | null {
  for (const gd of plan.gottesdienste) {
    if (gd.dienstbedarf.some((b) => b.id === dienstbedarfId)) return gd.id
  }
  return null
}

function gottesdienstIdFuerZuweisung(plan: Miniplan, zuweisungId: number): number | null {
  for (const gd of plan.gottesdienste) {
    if (gd.dienstbedarf.some((b) => b.zuweisungen.some((z) => z.id === zuweisungId))) return gd.id
  }
  return null
}

// Für die Fokus-Wiederherstellung nach einer per Tastatur ausgeführten Vertauschung: liefert die
// Mini-ID der (noch alten, vor dem Tauschen gültigen) Zuweisungs-Zeile.
function miniIdFuerZuweisung(plan: Miniplan, zuweisungId: number): number | null {
  for (const gd of plan.gottesdienste) {
    for (const bedarf of gd.dienstbedarf) {
      const treffer = bedarf.zuweisungen.find((z) => z.id === zuweisungId)
      if (treffer) return treffer.mini.id
    }
  }
  return null
}

// Nach einem per Tastatur ausgeführten Tausch verliert der aktivierte Chip seinen DOM-Knoten (neue
// Zuweisungs-ID, siehe Kommentar an `tauschDurchfuehren`) - der Fokus fiele sonst auf `document.body`
// zurück. `requestAnimationFrame` statt eines synchronen Aufrufs, da `setMiniplan` (in
// `refreshNachMutation`) den DOM-Update erst nach dem nächsten Commit/Paint fertigstellt.
function focusChipFuerMini(dienstbedarfId: number, miniId: number) {
  requestAnimationFrame(() => {
    const ziel = document.querySelector<HTMLElement>(
      `[data-dienstbedarf-id="${dienstbedarfId}"][data-mini-id="${miniId}"]`,
    )
    ziel?.focus()
  })
}

function StatusAnzeige({
  status,
  className = 'text-xs',
}: {
  status: SpeicherStatus
  className?: string
}) {
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
  return (
    <span className={`${className} transition-colors duration-300 ${farbe[status]}`}>
      {text[status]}
    </span>
  )
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
        (draft.serverZuweisungenBySchluessel[b.schluessel] ?? []).filter((z) => !z.manuell_fixiert),
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
  istBeimTauschen = false,
  keyboardSwapAktiv = false,
  onKeyboardAktivieren,
}: {
  name: string
  tone: 'fest' | 'auto'
  dienstbedarfId: number | null
  zuweisung: DienstbedarfZuweisung | null
  readonly?: boolean
  onRemove?: () => void
  onPin?: () => void
  // der Tauschen-Request dieses Chips läuft gerade (siehe `tauschtGerade` in
  // `MiniplanEditorPage`) - dimmt ihn und sperrt weitere Interaktion, solange die Antwort aussteht.
  istBeimTauschen?: boolean
  // dieser Chip ist gerade die per Space/Enter ausgewählte Tausch-Quelle.
  keyboardSwapAktiv?: boolean
  onKeyboardAktivieren?: (daten: ZuweisungDragData) => void
}) {
  const dragData: ZuweisungDragData | undefined =
    !readonly && zuweisung && dienstbedarfId !== null
      ? { zuweisungId: zuweisung.id, dienstbedarfId, manuellFixiert: zuweisung.manuell_fixiert }
      : undefined
  const dragId = zuweisung ? `zuweisung-${zuweisung.id}` : undefined
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: dragId ?? 'zuweisung-unbekannt',
    data: dragData,
    disabled: !dragData,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dragId ?? 'zuweisung-unbekannt-drop',
    data: dragData,
    disabled: !dragData,
  })

  // dnd-kits eingebauter `KeyboardSensor` setzt eine sortierbare Liste voraus und passt
  // nicht auf dieses Layout mit beliebigen Drop-Zielen (siehe Kommentar an `dndSensoren`) - Space/
  // Enter deshalb hier manuell auf "Auswählen, dann Ziel aktivieren" umgelenkt, statt einen Drag zu
  // simulieren. Tabindex/Rolle bewusst selbst gesetzt statt auf dnd-kits `attributes` verlassen, da
  // die nur mit einem registrierten `KeyboardSensor` zuverlässig gesetzt werden.
  function handleKeyDown(event: React.KeyboardEvent) {
    if (!dragData || !onKeyboardAktivieren) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      onKeyboardAktivieren(dragData)
    }
  }

  return (
    <span
      data-testid={`chip-${tone}`}
      // Stabile Identifikation für die Fokus-Wiederherstellung nach einem per Tastatur
      // ausgeführten Tausch (`focusChipFuerMini`) - die Zuweisungs-ID selbst wechselt beim
      // Tauschen (Zeilen werden neu angelegt), Dienstbedarf- und Mini-ID bleiben stabil.
      data-dienstbedarf-id={dienstbedarfId ?? undefined}
      data-mini-id={zuweisung?.mini.id}
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      {...(dragData ? { ...listeners, ...attributes } : {})}
      tabIndex={dragData ? 0 : undefined}
      role={dragData ? 'button' : undefined}
      aria-pressed={dragData ? keyboardSwapAktiv : undefined}
      title={dragData ? 'Leertaste/Enter: zum Tauschen auswählen, Escape: abbrechen' : undefined}
      onKeyDown={handleKeyDown}
      className={`inline-flex w-fit shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        tone === 'auto'
          ? 'border-dashed border-gold-dark/50 bg-gold-tint text-gold-dark'
          : 'border-pine bg-pine-tint text-pine-dark'
      } ${dragData ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''} ${
        isOver ? 'ring-2 ring-pine' : ''
      } ${keyboardSwapAktiv ? 'ring-2 ring-pine ring-offset-1' : ''} ${
        istBeimTauschen ? 'pointer-events-none opacity-40' : ''
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
function dienstEinschraenkungen(
  bedarf: WorkingBedarf,
  gruppen: Gruppe[],
  filtertags: FiltertagDef[],
): string[] {
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
  onChange,
  onClearAuto,
  onPinAuto,
  tauschtGerade,
  keyboardSwapQuelle,
  onChipAktivieren,
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
  onChange: (patch: Partial<WorkingBedarf>) => void
  onClearAuto: () => void
  onPinAuto: (zuweisungId: number) => void
  tauschtGerade: Set<number>
  keyboardSwapQuelle: ZuweisungDragData | null
  onChipAktivieren: (daten: ZuweisungDragData) => void
}) {
  function toggleMini(miniId: number) {
    onChange({
      fixierteMiniIds: bedarf.fixierteMiniIds.includes(miniId)
        ? bedarf.fixierteMiniIds.filter((id) => id !== miniId)
        : [...bedarf.fixierteMiniIds, miniId],
    })
  }

  // Die Mini-Suche ist standardmäßig verborgen (weniger Unruhe, wenn mehrere Dienste
  // gleichzeitig sichtbar sind) - ein Klick auf einen "offen"-Platzhalter blendet sie ein.
  const [sucheOffen, setSucheOffen] = useState(false)

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
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium text-ink">{anzeigeName}</span>
          <span className="text-xs text-ink-faint">
            {belegteMiniIds.size}/{bedarf.anzahl}
          </span>
          {einschraenkungen.length > 0 && (
            <span className="text-xs text-ink-faint">· {einschraenkungen.join(', ')}</span>
          )}
        </div>
        {!readonly && autoZuweisungen.length > 0 && (
          <InlineConfirmButton
            onConfirm={onClearAuto}
            confirmLabel="Automatische Zuweisungen leeren?"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ink-faint transition-colors hover:bg-wine-tint hover:text-wine"
              >
                <Eraser className="h-3.5 w-3.5" />
                Auto leeren
              </button>
            )}
          />
        )}
      </div>
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
              istBeimTauschen={tauschtGerade.has(zuweisung?.id ?? -1)}
              keyboardSwapAktiv={
                zuweisung !== null && keyboardSwapQuelle?.zuweisungId === zuweisung.id
              }
              onKeyboardAktivieren={onChipAktivieren}
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
            istBeimTauschen={tauschtGerade.has(zuweisung.id)}
            keyboardSwapAktiv={keyboardSwapQuelle?.zuweisungId === zuweisung.id}
            onKeyboardAktivieren={onChipAktivieren}
          />
        ))}
        {/* "offen"-Platzhalter sind der einzige Einstiegspunkt zur Suche - als Button statt
                reiner Anzeige, damit die Suche nicht dauerhaft sichtbar sein muss (weniger
                Unruhe bei vielen Diensten). */}
        {Array.from({ length: offeneStellen }, (_, i) =>
          readonly ? (
            <span
              key={`offen-${i}`}
              className="inline-flex items-center rounded-full border border-dashed border-wine/50 bg-wine-tint/40 px-3 py-1.5 text-sm text-wine"
            >
              offen
            </span>
          ) : (
            <button
              key={`offen-${i}`}
              type="button"
              onClick={() => setSucheOffen((wert) => !wert)}
              aria-expanded={sucheOffen}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-wine/50 bg-wine-tint/40 px-3 py-1.5 text-sm text-wine transition-colors hover:bg-wine-tint"
            >
              offen
              <Pencil className="h-3 w-3" />
            </button>
          ),
        )}
      </div>
      {!readonly && (
        <Collapse open={sucheOffen && !voll}>
          <div className="mt-2">
            <MiniAdder
              minis={minis}
              belegteMiniIds={gottesdienstBelegteMiniIds}
              disabled={voll}
              onAdd={(miniId) => toggleMini(miniId)}
            />
          </div>
        </Collapse>
      )}
    </div>
  )
}

// Wie viele automatisch zugewiesene Minis eine Senkung der Anzahl auf `neu` beim nächsten Autosave
// stillschweigend abschneiden würde (siehe `kapazitaet`-Kürzung von `auto_mini_ids` in
// `useGottesdienstAutosave.zuEingabe`) - fixierte Minis werden dort nie gekürzt, nur die
// automatischen füllen die verbleibende Kapazität nach Abzug der fixierten auf.
function autoVerlustBeiAnzahl(neu: number, fixierteAnzahl: number, autoAnzahl: number): number {
  return Math.max(0, autoAnzahl - Math.max(0, neu - fixierteAnzahl))
}

// Strukturelle Einstellungen eines Dienstes (Name/Anzahl/Einschränkungen) – im Bearbeiten-Modal,
// getrennt von der stets sichtbaren Belegung.
function DienstbedarfEinstellungen({
  bedarf,
  gruppen,
  filtertags,
  autoAnzahl = 0,
  onChange,
  onRemove,
}: {
  bedarf: WorkingBedarf
  gruppen: Gruppe[]
  filtertags: FiltertagDef[]
  // Anzahl der aktuell automatisch zugewiesenen Minis dieses Bedarfs (siehe `autoVerlustBeiAnzahl`)
  // - fehlt in `NeuerGottesdienstModal` (frischer Gottesdienst kann noch keine Auto-Zuweisungen
  // haben), daher optional mit Default 0.
  autoAnzahl?: number
  onChange: (patch: Partial<WorkingBedarf>) => void
  onRemove: () => void
}) {
  // eine Senkung der Anzahl, die automatische Zuweisungen abschneiden würde, wird nicht
  // sofort übernommen, sondern erst nach Bestätigung - vorher passierte das stillschweigend erst
  // beim nächsten Autosave (siehe `zuEingabe`), ohne dass der Nutzer je gesehen hätte, wie viele
  // Minis dadurch verloren gehen.
  const [pendingAnzahl, setPendingAnzahl] = useState<number | null>(null)

  function handleAnzahlEingabe(rohWert: string) {
    const neu = Number(rohWert)
    const verlust = autoVerlustBeiAnzahl(neu, bedarf.fixierteMiniIds.length, autoAnzahl)
    if (verlust > 0) {
      setPendingAnzahl(neu)
    } else {
      setPendingAnzahl(null)
      onChange({ anzahl: neu })
    }
  }

  function bestaetigeAnzahl() {
    if (pendingAnzahl === null) return
    onChange({ anzahl: pendingAnzahl })
    setPendingAnzahl(null)
  }

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
      {/* Zwei Reihen auf schmalen Bildschirmen (Name bekommt die volle Breite, sonst wird er bei
          wenig Platz neben Anzahl/Auf-Plan/Löschen auf ein paar Zeichen zusammengequetscht) - ab
          `sm` per `contents` wieder eine einzige Grid-Zeile wie bisher. */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-3 sm:grid-cols-[auto_1fr_auto_auto_auto]">
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
          <span className="min-w-0 text-sm font-medium text-ink">{bedarf.dienst_typ_name}</span>
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
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1 sm:contents">
          <div className="flex items-center gap-1.5">
            {/* Bewusst kein `Label` hier: das trägt für die übliche Stapelung (Label über Feld) ein
                `mb-1.5`, das in dieser einzeiligen Anordnung Label und Feld vertikal gegeneinander
                verschieben würde. */}
            <label
              htmlFor={`${bedarf.schluessel}-anzahl`}
              className="shrink-0 text-sm font-medium text-ink-soft"
            >
              Anzahl
            </label>
            <Input
              id={`${bedarf.schluessel}-anzahl`}
              type="number"
              min={0}
              value={pendingAnzahl ?? bedarf.anzahl}
              onChange={(e) => handleAnzahlEingabe(e.target.value)}
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
          <IconButton label="Dienst entfernen" onClick={onRemove} className="h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {pendingAnzahl !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-wine-tint/40 px-2.5 py-1.5">
          <span className="text-xs text-wine">
            {autoVerlustBeiAnzahl(pendingAnzahl, bedarf.fixierteMiniIds.length, autoAnzahl)}{' '}
            automatische Zuweisung
            {autoVerlustBeiAnzahl(pendingAnzahl, bedarf.fixierteMiniIds.length, autoAnzahl) === 1
              ? ''
              : 'en'}{' '}
            {autoVerlustBeiAnzahl(pendingAnzahl, bedarf.fixierteMiniIds.length, autoAnzahl) === 1
              ? 'wird'
              : 'werden'}{' '}
            dadurch entfernt. Anzahl trotzdem auf {pendingAnzahl} senken?
          </span>
          <IconButton label="Bestätigen" tone="danger" onClick={bestaetigeAnzahl}>
            <Check className="h-4 w-4" />
          </IconButton>
          <IconButton label="Abbrechen" onClick={() => setPendingAnzahl(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}

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
  autoAnzahlBySchluessel = {},
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
  // Anzahl automatischer Zuweisungen je Bedarf-Schlüssel, damit `DienstbedarfEinstellungen`
  // vor einer Anzahl-Senkung warnen kann, die welche abschneiden würde - in `NeuerGottesdienstModal`
  // (frischer Gottesdienst, noch keine Zuweisungen möglich) bewusst weggelassen (Default {}).
  autoAnzahlBySchluessel?: Record<string, number>
}) {
  const dndSensoren = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Separater TouchSensor statt PointerSensor: eine reine Distance-Constraint würde auf
    // Touch-Geräten sofort mit dem Scrollen der Seite kollidieren - ein kurzes Long-Press (250ms,
    // mit etwas Toleranz für Zittern) aktiviert den Drag stattdessen erst nach bewusstem Halten,
    // ein kurzes Antippen scrollt weiterhin normal.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
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
                autoAnzahl={autoAnzahlBySchluessel[bedarf.schluessel] ?? 0}
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
  revision,
  onReload,
  onDraftChange,
  onStatusChange,
  onDuplicated,
  onClearAutoBereich,
  onPinAuto,
  oeffneEditor = false,
  onEditorGeoeffnet,
  onBearbeitungChange,
  tauschtGerade,
  keyboardSwapQuelle,
  onChipAktivieren,
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
  // Von der Elternseite nur für tatsächlich betroffene Gottesdienst-IDs erhöhter Zähler (siehe
  // `bumpKartenRevision` in `MiniplanEditorPage`) - steuert, wann `useGottesdienstAutosave` seinen
  // Server-Zuweisungen-Sync-Effekt erneut laufen lässt (siehe Kommentar dort).
  revision: number
  onReload: () => void
  onDraftChange: (gottesdienstId: number, draft: GottesdienstDraft) => void
  onStatusChange: (gottesdienstId: number, status: SpeicherStatus) => void
  onDuplicated: (gottesdienstId: number) => void
  onClearAutoBereich: (bereich: { gottesdienstId?: number; dienstbedarfId?: number }) => void
  onPinAuto: (zuweisungId: number) => void
  oeffneEditor?: boolean
  onEditorGeoeffnet?: (gottesdienstId: number) => void
  // Informiert die Elternseite, solange das Bearbeiten-Modal dieser Karte offen ist -
  // die Elternseite friert die angezeigte Kartenreihenfolge ein, während irgendeine Karte bearbeitet
  // wird, damit ein Datums-Wechsel den Plan nicht schon während der Bearbeitung umsortiert.
  onBearbeitungChange: (gottesdienstId: number, bearbeitungOffen: boolean) => void
  // Zuweisungs-IDs mit gerade laufendem Tauschen-Request (Dimmen der Chips).
  tauschtGerade: Set<number>
  // Tastatur-Tauschen - die aktuell per Space/Enter ausgewählte Quelle (planweit, nicht
  // pro Karte, weil ein Tausch auch über Karten hinweg funktioniert - genau wie beim Maus-DnD über
  // den gemeinsamen `DndContext`) sowie der Aktivierungs-Handler für einen Chip.
  keyboardSwapQuelle: ZuweisungDragData | null
  onChipAktivieren: (daten: ZuweisungDragData) => void
}) {
  const [editorOffen, setEditorOffen] = useState(oeffneEditor)
  const { showToast } = useToast()

  const {
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
    updateBedarf,
    serverZuweisungenMap,
    dienstbedarfIdMap,
    status,
  } = useGottesdienstAutosave({
    gottesdienst,
    pfarreiId,
    miniplanId,
    readonly,
    revision,
    onReload,
    onDraftChange,
    onStatusChange,
  })

  // Frisch angelegte/duplizierte Gottesdienste öffnen den Editor automatisch. Den Auslöser danach
  // sofort zurücksetzen, damit er nicht bei jedem weiteren Rendern erneut greift. Bewusst als
  // Mount-once-Effekt (leeres Dependency-Array): `onEditorGeoeffnet`/`gottesdienst.id` sollen genau
  // einmal beim ersten Rendern geprüft werden, nicht bei jeder späteren Änderung.
  useEffect(() => {
    if (oeffneEditor) onEditorGeoeffnet?.(gottesdienst.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Meldet der Elternseite, solange das Bearbeiten-Modal offen ist (siehe `onBearbeitungChange`-
  // Kommentar an den Props). Cleanup meldet "geschlossen" auch bei einem Unmount mit noch offenem
  // Modal (z.B. Löschen während der Bearbeitung), damit die Elternseite keinen dauerhaft "in
  // Bearbeitung" hängen gebliebenen Eintrag behält.
  useEffect(() => {
    onBearbeitungChange(gottesdienst.id, editorOffen)
    return () => onBearbeitungChange(gottesdienst.id, false)
  }, [editorOffen, gottesdienst.id, onBearbeitungChange])

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

  // für die Anzahl-Senkungs-Warnung in `DienstbedarfEinstellungen`.
  const autoAnzahlBySchluessel = useMemo(() => {
    const eintrag: Record<string, number> = {}
    for (const [schluessel, zuweisungen] of Object.entries(serverZuweisungenMap)) {
      eintrag[schluessel] = zuweisungen.filter((z) => !z.manuell_fixiert).length
    }
    return eintrag
  }, [serverZuweisungenMap])

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

  const hatAuto = bedarfListe.some((b) =>
    (serverZuweisungenMap[b.schluessel] ?? []).some((z) => !z.manuell_fixiert),
  )

  return (
    <Card className="animate-rise" data-testid="gottesdienst-karte">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
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
              onChange={(patch) => updateBedarf(bedarf.schluessel, patch)}
              onClearAuto={() => {
                const id = dienstbedarfIdMap[bedarf.schluessel] ?? bedarf.dienstbedarfId
                if (id !== null) onClearAutoBereich({ dienstbedarfId: id })
              }}
              onPinAuto={onPinAuto}
              tauschtGerade={tauschtGerade}
              keyboardSwapQuelle={keyboardSwapQuelle}
              onChipAktivieren={onChipAktivieren}
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
            autoAnzahlBySchluessel={autoAnzahlBySchluessel}
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
      <form
        onSubmit={handleCreate}
        aria-label="Gottesdienst anlegen"
        className="flex flex-col gap-4"
      >
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
        // `fehlerText` gibt bei einem `ApiError` dessen Server-Nachricht zurück, nicht
        // den Fallback - ohne diesen Präfix wäre ein Speicherfehler der Freitextfelder von einem
        // Gottesdienst-Speicherfehler (gleiche Server-Nachricht möglich, z.B. eine generische
        // Validierungsmeldung) nicht zu unterscheiden.
        showToast(
          `Veranstaltungen/Ankündigungen: ${fehlerText(err, 'Fehler beim Speichern')}`,
          'error',
        )
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
  variant = 'sidebar',
  onClose,
}: {
  pfarreiId: number
  miniplanId: number
  eingabe: MiniplanVorschauEingabe
  // unterhalb von `lg` lebt dieselbe Komponente statt in der sticky Seitenspalte in einem
  // Bottom-Sheet-Overlay (siehe `MiniplanEditorPage`) - dort füllt sie die volle Overlay-Höhe
  // (`h-full` statt eigener `svh`-Höhe) und bekommt einen eigenen Schließen-Button im Header.
  variant?: 'sidebar' | 'sheet'
  onClose?: () => void
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
    <Card
      className={
        variant === 'sheet'
          ? 'flex h-full flex-col rounded-b-none border-b-0 shadow-none'
          : 'animate-rise flex h-[80svh] flex-col lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]'
      }
    >
      <CardHeader
        title="PDF-Vorschau"
        action={
          <div className="flex items-center gap-2">
            {ladend && <span className="text-xs text-ink-faint">Aktualisiert…</span>}
            {variant === 'sheet' && onClose && (
              <IconButton label="Vorschau schließen" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        }
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
// Ausnahme-Zeile für einen einzelnen Mini: eigenes Zahlen-Limit (oder explizit "kein Limit"), das
// nur für diesen Miniplan gilt und alles andere übersteuert (siehe MiniMiniplanLimit im Backend).
// Speichert sofort pro Zeile statt über den "Speichern"-Button der Gewichte - passt zum
// bestehenden granularen Endpunkt-Stil dieser Funktion.
function MiniLimitZeile({
  limit,
  onChange,
  onRemove,
}: {
  limit: MiniLimit
  onChange: (maxEinsaetze: number | null) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{limit.mini_name}</span>
      <Input
        type="number"
        min={0}
        placeholder="kein Limit"
        value={limit.max_einsaetze ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="h-8 !w-24 px-2"
      />
      <IconButton label="Ausnahme entfernen" onClick={onRemove} className="h-7 w-7">
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}

function ZuteilungEinstellungenPopover({
  open,
  onClose,
  anchorRef,
  miniplan,
  minis,
  pfarreiId,
  onSave,
  onMiniLimitsChange,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  miniplan: Miniplan
  minis: Mini[]
  pfarreiId: number
  onSave: (einstellungen: ZuteilungEinstellungen) => void | Promise<void>
  onMiniLimitsChange: (aktualisiert: Miniplan) => void
}) {
  const [fairness, setFairness] = useState(miniplan.fairness_gewicht)
  const [mindestabstand, setMindestabstand] = useState(miniplan.mindestabstand_tage)
  const [mixing, setMixing] = useState(miniplan.mixing_gewicht)
  const [wiederholung, setWiederholung] = useState(miniplan.wiederholung_gewicht)
  const [maxEinsaetze, setMaxEinsaetze] = useState(miniplan.max_einsaetze_standard)
  const [ignoriereMaxEinsaetze, setIgnoriereMaxEinsaetze] = useState(
    miniplan.ignoriere_max_einsaetze,
  )
  const [ignoriereGruppenMindestanzahl, setIgnoriereGruppenMindestanzahl] = useState(
    miniplan.ignoriere_gruppen_mindestanzahl,
  )
  const [ignoriereVerfuegbarkeit, setIgnoriereVerfuegbarkeit] = useState(
    miniplan.ignoriere_verfuegbarkeit,
  )

  useEffect(() => {
    if (!open) return
    setFairness(miniplan.fairness_gewicht)
    setMindestabstand(miniplan.mindestabstand_tage)
    setMixing(miniplan.mixing_gewicht)
    setWiederholung(miniplan.wiederholung_gewicht)
    setMaxEinsaetze(miniplan.max_einsaetze_standard)
    setIgnoriereMaxEinsaetze(miniplan.ignoriere_max_einsaetze)
    setIgnoriereGruppenMindestanzahl(miniplan.ignoriere_gruppen_mindestanzahl)
    setIgnoriereVerfuegbarkeit(miniplan.ignoriere_verfuegbarkeit)
  }, [open, miniplan])

  const miniplanId = miniplan.id
  async function limitSetzen(miniId: number, wert: number | null) {
    onMiniLimitsChange(await miniplanMiniLimitSetzen(pfarreiId, miniplanId, miniId, wert))
  }
  async function limitEntfernen(miniId: number) {
    onMiniLimitsChange(await miniplanMiniLimitEntfernen(pfarreiId, miniplanId, miniId))
  }

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      title="Auto-Fill-Einstellungen"
      width={360}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            fairness_gewicht: fairness,
            mindestabstand_tage: mindestabstand,
            mixing_gewicht: mixing,
            wiederholung_gewicht: wiederholung,
            max_einsaetze_standard: maxEinsaetze,
            ignoriere_max_einsaetze: ignoriereMaxEinsaetze,
            ignoriere_gruppen_mindestanzahl: ignoriereGruppenMindestanzahl,
            ignoriere_verfuegbarkeit: ignoriereVerfuegbarkeit,
          })
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <Label htmlFor="einstellung-fairness" hint="0 = aus">
            Fairness-Stärke
          </Label>
          <SliderWithNumberInput
            id="einstellung-fairness"
            min={0}
            max={20}
            step={0.5}
            value={fairness}
            markerValue={ZUTEILUNG_DEFAULTS.fairness_gewicht}
            onChange={setFairness}
          />
        </div>
        <div>
          <Label htmlFor="einstellung-abstand" hint="Tage">
            Mindestabstand zwischen Diensten
          </Label>
          <SliderWithNumberInput
            id="einstellung-abstand"
            min={0}
            max={31}
            step={1}
            value={mindestabstand}
            markerValue={ZUTEILUNG_DEFAULTS.mindestabstand_tage}
            onChange={setMindestabstand}
          />
        </div>
        <div>
          <Label htmlFor="einstellung-mixing" hint="0 = aus">
            Teams durchmischen
          </Label>
          <SliderWithNumberInput
            id="einstellung-mixing"
            min={0}
            max={20}
            step={0.5}
            value={mixing}
            markerValue={ZUTEILUNG_DEFAULTS.mixing_gewicht}
            onChange={setMixing}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Höher = seltener dieselben Minis gemeinsam einteilen.
          </p>
        </div>
        <div>
          <Label htmlFor="einstellung-wiederholung" hint="0 = aus">
            Feste Zuteilung bevorzugen
          </Label>
          <SliderWithNumberInput
            id="einstellung-wiederholung"
            min={0}
            max={20}
            step={0.5}
            value={wiederholung}
            markerValue={ZUTEILUNG_DEFAULTS.wiederholung_gewicht}
            onChange={setWiederholung}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Höher = Minis bleiben eher bei demselben wiederkehrenden Dienst (Gegenteil von
            Durchmischen).
          </p>
        </div>
        <div className="border-t border-line pt-4">
          <Label htmlFor="einstellung-max-einsaetze" hint="leer = kein Limit">
            Max. Einsätze pro Mini
          </Label>
          <Input
            id="einstellung-max-einsaetze"
            type="number"
            min={0}
            placeholder="kein Limit"
            value={maxEinsaetze ?? ''}
            onChange={(e) => setMaxEinsaetze(e.target.value === '' ? null : Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Gilt für alle Minis ohne eigenes Limit (siehe Mini-Stammdaten) - harte Grenze, die das
            Füllen nie überschreitet.
          </p>
        </div>

        <div className="border-t border-line pt-4">
          <Label
            hint={miniplan.mini_limits.length === 0 ? undefined : `${miniplan.mini_limits.length}`}
          >
            Ausnahmen pro Mini
          </Label>
          <p className="mb-2 text-xs text-ink-faint">
            Überschreibt für einzelne Minis das Limit nur in diesem Plan - auch als "kein Limit",
            selbst wenn der Mini sonst persönlich begrenzt ist.
          </p>
          <div className="flex flex-col gap-1.5">
            {miniplan.mini_limits.map((limit) => (
              <MiniLimitZeile
                key={limit.mini_id}
                limit={limit}
                onChange={(wert) => void limitSetzen(limit.mini_id, wert)}
                onRemove={() => void limitEntfernen(limit.mini_id)}
              />
            ))}
          </div>
          <div className="mt-2">
            <MiniAdder
              minis={minis}
              belegteMiniIds={new Set(miniplan.mini_limits.map((l) => l.mini_id))}
              disabled={false}
              onAdd={(miniId) => void limitSetzen(miniId, 0)}
            />
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <Label>Harte Grenzen ignorieren</Label>
          <p className="mb-2 text-xs text-ink-faint">
            Nutzt die jeweilige harte Regel beim Füllen nicht mehr - nur für Ausnahmefälle.
          </p>
          <div className="flex flex-col gap-2">
            <CheckboxChip
              id="einstellung-ignoriere-max-einsaetze"
              checked={ignoriereMaxEinsaetze}
              onChange={() => setIgnoriereMaxEinsaetze((v) => !v)}
            >
              Max. Einsätze pro Mini
            </CheckboxChip>
            <CheckboxChip
              id="einstellung-ignoriere-gruppen"
              checked={ignoriereGruppenMindestanzahl}
              onChange={() => setIgnoriereGruppenMindestanzahl((v) => !v)}
            >
              Gruppen-Mindestanzahl
            </CheckboxChip>
            <CheckboxChip
              id="einstellung-ignoriere-verfuegbarkeit"
              checked={ignoriereVerfuegbarkeit}
              onChange={() => setIgnoriereVerfuegbarkeit((v) => !v)}
            >
              Verfügbarkeiten
            </CheckboxChip>
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setFairness(ZUTEILUNG_DEFAULTS.fairness_gewicht)
              setMindestabstand(ZUTEILUNG_DEFAULTS.mindestabstand_tage)
              setMixing(ZUTEILUNG_DEFAULTS.mixing_gewicht)
              setWiederholung(ZUTEILUNG_DEFAULTS.wiederholung_gewicht)
              setMaxEinsaetze(ZUTEILUNG_DEFAULTS.max_einsaetze_standard)
              setIgnoriereMaxEinsaetze(ZUTEILUNG_DEFAULTS.ignoriere_max_einsaetze)
              setIgnoriereGruppenMindestanzahl(ZUTEILUNG_DEFAULTS.ignoriere_gruppen_mindestanzahl)
              setIgnoriereVerfuegbarkeit(ZUTEILUNG_DEFAULTS.ignoriere_verfuegbarkeit)
            }}
          >
            Zurücksetzen
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm">
              Speichern
            </Button>
          </div>
        </div>
      </form>
    </Popover>
  )
}

export function MiniplanEditorPage() {
  const { pfarreiId, miniplanId } = useParams<{ pfarreiId: string; miniplanId: string }>()
  const id = Number(pfarreiId)
  const planId = Number(miniplanId)
  // `MiniplanEditorPage` bleibt über Routenwechsel hinweg gemountet (React Router verwendet dieselbe
  // Instanz weiter) - eine spät eintreffende Antwort einer Mutation, die noch für den *vorherigen*
  // Plan lief, darf den inzwischen für den neuen Plan geladenen Stand nicht überschreiben. Ref statt
  // nur `planId` direkt, da der Vergleich beim Auflösen des Requests den zum *Start* des Requests
  // aktiven Plan braucht, nicht den zum jetzigen Render-Zeitpunkt (deshalb zusätzlich pro Aufruf
  // lokal in einer Konstante festgehalten, siehe `tauschDurchfuehren`/`handleFuellen`/
  // `handleClearAuto`/`handlePinAuto`).
  const planIdRef = useRef(planId)
  planIdRef.current = planId

  const [miniplan, setMiniplan] = useState<Miniplan | null>(null)
  useDocumentTitle(miniplan ? `${monatsName(miniplan.monat)} ${miniplan.jahr}` : 'Miniplan')
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [minis, setMinis] = useState<Mini[]>([])
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [filtertags, setFiltertags] = useState<FiltertagDef[]>([])
  const [gottesdienstDrafts, setGottesdienstDrafts] = useState<Record<number, GottesdienstDraft>>(
    {},
  )
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
  const einstellungenButtonRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()
  // pro Gottesdienst erhöhter Zähler statt eines planweiten - jede Karte reagiert (über
  // `useGottesdienstAutosave`) nur auf ihre eigene Revision, nicht auf jede (nach jedem Reload
  // ohnehin neue) Objekt-Referenz. Füllen betrifft potenziell den ganzen Plan (bump alle IDs),
  // Tauschen/Fixieren/gezieltes Leeren nur die tatsächlich betroffene(n) Karte(n).
  const [kartenRevision, setKartenRevision] = useState<Record<number, number>>({})
  // Solange mindestens eine Karte ihr Bearbeiten-Modal offen hat, friert
  // `angezeigteReihenfolge` unten die Sortierung ein - ein Datums-Wechsel im offenen Modal soll den
  // Plan nicht schon während der Bearbeitung umsortieren (die bearbeitete Karte "springt" sonst
  // unter dem Nutzer weg, sobald der Autosave nach dem Reload die neue, servergesorteten Reihenfolge
  // übernimmt).
  const [bearbeitungOffenIds, setBearbeitungOffenIds] = useState<Set<number>>(new Set())
  const [angezeigteReihenfolge, setAngezeigteReihenfolge] = useState<number[]>([])
  // unterhalb von `lg` liegt die PDF-Vorschau nicht mehr sticky neben den Karten, sondern
  // in einem Bottom-Sheet-Overlay, das über diesen Button geöffnet wird - die `lg`+-Seite-an-Seite-
  // Anordnung bleibt unverändert (siehe Grid weiter unten).
  const [mobileVorschauOffen, setMobileVorschauOffen] = useState(false)

  useEffect(() => {
    if (!mobileVorschauOffen) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileVorschauOffen(false)
    }
    document.addEventListener('keydown', handleKey)
    const vorherigesOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = vorherigesOverflow
    }
  }, [mobileVorschauOffen])
  // Zuweisungs-IDs, deren Tauschen-Request gerade läuft - dimmt die beiden betroffenen
  // Chips währenddessen (siehe `ZuweisungsChip`/`tauschDurchfuehren`).
  const [tauschtGerade, setTauschtGerade] = useState<Set<number>>(new Set())
  // Tastatur-Alternative zum Drag-and-Drop-Tauschen ("Auswählen, dann Ziel aktivieren") -
  // hält die per Space/Enter ausgewählte Quelle, bis ein zweiter Chip aktiviert wird (führt den
  // Tausch aus) oder Escape sie verwirft (siehe Effekt unten und `handleChipAktivieren`).
  const [keyboardSwapQuelle, setKeyboardSwapQuelle] = useState<ZuweisungDragData | null>(null)

  useEffect(() => {
    if (!keyboardSwapQuelle) return
    // Capture-Phase, damit ein tatsächlich vorhandener Abbruch hier zuverlässig vor einem
    // eventuell offenen Modal (Bubble-Phase-Listener auf `document`, siehe Modal.tsx) feuert -
    // sonst hinge die Reihenfolge zweier Bubble-Listener auf demselben Ziel vom Mount-Zeitpunkt ab.
    // `stopPropagation` nur, wenn tatsächlich eine Quelle verworfen wurde, damit Escape ein
    // offenes Modal weiterhin normal schließt, solange kein Tausch aussteht.
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setKeyboardSwapQuelle(null)
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [keyboardSwapQuelle])

  const dndSensoren = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Separater TouchSensor statt PointerSensor: eine reine Distance-Constraint würde auf
    // Touch-Geräten sofort mit dem Scrollen der Seite kollidieren - ein kurzes Long-Press (250ms,
    // mit etwas Toleranz für Zittern) aktiviert den Drag stattdessen erst nach bewusstem Halten,
    // ein kurzes Antippen scrollt weiterhin normal.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const reload = useCallback(() => {
    miniplanDetail(id, planId).then(setMiniplan)
  }, [id, planId])

  // Erhöht den Revisions-Zähler nur für die übergebenen Gottesdienst-IDs - der
  // Sync-Effekt in `useGottesdienstAutosave` reagiert ausschließlich darauf, nicht auf jede (nach
  // jedem Reload ohnehin neue) `gottesdienst.dienstbedarf`-Referenz.
  function bumpKartenRevision(ids: Iterable<number>) {
    setKartenRevision((karte) => {
      const aktualisiert = { ...karte }
      for (const gottesdienstId of ids) {
        aktualisiert[gottesdienstId] = (aktualisiert[gottesdienstId] ?? 0) + 1
      }
      return aktualisiert
    })
  }

  // Von "Füllen", "Leeren" und den Drag-Aktionen (Tauschen/Fixieren) gemeinsam genutzt: alle ändern
  // Zuweisungen serverseitig. `GottesdienstKarte` übernimmt die aufgefrischten Zuweisungen über
  // einen eigenen Sync-Effekt aus den Props (kein erzwungener Remount mehr nötig), reagiert also
  // von selbst auf die neuen Props aus `setMiniplan` - aber nur, wenn ihre eigene
  // Revision erhöht wurde. `betroffeneGottesdienstIds` weggelassen (`undefined`) bumpt alle
  // Karten (z.B. Füllen, das potenziell den ganzen Plan betrifft); eine leere Liste bumpt bewusst
  // keine (z.B. reine Einstellungsänderungen ohne Zuweisungs-Auswirkung).
  function refreshNachMutation(aktualisiert: Miniplan, betroffeneGottesdienstIds?: number[]) {
    setMiniplan(aktualisiert)
    if (betroffeneGottesdienstIds === undefined) {
      bumpKartenRevision(aktualisiert.gottesdienste.map((gd) => gd.id))
    } else if (betroffeneGottesdienstIds.length > 0) {
      bumpKartenRevision(betroffeneGottesdienstIds)
    }
  }

  async function handleFuellen() {
    // Schnappschuss der zum Start des Requests aktiven Plan-ID (siehe Kommentar an `planIdRef`
    // oben) - navigiert der Nutzer währenddessen zu einem anderen Miniplan, darf die spät
    // eintreffende Antwort dessen inzwischen geladenen Stand nicht überschreiben.
    const angefordertePlanId = planId
    setFuelltGerade(true)
    try {
      const aktualisiert = await miniplanFuellen(id, planId)
      if (planIdRef.current !== angefordertePlanId) return
      refreshNachMutation(aktualisiert)
      const offen = offeneStellenAnzahl(aktualisiert)
      showToast(
        offen > 0
          ? `Miniplan automatisch befüllt – ${offen} Stelle${offen === 1 ? '' : 'n'} konnte${offen === 1 ? '' : 'n'} nicht besetzt werden. Prüfe Gruppen-Mindestanzahl, Verfügbarkeit und Filtertags der offenen Stellen.`
          : 'Miniplan automatisch befüllt',
      )
    } catch (err) {
      if (planIdRef.current !== angefordertePlanId) return
      showToast(fehlerText(err, 'Fehler beim automatischen Befüllen'), 'error')
    } finally {
      if (planIdRef.current === angefordertePlanId) setFuelltGerade(false)
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

  async function handleClearAuto(
    bereich: { gottesdienstId?: number; dienstbedarfId?: number } = {},
  ) {
    // Für die Typ-Verengung unten (`miniplan` ist während des tatsächlichen Aufrufs immer geladen -
    // alle Aufrufer hängen an JSX, das erst nach dem Ladezustand gerendert wird).
    if (!miniplan) return
    const angefordertePlanId = planId
    try {
      const aktualisiert = await miniplanZuweisungenLeeren(id, planId, bereich)
      if (planIdRef.current !== angefordertePlanId) return
      // Betroffenheit anhand des *alten* `miniplan`-Standes auflösen (Dienstbedarf-IDs bleiben
      // beim Leeren stabil) - planweites Leeren (kein `gottesdienstId`/`dienstbedarfId`) bumpt
      // dagegen alle Karten.
      const betroffen =
        bereich.gottesdienstId !== undefined
          ? [bereich.gottesdienstId]
          : bereich.dienstbedarfId !== undefined
            ? (() => {
                const gid = gottesdienstIdFuerDienstbedarf(miniplan, bereich.dienstbedarfId!)
                return gid !== null ? [gid] : []
              })()
            : undefined
      refreshNachMutation(aktualisiert, betroffen)
      showToast('Automatische Zuweisungen geleert')
    } catch (err) {
      if (planIdRef.current !== angefordertePlanId) return
      showToast(fehlerText(err, 'Fehler beim Leeren'), 'error')
    }
  }

  async function handlePinAuto(zuweisungId: number) {
    if (!miniplan) return
    const angefordertePlanId = planId
    try {
      const aktualisiert = await miniplanZuweisungFixieren(id, planId, zuweisungId, true)
      if (planIdRef.current !== angefordertePlanId) return
      // Fixieren ändert nur das Flag einer einzelnen Zeile (ihre ID bleibt erhalten) - anhand des
      // *alten* Standes auflösen, welcher Gottesdienst betroffen ist.
      const gid = gottesdienstIdFuerZuweisung(miniplan, zuweisungId)
      refreshNachMutation(aktualisiert, gid !== null ? [gid] : [])
      showToast('Zuweisung fest übernommen')
    } catch (err) {
      if (planIdRef.current !== angefordertePlanId) return
      showToast(fehlerText(err, 'Fehler beim Fixieren'), 'error')
    }
  }

  // Gemeinsam von Maus/Touch-DnD (`handleDragEnd`) und der Tastatur-Alternative
  // (`handleChipAktivieren`) genutzt - beide führen letztlich denselben Tausch-Request aus. Dimmt
  // beide betroffenen Chips für die Dauer des Requests. `keyboardInitiiert` steuert nur die
  // Fokus-Wiederherstellung danach (nur beim Tastatur-Pfad relevant, siehe `focusChipFuerMini`) -
  // ein Maus-Drag hat keinen sinnvollen "Fokus zurückgeben"-Fall, da dort ohnehin kein Element
  // fokussiert war.
  function tauschDurchfuehren(
    quelle: ZuweisungDragData,
    ziel: ZuweisungDragData,
    keyboardInitiiert = false,
  ) {
    if (!miniplan) return
    if (quelle.zuweisungId === ziel.zuweisungId) return
    const angefordertePlanId = planId
    // Tauschen legt beide Zuweisungs-Zeilen mit neuen IDs neu an (siehe Backend-Kommentar) - eine
    // per Tastatur ausgewählte Quelle, die auf eine der beiden betroffenen IDs zeigt, würde sonst
    // stehen bleiben und beim nächsten Aktivieren einen Tausch mit einer nicht mehr existierenden
    // ID anstoßen (vom Backend abgelehnt). Vorsorglich löschen, bevor die neuen IDs überhaupt
    // bekannt sind - die alten werden so oder so ungültig.
    setKeyboardSwapQuelle((aktuell) =>
      aktuell &&
      (aktuell.zuweisungId === quelle.zuweisungId || aktuell.zuweisungId === ziel.zuweisungId)
        ? null
        : aktuell,
    )
    // Tauschen legt die beiden Zuweisungs-Zeilen neu an (siehe Backend-Kommentar), die
    // Dienstbedarf-IDs selbst bleiben aber stabil - über die Drag-Daten direkt bekannt, kein Suchen
    // im alten Stand nötig. Nur die betroffenen ein bis zwei Gottesdienste bumpen.
    const betroffeneDienstbedarfIds = new Set([quelle.dienstbedarfId, ziel.dienstbedarfId])
    const betroffeneGottesdienstIds = [...betroffeneDienstbedarfIds]
      .map((dbId) => gottesdienstIdFuerDienstbedarf(miniplan, dbId))
      .filter((gid): gid is number => gid !== null)
    // Für die Fokus-Wiederherstellung: die Zeile an `ziel`s Stelle trägt nach dem Tausch die
    // ursprüngliche Mini von `quelle` - im *alten* Stand nachschlagen, bevor die Zeilen ersetzt
    // werden.
    const quellMiniId = keyboardInitiiert ? miniIdFuerZuweisung(miniplan, quelle.zuweisungId) : null
    setTauschtGerade((ids) => new Set([...ids, quelle.zuweisungId, ziel.zuweisungId]))
    miniplanZuweisungenTauschen(id, planId, quelle.zuweisungId, ziel.zuweisungId)
      .then((aktualisiert) => {
        if (planIdRef.current !== angefordertePlanId) return
        refreshNachMutation(aktualisiert, betroffeneGottesdienstIds)
        showToast('Zuweisungen getauscht')
        if (keyboardInitiiert && quellMiniId !== null) {
          focusChipFuerMini(ziel.dienstbedarfId, quellMiniId)
        }
      })
      .catch((err) => {
        if (planIdRef.current !== angefordertePlanId) return
        showToast(fehlerText(err, 'Fehler beim Tauschen'), 'error')
      })
      .finally(() => {
        setTauschtGerade((ids) => {
          const kopie = new Set(ids)
          kopie.delete(quelle.zuweisungId)
          kopie.delete(ziel.zuweisungId)
          return kopie
        })
      })
  }

  function handleDragEnd(event: DragEndEvent) {
    const aktivDaten = event.active.data.current as ZuweisungDragData | undefined
    const zielDaten = event.over?.data.current as ZuweisungDragData | undefined
    if (!aktivDaten || !zielDaten) return
    tauschDurchfuehren(aktivDaten, zielDaten)
  }

  // Erster Aktivierungs-Klick (Space/Enter) merkt sich den Chip als Tausch-Quelle, der zweite auf
  // einem anderen Chip führt den Tausch aus; Aktivieren derselben Quelle hebt die Auswahl wieder auf
  // (Toggle statt eines separaten Abbrechen-Elements pro Chip - Escape deckt den globalen
  // Abbruch-Fall ab, siehe Effekt oben).
  function handleChipAktivieren(daten: ZuweisungDragData) {
    setKeyboardSwapQuelle((quelle) => {
      if (!quelle) return daten
      if (quelle.zuweisungId === daten.zuweisungId) return null
      tauschDurchfuehren(quelle, daten, true)
      return null
    })
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
      setDownloadFehler(
        err instanceof Error ? err.message : 'PDF konnte nicht heruntergeladen werden',
      )
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

  const handleFreitextDraftChange = useCallback(
    (veranstaltungen: string, ankuendigungen: string) => {
      setFreitextDraft({ veranstaltungen, ankuendigungen })
    },
    [],
  )

  const handleKartenStatusChange = useCallback((gottesdienstId: number, status: SpeicherStatus) => {
    setKartenStatus((aktuell) => ({ ...aktuell, [gottesdienstId]: status }))
  }, [])

  // hält fest, welche Karten gerade ihr Bearbeiten-Modal offen haben (siehe
  // `onBearbeitungChange`-Kommentar an `GottesdienstKarte`).
  const handleBearbeitungChange = useCallback(
    (gottesdienstId: number, bearbeitungOffen: boolean) => {
      setBearbeitungOffenIds((aktuell) => {
        if (aktuell.has(gottesdienstId) === bearbeitungOffen) return aktuell
        const kopie = new Set(aktuell)
        if (bearbeitungOffen) kopie.add(gottesdienstId)
        else kopie.delete(gottesdienstId)
        return kopie
      })
    },
    [],
  )

  // die vom Server gelieferte (nach Datum sortierte) Reihenfolge wird nur übernommen,
  // solange gerade keine Karte bearbeitet wird - ein Datums-Wechsel im offenen Bearbeiten-Modal
  // soll die sichtbare Kartenreihenfolge nicht schon während der Bearbeitung ändern. Sobald das
  // letzte offene Modal schließt, holt dieser Effekt (durch den Wechsel von `bearbeitungOffenIds`)
  // die inzwischen aktuelle Serverreihenfolge nach.
  useEffect(() => {
    if (bearbeitungOffenIds.size > 0) return
    setAngezeigteReihenfolge(miniplan?.gottesdienste.map((gd) => gd.id) ?? [])
  }, [miniplan, bearbeitungOffenIds])

  // Gerenderte Reihenfolge: die eingefrorene `angezeigteReihenfolge`, aufgelöst gegen den
  // aktuellen `miniplan`-Stand (für frisch geladene Inhalte/Zuweisungen), ergänzt um Gottesdienste,
  // die dort noch fehlen (z.B. gerade erst angelegt/dupliziert, während anderswo ein Modal offen
  // ist) - gelöschte Gottesdienste fallen über die `find`-Prüfung automatisch heraus.
  const sortierteGottesdienste = useMemo(() => {
    if (!miniplan) return []
    const bekannteIds = new Set(angezeigteReihenfolge)
    const bekannt = angezeigteReihenfolge
      .map((gdId) => miniplan.gottesdienste.find((gd) => gd.id === gdId))
      .filter((gd): gd is Gottesdienst => gd !== undefined)
    const neue = miniplan.gottesdienste.filter((gd) => !bekannteIds.has(gd.id))
    return [...bekannt, ...neue]
  }, [miniplan, angezeigteReihenfolge])

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
        {/* Layout-Skelett statt reinem Text - vorher blieb die rechte Spalte (PDF-
            Vorschau) beim ersten Laden komplett leer, weil dieser frühe Return das ganze restliche
            Grid übersprang. Nur `lg`+ zeigt die Vorschau-Karte überhaupt an (siehe finales Grid
            unten), daher hier ebenfalls hinter `hidden lg:block` verborgen. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <p className="text-ink-soft">Lade Miniplan…</p>
          <div className="hidden min-w-0 lg:block">
            <Card className="flex h-[80svh] flex-col lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]">
              <CardHeader title="PDF-Vorschau" />
              <div className="flex min-h-0 flex-1 items-center justify-center p-5">
                <div aria-hidden className="h-full w-full animate-pulse rounded-lg bg-paper-dim" />
              </div>
            </Card>
          </div>
        </div>
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
        {/* zwei getrennte Wrap-Gruppen (Füllen-Werkzeuge / Status-Aktionen) statt einer
            einzigen `flex-wrap`-Reihe - vorher landete auf schmalen Handy-Breiten oft ein einzelner
            Button (z.B. "Plan abschließen") isoliert in einer eigenen dritten Zeile. Als zwei
            Gruppen umbrechen sie zu je einer eigenen, optisch balancierten Zeile. */}
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {!readonly && (
              <IconButton
                ref={einstellungenButtonRef}
                label="Auto-Fill-Einstellungen"
                onClick={() => setEinstellungenOffen((o) => !o)}
              >
                <Settings2 className="h-4 w-4" />
              </IconButton>
            )}
            {!readonly && (
              <Button
                variant="secondary"
                size="sm"
                title={fuelltGerade ? 'Befüllt…' : 'Füllen'}
                disabled={fuelltGerade || miniplan.gottesdienste.length === 0}
                onClick={handleFuellen}
              >
                <Wand2 className="h-4 w-4" />
                <span className="hidden sm:inline">{fuelltGerade ? 'Befüllt…' : 'Füllen'}</span>
              </Button>
            )}
            {!readonly && hatAutoZuweisungen && (
              <InlineConfirmButton
                onConfirm={() => handleClearAuto()}
                confirmLabel="Alle automatischen Zuweisungen leeren?"
                trigger={(open) => (
                  <Button variant="secondary" size="sm" title="Auto leeren" onClick={open}>
                    <Eraser className="h-4 w-4" />
                    <span className="hidden sm:inline">Auto leeren</span>
                  </Button>
                )}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {miniplan.status === 'abgeschlossen' ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  title="PDF herunterladen"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">PDF herunterladen</span>
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
              <InlineConfirmButton
                onConfirm={() => handleStatusWechsel('abgeschlossen')}
                confirmLabel="Plan wirklich abschließen?"
                trigger={(open) => (
                  <Button variant="primary" size="sm" disabled={statusWirdGeaendert} onClick={open}>
                    Plan abschließen
                  </Button>
                )}
              />
            )}
          </div>
        </div>
      </div>
      <ZuteilungEinstellungenPopover
        open={einstellungenOffen}
        onClose={() => setEinstellungenOffen(false)}
        anchorRef={einstellungenButtonRef}
        miniplan={miniplan}
        minis={minis}
        pfarreiId={id}
        onMiniLimitsChange={(aktualisiert) => refreshNachMutation(aktualisiert, [])}
        onSave={handleEinstellungenSpeichern}
      />
      {downloadFehler && (
        <div className="mt-4">
          <Alert>{downloadFehler}</Alert>
        </div>
      )}

      {/* Kein `items-start`: `position: sticky` auf der PDF-Vorschau (rechte Spalte) braucht eine
          Containing Block, die höher ist als die Vorschau selbst, um beim Scrollen tatsächlich
          "hängen" zu bleiben - mit `items-start` bleibt der Grid-Item exakt so hoch wie sein Inhalt
          (die Vorschau-Karte), wodurch nie Spielraum zum Sticken entsteht und die Karte einfach
          normal mitscrollt. Der Default `stretch` lässt das Grid-Item auf die Höhe der linken
          Spalte anwachsen, in der die (selbst begrenzt hohe) Karte dann sticky bleiben kann. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <DndContext sensors={dndSensoren} onDragEnd={handleDragEnd}>
          <div className="flex min-w-0 flex-col gap-6">
            {sortierteGottesdienste.map((gottesdienst) => (
              <GottesdienstKarte
                key={gottesdienst.id}
                gottesdienst={gottesdienst}
                pfarreiId={id}
                miniplanId={planId}
                jahr={miniplan.jahr}
                monat={miniplan.monat}
                readonly={readonly}
                revision={kartenRevision[gottesdienst.id] ?? 0}
                gruppen={gruppen}
                minis={minis}
                dienstTypen={dienstTypen}
                filtertags={filtertags}
                onReload={reload}
                onDraftChange={handleGottesdienstDraftChange}
                onStatusChange={handleKartenStatusChange}
                onClearAutoBereich={handleClearAuto}
                onPinAuto={handlePinAuto}
                onBearbeitungChange={handleBearbeitungChange}
                tauschtGerade={tauschtGerade}
                keyboardSwapQuelle={keyboardSwapQuelle}
                onChipAktivieren={handleChipAktivieren}
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

        {/* unterhalb von `lg` verschwindet die Seitenspalte komplett (statt darunter zu
            rutschen und schweres Scrollen zu erzwingen) - der schwebende Button daneben öffnet
            dieselbe Vorschau stattdessen in einem Bottom-Sheet-Overlay. */}
        <div className="hidden min-w-0 lg:block">
          <VorschauPanel pfarreiId={id} miniplanId={planId} eingabe={vorschauEingabe} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMobileVorschauOffen(true)}
        className="fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-3 text-sm font-medium text-ink shadow-lg shadow-ink/20 transition-colors hover:bg-pine-tint hover:text-pine-dark lg:hidden"
      >
        <Eye className="h-4 w-4" />
        Vorschau
      </button>

      {mobileVorschauOffen && (
        <div
          className="animate-fade fixed inset-0 z-40 flex flex-col justify-end bg-ink/40 backdrop-blur-sm lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMobileVorschauOffen(false)
          }}
        >
          <div className="animate-rise h-[85svh] shadow-xl shadow-ink/20">
            <VorschauPanel
              pfarreiId={id}
              miniplanId={planId}
              eingabe={vorschauEingabe}
              variant="sheet"
              onClose={() => setMobileVorschauOffen(false)}
            />
          </div>
        </div>
      )}

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
