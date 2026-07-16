import { ClipboardList, Clock, Mail, Users, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { filtertagsListe, type Filtertag as FiltertagDef } from '../../api/filtertags'
import { gruppenListe, type Gruppe } from '../../api/gruppen'
import { AppShell } from '../../components/layout/AppShell'
import { TabBar } from '../../components/ui/TabBar'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { DienstTypenSection } from './DienstTypenSection'
import { EinladungenSection } from './EinladungenSection'
import { GruppenSection } from './GruppenSection'
import { MinisSection } from './MinisSection'
import { VerfuegbarkeitSection } from './VerfuegbarkeitSection'

const TABS = [
  { key: 'gruppen', label: 'Gruppen', icon: Users },
  { key: 'minis', label: 'Minis', icon: UserRound },
  { key: 'dienst-typen', label: 'Dienst-Typen', icon: ClipboardList },
  { key: 'verfuegbarkeit', label: 'Verfügbarkeit', icon: Clock },
  { key: 'einladungen', label: 'Einladungen', icon: Mail },
] as const

type TabKey = (typeof TABS)[number]['key']

export function StammdatenPage() {
  useDocumentTitle('Stammdaten')
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [gruppenGeladen, setGruppenGeladen] = useState(false)
  const [filtertags, setFiltertags] = useState<FiltertagDef[]>([])
  const [filtertagsGeladen, setFiltertagsGeladen] = useState(false)
  const [tab, setTab] = useState<TabKey>('gruppen')
  // Einmal besuchte Tabs bleiben gemountet (nur per CSS versteckt) statt beim Wechsel
  // unzumountet zu werden - sonst verliert die Sektion ihren bereits geladenen State und zeigt
  // bei jedem erneuten Aufruf wieder kurz das Lade-Skeleton samt Höhensprung an.
  const [besuchteTabs, setBesuchteTabs] = useState<Set<TabKey>>(() => new Set(['gruppen']))

  useEffect(() => {
    setBesuchteTabs((aktuell) => (aktuell.has(tab) ? aktuell : new Set(aktuell).add(tab)))
  }, [tab])

  const reloadGruppen = useCallback(() => {
    gruppenListe(id).then((liste) => {
      setGruppen(liste)
      setGruppenGeladen(true)
    })
  }, [id])

  const reloadFiltertags = useCallback(() => {
    filtertagsListe(id).then((liste) => {
      setFiltertags(liste)
      setFiltertagsGeladen(true)
    })
  }, [id])

  useEffect(() => {
    reloadGruppen()
  }, [reloadGruppen])

  useEffect(() => {
    reloadFiltertags()
  }, [reloadFiltertags])

  return (
    <AppShell pfarreiId={id}>
      <h1 className="font-display text-3xl font-semibold text-ink">Stammdaten</h1>

      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mt-6" />

      <div className="mt-6">
        {besuchteTabs.has('gruppen') && (
          <div hidden={tab !== 'gruppen'}>
            <GruppenSection
              pfarreiId={id}
              gruppen={gruppen}
              geladen={gruppenGeladen}
              reload={reloadGruppen}
              aktiv={tab === 'gruppen'}
            />
          </div>
        )}
        {besuchteTabs.has('minis') && (
          <div hidden={tab !== 'minis'}>
            <MinisSection
              pfarreiId={id}
              gruppen={gruppen}
              filtertags={filtertags}
              aktiv={tab === 'minis'}
            />
          </div>
        )}
        {besuchteTabs.has('dienst-typen') && (
          <div hidden={tab !== 'dienst-typen'}>
            <DienstTypenSection pfarreiId={id} gruppen={gruppen} aktiv={tab === 'dienst-typen'} />
          </div>
        )}
        {besuchteTabs.has('verfuegbarkeit') && (
          <div hidden={tab !== 'verfuegbarkeit'}>
            <VerfuegbarkeitSection
              pfarreiId={id}
              aktiv={tab === 'verfuegbarkeit'}
              filtertags={filtertags}
              filtertagsGeladen={filtertagsGeladen}
              reloadFiltertags={reloadFiltertags}
            />
          </div>
        )}
        {besuchteTabs.has('einladungen') && (
          <div hidden={tab !== 'einladungen'}>
            <EinladungenSection pfarreiId={id} aktiv={tab === 'einladungen'} />
          </div>
        )}
      </div>
    </AppShell>
  )
}
