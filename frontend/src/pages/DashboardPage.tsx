import { Church } from 'lucide-react'
import { useEffect, useState } from 'react'
import { meinePfarreien, type Pfarrei } from '../api/pfarreien'
import { PfarreiCarousel } from '../components/PfarreiCarousel'
import { AppShell } from '../components/layout/AppShell'
import { EmptyState } from '../components/ui/EmptyState'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function DashboardPage() {
  useDocumentTitle('Übersicht')
  const [pfarreien, setPfarreien] = useState<Pfarrei[] | null>(null)

  useEffect(() => {
    meinePfarreien().then(setPfarreien)
  }, [])

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="font-display text-3xl font-semibold text-ink">Meine Pfarreien</h1>

        <div className="mt-8">
          {pfarreien && pfarreien.length === 0 ? (
            <div className="rounded-xl border border-line bg-white/70">
              <EmptyState
                icon={Church}
                title="Keine Pfarreien zugeordnet"
                description="Wende dich an einen Administrator, um Zugriff auf eine Pfarrei zu erhalten."
              />
            </div>
          ) : (
            pfarreien && <PfarreiCarousel pfarreien={pfarreien} />
          )}
        </div>
      </div>
    </AppShell>
  )
}
