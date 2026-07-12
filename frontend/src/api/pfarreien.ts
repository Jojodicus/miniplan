import { ApiError, api } from './client'

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
  hat_bild: boolean
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

/** URL des Pfarrei-Bilds (Backend liefert es autorisiert aus). `v` erzwingt nach Upload einen
 * frischen Abruf statt des Browser-Cache. */
export function pfarreiBildUrl(pfarreiId: number, version?: number): string {
  const basis = `/api/pfarreien/${pfarreiId}/bild`
  return version ? `${basis}?v=${version}` : basis
}

export async function pfarreiBildHochladen(pfarreiId: number, datei: File): Promise<Pfarrei> {
  const formData = new FormData()
  formData.append('datei', datei)
  const response = await fetch(`/api/pfarreien/${pfarreiId}/bild`, {
    method: 'PUT',
    body: formData,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    const detail = typeof body.detail === 'string' ? body.detail : 'Bild-Upload fehlgeschlagen'
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<Pfarrei>
}

export function pfarreiBildEntfernen(pfarreiId: number): Promise<Pfarrei> {
  return api.delete<Pfarrei>(`/api/pfarreien/${pfarreiId}/bild`)
}
