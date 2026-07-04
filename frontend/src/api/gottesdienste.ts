import { api } from './client'
import type { GruppenAnforderung, GruppenAnforderungOut } from './dienstTypen'
import type { Filtertag, Mini } from './minis'

export interface DienstTypSummary {
  id: number
  name: string
}

export interface Dienstbedarf {
  id: number
  dienst_typ: DienstTypSummary | null
  name: string | null
  anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderungOut[]
  zugewiesene_minis: Mini[]
  zeige_label: boolean
}

export interface DienstbedarfEingabe {
  dienst_typ_id?: number | null
  name?: string | null
  anzahl: number
  erforderliche_filtertags: Filtertag[]
  gruppen_anforderungen: GruppenAnforderung[]
  mini_ids: number[]
  zeige_label: boolean
}

export interface Gottesdienst {
  id: number
  miniplan_id: number
  datum: string
  uhrzeit: string
  name: string
  notiz: string | null
  dienstbedarf: Dienstbedarf[]
}

export interface GottesdienstEingabe {
  datum: string
  uhrzeit: string
  name: string
  notiz: string | null
  dienstbedarf: DienstbedarfEingabe[]
}

export function gottesdienstErstellen(
  pfarreiId: number,
  miniplanId: number,
  daten: GottesdienstEingabe,
): Promise<Gottesdienst> {
  return api.post<Gottesdienst>(
    `/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}/gottesdienste`,
    daten,
  )
}

export function gottesdienstBearbeiten(
  pfarreiId: number,
  miniplanId: number,
  gottesdienstId: number,
  daten: GottesdienstEingabe,
): Promise<Gottesdienst> {
  return api.put<Gottesdienst>(
    `/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}/gottesdienste/${gottesdienstId}`,
    daten,
  )
}

export function gottesdienstLoeschen(
  pfarreiId: number,
  miniplanId: number,
  gottesdienstId: number,
): Promise<void> {
  return api.delete<void>(
    `/api/pfarreien/${pfarreiId}/miniplaene/${miniplanId}/gottesdienste/${gottesdienstId}`,
  )
}
