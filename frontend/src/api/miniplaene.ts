import { api } from './client'
import type { Gottesdienst } from './gottesdienste'

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
