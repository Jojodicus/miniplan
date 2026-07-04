import { ChevronRight, Church } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { meinePfarreien, type Pfarrei } from '../api/pfarreien'
import { AppShell } from '../components/layout/AppShell'
import { EmptyState } from '../components/ui/EmptyState'

export function DashboardPage() {
  const [pfarreien, setPfarreien] = useState<Pfarrei[] | null>(null)

  useEffect(() => {
    meinePfarreien().then(setPfarreien)
  }, [])

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="font-display text-3xl font-semibold text-ink">Meine Pfarreien</h1>
        <p className="mt-1 text-ink-soft">
          Wähle eine Pfarrei, um Gruppen, Ministranten und Dienst-Typen zu verwalten.
        </p>

        <div className="mt-8">
          {pfarreien && pfarreien.length === 0 && (
            <div className="rounded-xl border border-line bg-white/70">
              <EmptyState
                icon={Church}
                title="Keine Pfarreien zugeordnet"
                description="Wende dich an einen Administrator, um Zugriff auf eine Pfarrei zu erhalten."
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(pfarreien ?? []).map((pfarrei, i) => (
              <Link
                key={pfarrei.id}
                to={`/pfarreien/${pfarrei.id}/stammdaten`}
                style={{ animationDelay: `${i * 40}ms` }}
                className="group animate-rise flex items-center justify-between gap-3 rounded-xl border border-line bg-white/70 px-5 py-4 shadow-sm shadow-ink/5 transition-all hover:-translate-y-0.5 hover:border-pine/40 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine-tint text-pine-dark">
                    <Church className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-ink">{pfarrei.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-pine-dark" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
