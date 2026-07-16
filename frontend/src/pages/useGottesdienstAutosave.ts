import { useEffect, useRef, useState } from 'react'
import { fehlerText } from '../api/client'
import type { DienstTyp, GruppenAnforderung } from '../api/dienstTypen'
import {
  gottesdienstBearbeiten,
  type Dienstbedarf,
  type DienstbedarfEingabe,
  type DienstbedarfZuweisung,
  type Gottesdienst,
} from '../api/gottesdienste'
import type { Filtertag } from '../api/minis'
import { useToast } from '../components/ui/useToast'

export type SpeicherStatus = 'gespeichert' | 'speichert' | 'ungespeichert' | 'fehler'

// Für die Gesamt-Anzeige neben dem Seitentitel: der "schlechteste" Status gewinnt.
export function gesamtStatus(statusListe: SpeicherStatus[]): SpeicherStatus {
  if (statusListe.includes('fehler')) return 'fehler'
  if (statusListe.includes('ungespeichert')) return 'ungespeichert'
  if (statusListe.includes('speichert')) return 'speichert'
  return 'gespeichert'
}

export const AUTOSAVE_DEBOUNCE_MS = 800

let naechsterSchluessel = 0
export function neuerSchluessel(): string {
  naechsterSchluessel += 1
  return `neu-${naechsterSchluessel}`
}

export interface WorkingBedarf {
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

export function bedarfAusOut(bedarf: Dienstbedarf): WorkingBedarf {
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

export function bedarfAusDienstTyp(dienstTyp: DienstTyp): WorkingBedarf {
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

export function bedarfFreitext(): WorkingBedarf {
  return {
    schluessel: neuerSchluessel(),
    dienstbedarfId: null,
    dienst_typ_id: null,
    dienst_typ_name: null,
    name: '',
    anzahl: 0,
    erforderliche_filtertags: [],
    gruppen_anforderungen: [],
    fixierteMiniIds: [],
    zeige_label: true,
  }
}

export function zuEingabe(bedarf: WorkingBedarf, autoMiniIds: number[]): DienstbedarfEingabe {
  // Automatische Zuweisungen werden unverändert vom Server-Stand durchgereicht (siehe Kommentar
  // an `auto_mini_ids` im Schema) - senkt der Nutzer aber die `Anzahl` unter die Zahl bereits
  // automatisch zugewiesener Minis (z. B. um einen zuvor gefüllten Dienst zu einer reinen
  // Hinweiszeile mit Anzahl 0 zu machen), lehnt das Backend sonst jeden weiteren Autosave dieses
  // Gottesdienstes mit 422 ab - inklusive aller anderen Dienste desselben Gottesdienstes, die im
  // selben PUT mitgeschickt werden. Deshalb hier auf die noch freie Kapazität kürzen, statt die
  // überzähligen Autos unverändert mitzuschicken.
  const kapazitaet = Math.max(0, bedarf.anzahl - bedarf.fixierteMiniIds.length)
  return {
    dienst_typ_id: bedarf.dienst_typ_id,
    name: bedarf.dienst_typ_id === null ? bedarf.name : null,
    anzahl: bedarf.anzahl,
    erforderliche_filtertags: bedarf.erforderliche_filtertags,
    gruppen_anforderungen: bedarf.gruppen_anforderungen,
    fixierte_mini_ids: bedarf.fixierteMiniIds,
    auto_mini_ids: autoMiniIds.slice(0, kapazitaet),
    zeige_label: bedarf.zeige_label,
  }
}

export interface GottesdienstDraft {
  datum: string
  uhrzeit: string
  name: string
  notiz: string
  bedarfListe: WorkingBedarf[]
  // Serverstand der Zuweisungen je Bedarf-Schlüssel (für automatisch zugewiesene Minis, die nicht
  // Teil des editierbaren Drafts sind, aber trotzdem in der Vorschau auftauchen sollen).
  serverZuweisungenBySchluessel: Record<string, DienstbedarfZuweisung[]>
}

export interface UseGottesdienstAutosaveOptions {
  gottesdienst: Gottesdienst
  pfarreiId: number
  miniplanId: number
  readonly: boolean
  // Von der Elternseite gezielt für tatsächlich betroffene Gottesdienst-IDs erhöhter Zähler (siehe
  // `bumpKartenRevision` in MiniplanEditorPage) - der Server-Sync-Effekt unten reagiert nur darauf,
  // nicht auf jede (nach jedem Reload ohnehin neue) `gottesdienst.dienstbedarf`-Referenz. Sonst
  // würde z.B. ein Tauschen/Fixieren/Leeren an einem anderen Gottesdienst auch diese Karte zu einem
  // unnötigen Sync-Durchlauf (und Re-Render) zwingen.
  revision: number
  onReload: () => void
  onDraftChange: (gottesdienstId: number, draft: GottesdienstDraft) => void
  onStatusChange: (gottesdienstId: number, status: SpeicherStatus) => void
}

export interface UseGottesdienstAutosaveResult {
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
  updateBedarf: (schluessel: string, patch: Partial<WorkingBedarf>) => void
  serverZuweisungenMap: Record<string, DienstbedarfZuweisung[]>
  dienstbedarfIdMap: Record<string, number>
  status: SpeicherStatus
}

// Kapselt den kompletten Autosave-Kreislauf einer `GottesdienstKarte`: lokaler Bearbeitungs-Draft,
// debounced Speichern bei Änderungen sowie das Nachziehen von Server-Zuweisungen (automatische
// Zuteilung, die anderswo - Füllen/Tauschen/Fixieren/Leeren - ausgelöst wurde). Die Komponente
// selbst bleibt dadurch auf Rendering und lokale UI-Interaktionen (Modal, Duplizieren, Löschen)
// beschränkt.
export function useGottesdienstAutosave({
  gottesdienst,
  pfarreiId,
  miniplanId,
  readonly,
  revision,
  onReload,
  onDraftChange,
  onStatusChange,
}: UseGottesdienstAutosaveOptions): UseGottesdienstAutosaveResult {
  const gottesdienstId = gottesdienst.id
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
  >(() =>
    Object.fromEntries(gottesdienst.dienstbedarf.map((b) => [`bestehend-${b.id}`, b.zuweisungen])),
  )
  // Echte dienstbedarfId je Schlüssel (frisch hinzugefügter Bedarf startet mit `null`, bekommt sie
  // nach dem ersten Speichern) - getrennt von `bedarfListe`, damit kein Autosave ausgelöst wird.
  const [dienstbedarfIdMap, setDienstbedarfIdMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(gottesdienst.dienstbedarf.map((b) => [`bestehend-${b.id}`, b.id])),
  )
  const [status, setStatus] = useState<SpeicherStatus>('gespeichert')
  const { showToast } = useToast()
  const istErstesRendern = useRef(true)
  // Rückwärts-Lookup echte dienstbedarfId -> lokaler Schlüssel, bei jedem Rendern frisch berechnet
  // (wie `zoomFactorRef` in PdfViewer) - der Sync-Effekt unten braucht den aktuellen Stand, ohne
  // dass `bedarfListe`/`dienstbedarfIdMap` in dessen Dependency-Array stehen müssten (das würde bei
  // jeder Draft-Änderung, z.B. jedem Tastenanschlag im Namensfeld, unnötig neu laufen). Nötig, weil
  // ein frisch hinzugefügter Bedarf dauerhaft seinen "neu-*"-Schlüssel behält (siehe
  // `dienstbedarfIdMap`) - "bestehend-<id>" wäre für ihn also der falsche Schlüssel. Das ist die
  // stabile, ID-basierte Zuordnung, über die die Server-Zuweisungen unten aufgelöst werden - keine
  // Positions-/Index-Zuordnung.
  const schluesselByDienstbedarfId = useRef<Map<number, string>>(new Map())
  schluesselByDienstbedarfId.current = new Map(
    bedarfListe
      .map((b) => [dienstbedarfIdMap[b.schluessel] ?? b.dienstbedarfId, b.schluessel] as const)
      .filter((eintrag): eintrag is [number, string] => eintrag[0] !== null),
  )

  // Server-Zuweisungen laufen "Füllen"/"Leeren"/Tauschen/Fixieren aus einer anderen Karte oder
  // demselben Gottesdienst nach - diese Aktionen ändern die Zuweisungen serverseitig, ohne dass die
  // Karte (die ihren State nur beim ersten Rendern aus den Props übernimmt) das sonst bemerken
  // würde. Bewusst gemergt statt ersetzt und über `schluesselByDienstbedarfId` aufgelöst (nicht
  // einfach `bestehend-${b.id}` angenommen) - sonst ginge die Zuordnung für einen frisch
  // hinzugefügten, inzwischen gespeicherten Bedarf verloren, der dauerhaft seinen "neu-*"-Schlüssel
  // behält. Getrennt von `bedarfListe`/den übrigen Draft-Feldern, damit dieser Sync nie den
  // Autosave-Effekt auslöst (kein Remount mehr nötig).
  useEffect(() => {
    const resolveSchluessel = (id: number) =>
      schluesselByDienstbedarfId.current.get(id) ?? `bestehend-${id}`
    setServerZuweisungenMap((karte) => ({
      ...karte,
      ...Object.fromEntries(
        gottesdienst.dienstbedarf.map((b) => [resolveSchluessel(b.id), b.zuweisungen]),
      ),
    }))
    // `fixierteMiniIds` lebt (anders als die Zuweisungen oben) in `bedarfListe` selbst, weil Pin
    // (dieser Effekt) und das lokale Hinzufügen über den Mini-Adder (`toggleMini`) hier dieselbe
    // Quelle brauchen - ein per Pin-Button fest übernommener Mini muss dauerhaft in den Draft
    // einfließen, sonst würde ihn der nächste Autosave (der `fixierteMiniIds` unverändert
    // mitschickt) wieder als nicht-fixiert speichern. Deshalb bewusst per Inhalts-Vergleich
    // gebailoutet (gleiche Referenz zurückgeben, wenn sich nichts geändert hat) - andernfalls würde
    // jeder Reload (auch durch Mutationen an anderen Karten) hier unnötig einen weiteren
    // Autosave-Lauf auslösen.
    const fixierteJeSchluessel = new Map(
      gottesdienst.dienstbedarf.map((b) => [
        resolveSchluessel(b.id),
        b.zuweisungen.filter((z) => z.manuell_fixiert).map((z) => z.mini.id),
      ]),
    )
    setBedarfListe((liste) => {
      let geaendert = false
      const aktualisiert = liste.map((b) => {
        const frisch = fixierteJeSchluessel.get(b.schluessel)
        if (
          frisch === undefined ||
          (frisch.length === b.fixierteMiniIds.length &&
            frisch.every((id) => b.fixierteMiniIds.includes(id)))
        ) {
          return b
        }
        geaendert = true
        return { ...b, fixierteMiniIds: frisch }
      })
      return geaendert ? aktualisiert : liste
    })
    // Bewusst nur von `revision` abhängig (siehe Kommentar an der Prop) statt von
    // `gottesdienst.dienstbedarf` - Betroffenheits-Tracking passiert in der Elternseite
    // (`bumpKartenRevision`), hier soll nur bei tatsächlicher Betroffenheit synchronisiert werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  useEffect(() => {
    onDraftChange(gottesdienstId, {
      datum,
      uhrzeit,
      name,
      notiz,
      bedarfListe,
      serverZuweisungenBySchluessel: serverZuweisungenMap,
    })
  }, [
    datum,
    uhrzeit,
    name,
    notiz,
    bedarfListe,
    serverZuweisungenMap,
    gottesdienstId,
    onDraftChange,
  ])

  useEffect(() => {
    onStatusChange(gottesdienstId, status)
  }, [status, gottesdienstId, onStatusChange])

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
        const gespeichert = await gottesdienstBearbeiten(pfarreiId, miniplanId, gottesdienstId, {
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
        // keinen erneuten Autosave-Lauf auslöst. Positional (nicht über eine ID) korreliert, weil
        // `PUT .../gottesdienste/{id}` die komplette Dienstbedarf-Liste ersetzt: jede gespeicherte
        // Zeile bekommt dabei eine frische Datenbank-ID, es gibt also keine über den Request hinweg
        // stabile ID, an der sich Anfrage- und Antwort-Eintrag sonst festmachen ließen. Das
        // funktioniert nur, weil der Server dieselbe Reihenfolge zurückgibt, in der die Zeilen
        // gesendet wurden (siehe `order_by="Dienstbedarf.id"`-Kommentar am Modell) - `bedarfListe`
        // ist hier bewusst der zum Zeitpunkt dieses Closures gültige Stand (also exakt das, was
        // gesendet wurde), nicht der zwischenzeitlich ggf. schon wieder veränderte State.
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
    // `serverZuweisungenMap` bewusst nicht in den Deps: das würde den Autosave erneut auslösen,
    // sobald der Sync-Effekt oben (Füllen/Tauschen/Fixieren/Leeren an dieser oder einer anderen
    // Karte) die Map aktualisiert - ein reiner Auffrisch-Vorgang ohne eigene Nutzeränderung soll
    // keinen weiteren Speicherlauf anstoßen (Re-Trigger-Schleife). `pfarreiId`/`miniplanId`/
    // `gottesdienstId`/`onReload`/`showToast` ändern sich während der Lebenszeit dieser Karte nie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum, uhrzeit, name, notiz, bedarfListe])

  function updateBedarf(schluessel: string, patch: Partial<WorkingBedarf>) {
    setBedarfListe((liste) =>
      liste.map((b) => (b.schluessel === schluessel ? { ...b, ...patch } : b)),
    )
  }

  return {
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
  }
}
