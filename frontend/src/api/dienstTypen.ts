import type { Filtertag } from './minis'
import { api } from './client'
import type { Gruppe } from './gruppen'

export interface GruppenAnforderung {
  gruppe_id: number
  mindest_anzahl: number
}

export interface GruppenAnforderungOut {
  gruppe: Gruppe
  mindest_anzahl: number
}

export interface DienstTyp {
  id: number
  pfarrei_id: number
  name: string
  standard_anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderungOut[]
  zeige_label: boolean
}

export interface DienstTypEingabe {
  name: string
  standard_anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderung[]
  zeige_label: boolean
}

export function dienstTypenListe(pfarreiId: number): Promise<DienstTyp[]> {
  return api.get<DienstTyp[]>(`/api/pfarreien/${pfarreiId}/dienst-typen`)
}

export function dienstTypErstellen(
  pfarreiId: number,
  daten: DienstTypEingabe,
): Promise<DienstTyp> {
  return api.post<DienstTyp>(`/api/pfarreien/${pfarreiId}/dienst-typen`, daten)
}

export function dienstTypBearbeiten(
  pfarreiId: number,
  dienstTypId: number,
  daten: DienstTypEingabe,
): Promise<DienstTyp> {
  return api.put<DienstTyp>(`/api/pfarreien/${pfarreiId}/dienst-typen/${dienstTypId}`, daten)
}

export function dienstTypLoeschen(pfarreiId: number, dienstTypId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/dienst-typen/${dienstTypId}`)
}
