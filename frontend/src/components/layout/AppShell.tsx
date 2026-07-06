import { LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode
  wide?: boolean
}) {
  const { user, logout } = useAuth()
  const containerWidth = wide ? 'max-w-[1800px]' : 'max-w-5xl'

  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-white/60 backdrop-blur-sm">
        <div className={`mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 ${containerWidth}`}>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pine text-sm font-semibold text-paper">
              M
            </span>
            <span className="font-display text-xl font-semibold text-ink">Miniplan</span>
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-ink-soft sm:inline">{user.email}</span>
              <button
                onClick={logout}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink"
              >
                <LogOut className="h-3.5 w-3.5" />
                Abmelden
              </button>
            </div>
          )}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 sm:px-6 sm:py-10 ${containerWidth}`}>{children}</main>
    </div>
  )
}
