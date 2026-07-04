import { api } from './client'

export interface FiltertagBlocker {
  id: number
  pfarrei_id: number
  filtertag_id: number
  wochentag: number
  start_zeit: string
  end_zeit: string
}

export interface FiltertagBlockerEingabe {
  filtertag_id: number
  wochentag: number
  start_zeit: string
  end_zeit: string
}

export function filtertagBlockerListe(pfarreiId: number): Promise<FiltertagBlocker[]> {
  return api.get<FiltertagBlocker[]>(`/api/pfarreien/${pfarreiId}/filtertag-blocker`)
}

export function filtertagBlockerErstellen(
  pfarreiId: number,
  daten: FiltertagBlockerEingabe,
): Promise<FiltertagBlocker> {
  return api.post<FiltertagBlocker>(`/api/pfarreien/${pfarreiId}/filtertag-blocker`, daten)
}

export function filtertagBlockerLoeschen(pfarreiId: number, blockerId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/filtertag-blocker/${blockerId}`)
}
