import { api } from './client'

export interface Feiertag {
  key: string
  name: string
  datum: string
  schulfrei: boolean
  arbeiter_frei: boolean
}

export function feiertageListe(pfarreiId: number, jahr: number): Promise<Feiertag[]> {
  return api.get<Feiertag[]>(`/api/pfarreien/${pfarreiId}/feiertage?jahr=${jahr}`)
}

export function feiertagEinstellungSetzen(
  pfarreiId: number,
  feiertagKey: string,
  daten: { schulfrei: boolean; arbeiter_frei: boolean },
): Promise<{ schulfrei: boolean; arbeiter_frei: boolean }> {
  return api.put(`/api/pfarreien/${pfarreiId}/feiertage/${feiertagKey}`, daten)
}
