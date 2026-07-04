import { api } from './client'
import type { Gottesdienst } from './gottesdienste'
import type { Filtertag } from './minis'

export type MiniplanStatus = 'in_bearbeitung' | 'abgeschlossen'

export interface Miniplan {
  id: number
  pfarrei_id: number
  monat: number
  jahr: number
  status: MiniplanStatus
  veranstaltungen: string | null
  ankuendigungen: string | null
  gottesdienste: Gottesdienst[]
}

export interface MiniplanEingabe {
  monat: number
  jahr: number
}

export interface MiniplanFreitextEingabe {
  veranstaltungen: string | null
  ankuendigungen: string | null
}

export function miniplaeneListe(pfarreiId: number): Promise<Miniplan[]> {
  return api.get<Miniplan[]>(`/api/pfarreien/${pfarreiId}/miniplaene`)
}

export function miniplanErstellen(pfarreiId: number, daten: MiniplanEingabe): Promise<Miniplan> {
  return api.post<Miniplan>(`/api/pfarreien/${pfarreiId}/miniplaene`, daten)
}

export function miniplanDetail(pfarreiId: number, miniplanId: number): Promise<Miniplan> {
  return api.get<Miniplan>(`/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}`)
}

export function miniplanAktualisieren(
  pfarreiId: number,
  miniplanId: number,
  daten: MiniplanFreitextEingabe,
): Promise<Miniplan> {
  return api.put<Miniplan>(`/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}`, daten)
}

export function miniplanLoeschen(pfarreiId: number, miniplanId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}`)
}

export interface VorschauGruppenAnforderung {
  gruppe_name: string
  mindest_anzahl: number
}

export interface VorschauDienstbedarf {
  name: string
  anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: VorschauGruppenAnforderung[]
  zugewiesene_minis: string[]
}

export interface VorschauGottesdienst {
  datum: string
  uhrzeit: string
  name: string
  dienstbedarf: VorschauDienstbedarf[]
}

export interface MiniplanVorschauEingabe {
  monat: number
  jahr: number
  veranstaltungen: string | null
  ankuendigungen: string | null
  gottesdienste: VorschauGottesdienst[]
}

export type VorschauErgebnis = { ok: true; blobUrl: string } | { ok: false; fehler: string[] }

export function miniplanZuVorschauEingabe(miniplan: Miniplan): MiniplanVorschauEingabe {
  return {
    monat: miniplan.monat,
    jahr: miniplan.jahr,
    veranstaltungen: miniplan.veranstaltungen,
    ankuendigungen: miniplan.ankuendigungen,
    gottesdienste: miniplan.gottesdienste.map((gd) => ({
      datum: gd.datum,
      uhrzeit: gd.uhrzeit,
      name: gd.name,
      dienstbedarf: gd.dienstbedarf.map((bedarf) => ({
        name: bedarf.dienst_typ?.name ?? bedarf.name ?? '',
        anzahl: bedarf.anzahl,
        erforderliche_filtertags: bedarf.erforderliche_filtertags,
        gruppen_anforderungen: bedarf.gruppen_anforderungen.map((a) => ({
          gruppe_name: a.gruppe.name,
          mindest_anzahl: a.mindest_anzahl,
        })),
        zugewiesene_minis: bedarf.zugewiesene_minis.map((m) => m.name),
      })),
    })),
  }
}

export async function miniplanVorschau(
  pfarreiId: number,
  miniplanId: number,
  daten: MiniplanVorschauEingabe,
): Promise<VorschauErgebnis> {
  const response = await fetch(`/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}/vorschau`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(daten),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detailFehler = body?.detail?.fehler
    const fehler: string[] = Array.isArray(detailFehler)
      ? detailFehler
      : [typeof body?.detail === 'string' ? body.detail : 'Vorschau konnte nicht erstellt werden']
    return { ok: false, fehler }
  }
  const blob = await response.blob()
  return { ok: true, blobUrl: URL.createObjectURL(blob) }
}
