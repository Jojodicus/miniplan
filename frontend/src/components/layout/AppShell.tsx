import { ArrowLeft, CalendarRange, LogOut, Settings, ShieldCheck, UserCircle } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { AppIcon } from '../AppIcon'

// Bereichs-Navigation innerhalb einer Pfarrei im Header statt verstreuter
// "Zu den ..."-Links auf den Einzelseiten.
function PfarreiNav({ pfarreiId }: { pfarreiId: number }) {
  const bereiche = [
    { to: `/pfarreien/${pfarreiId}/stammdaten`, label: 'Stammdaten', icon: Settings },
    { to: `/pfarreien/${pfarreiId}/miniplaene`, label: 'Minipläne', icon: CalendarRange },
  ]
  return (
    <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
      <Link
        to="/"
        className="mr-2 inline-flex shrink-0 items-center gap-1.5 py-2 text-sm text-ink-soft transition-colors hover:text-pine-dark"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Übersicht
      </Link>
      {bereiche.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'border-pine text-pine-dark'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({
  children,
  wide = false,
  pfarreiId,
}: {
  children: React.ReactNode
  wide?: boolean
  /** Zeigt die Bereichs-Navigation (Stammdaten/Minipläne) dieser Pfarrei im Header an. */
  pfarreiId?: number
}) {
  const { user, logout } = useAuth()
  const containerWidth = wide ? 'max-w-[1800px]' : 'max-w-5xl'

  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-white/60 backdrop-blur-sm">
        <div
          className={`mx-auto flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:px-6 sm:py-4 ${containerWidth}`}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <AppIcon className="h-8 w-8" />
            <span className="font-display text-xl font-semibold text-ink">Miniplan</span>
          </Link>
          {user && (
            <div className="flex items-center gap-1 sm:gap-3">
              {user.ist_admin && (
                <NavLink
                  to="/admin"
                  title="Admin"
                  className={({ isActive }) =>
                    `inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors sm:px-2.5 ${
                      isActive
                        ? 'bg-pine-tint text-pine-dark'
                        : 'text-ink-soft hover:bg-paper-dim hover:text-ink'
                    }`
                  }
                >
                  <ShieldCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Admin</span>
                </NavLink>
              )}
              <NavLink
                to="/profil"
                title={user.email}
                className={({ isActive }) =>
                  `inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors sm:px-2.5 ${
                    isActive
                      ? 'bg-pine-tint text-pine-dark'
                      : 'text-ink-soft hover:bg-paper-dim hover:text-ink'
                  }`
                }
              >
                <UserCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{user.email}</span>
              </NavLink>
              <button
                onClick={logout}
                title="Abmelden"
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink sm:px-2.5"
              >
                <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </div>
          )}
        </div>
        {pfarreiId !== undefined && (
          <div className={`mx-auto px-4 sm:px-6 ${containerWidth}`}>
            <PfarreiNav pfarreiId={pfarreiId} />
          </div>
        )}
      </header>
      <main className={`mx-auto px-4 py-6 sm:px-6 sm:py-10 ${containerWidth}`}>{children}</main>
    </div>
  )
}
