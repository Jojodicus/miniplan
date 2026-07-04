import { api } from './client'

export type Filtertag = 'grundschueler' | 'schueler' | 'arbeiter'

export const FILTERTAGS: Filtertag[] = ['grundschueler', 'schueler', 'arbeiter']

export interface Mini {
  id: number
  pfarrei_id: number
  gruppe_id: number
  name: string
  filtertags: Filtertag[]
}

export interface MiniEingabe {
  name: string
  gruppe_id: number
  filtertags: Filtertag[]
}

export function minisListe(pfarreiId: number): Promise<Mini[]> {
  return api.get<Mini[]>(`/api/pfarreien/${pfarreiId}/minis`)
}

export function miniErstellen(pfarreiId: number, daten: MiniEingabe): Promise<Mini> {
  return api.post<Mini>(`/api/pfarreien/${pfarreiId}/minis`, daten)
}

export function miniBearbeiten(
  pfarreiId: number,
  miniId: number,
  daten: MiniEingabe,
): Promise<Mini> {
  return api.put<Mini>(`/api/pfarreien/${pfarreiId}/minis/${miniId}`, daten)
}

export function miniLoeschen(pfarreiId: number, miniId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/minis/${miniId}`)
}
