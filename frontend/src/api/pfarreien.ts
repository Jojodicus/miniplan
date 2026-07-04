import { api } from './client'

export const BUNDESLAENDER = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const

export type Bundesland = (typeof BUNDESLAENDER)[number]

export interface Pfarrei {
  id: number
  name: string
  bundesland: Bundesland
}

export function meinePfarreien(): Promise<Pfarrei[]> {
  return api.get<Pfarrei[]>('/api/pfarreien/mine')
}

export function pfarreiDetail(pfarreiId: number): Promise<Pfarrei> {
  return api.get<Pfarrei>(`/api/pfarreien/${pfarreiId}`)
}

export function bundeslandSetzen(pfarreiId: number, bundesland: Bundesland): Promise<Pfarrei> {
  return api.put<Pfarrei>(`/api/pfarreien/${pfarreiId}/bundesland`, { bundesland })
}
