import { api } from './client'

export interface Filtertag {
  id: number
  pfarrei_id: number
  key: string
  label: string
  ist_schueler_artig: boolean
}

export interface FiltertagEingabe {
  label: string
  ist_schueler_artig: boolean
}

export interface FiltertagUpdateEingabe {
  label: string
  ist_schueler_artig: boolean
}

export function filtertagsListe(pfarreiId: number): Promise<Filtertag[]> {
  return api.get<Filtertag[]>(`/api/pfarreien/${pfarreiId}/filtertags`)
}

export function filtertagErstellen(pfarreiId: number, daten: FiltertagEingabe): Promise<Filtertag> {
  return api.post<Filtertag>(`/api/pfarreien/${pfarreiId}/filtertags`, daten)
}

export function filtertagBearbeiten(
  pfarreiId: number,
  filtertagId: number,
  daten: FiltertagUpdateEingabe,
): Promise<Filtertag> {
  return api.put<Filtertag>(`/api/pfarreien/${pfarreiId}/filtertags/${filtertagId}`, daten)
}

export function filtertagLoeschen(pfarreiId: number, filtertagId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/filtertags/${filtertagId}`)
}
