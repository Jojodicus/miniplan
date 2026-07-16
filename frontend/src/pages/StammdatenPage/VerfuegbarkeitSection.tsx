import { CalendarDays, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Filtertag as FiltertagDef } from '../../api/filtertags'
import { TabBar } from '../../components/ui/TabBar'
import { FerienFeiertageSection } from './FerienFeiertageSection'
import { FiltertagsSection } from './FiltertagsSection'

const VERFUEGBARKEIT_TABS = [
  { key: 'status', label: 'Verfügbarkeits-Status', icon: Clock },
  { key: 'ferien-feiertage', label: 'Ferien & Feiertage', icon: CalendarDays },
] as const

type VerfuegbarkeitTabKey = (typeof VERFUEGBARKEIT_TABS)[number]['key']

export function VerfuegbarkeitSection({
  pfarreiId,
  filtertags,
  filtertagsGeladen,
  reloadFiltertags,
  aktiv,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  filtertagsGeladen: boolean
  reloadFiltertags: () => void
  aktiv: boolean
}) {
  const [subTab, setSubTab] = useState<VerfuegbarkeitTabKey>('status')
  const [besuchteSubTabs, setBesuchteSubTabs] = useState<Set<VerfuegbarkeitTabKey>>(
    () => new Set(['status']),
  )

  useEffect(() => {
    setBesuchteSubTabs((aktuell) => (aktuell.has(subTab) ? aktuell : new Set(aktuell).add(subTab)))
  }, [subTab])

  return (
    <div className="flex flex-col gap-4">
      <TabBar tabs={VERFUEGBARKEIT_TABS} active={subTab} onChange={setSubTab} variant="pills" />
      {besuchteSubTabs.has('status') && (
        <div hidden={subTab !== 'status'}>
          <FiltertagsSection
            pfarreiId={pfarreiId}
            filtertags={filtertags}
            geladen={filtertagsGeladen}
            reload={reloadFiltertags}
            aktiv={aktiv && subTab === 'status'}
          />
        </div>
      )}
      {besuchteSubTabs.has('ferien-feiertage') && (
        <div hidden={subTab !== 'ferien-feiertage'}>
          <FerienFeiertageSection
            pfarreiId={pfarreiId}
            aktiv={aktiv && subTab === 'ferien-feiertage'}
          />
        </div>
      )}
    </div>
  )
}
