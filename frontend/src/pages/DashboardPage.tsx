import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { meinePfarreien, type Pfarrei } from '../api/pfarreien'
import { useAuth } from '../auth/AuthContext'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const [pfarreien, setPfarreien] = useState<Pfarrei[]>([])

  useEffect(() => {
    meinePfarreien().then(setPfarreien)
  }, [])

  return (
    <main>
      <h1>Miniplan</h1>
      <p>Angemeldet als {user?.email}</p>
      <button onClick={logout}>Abmelden</button>

      <h2>Meine Pfarreien</h2>
      {pfarreien.length === 0 && <p>Keine Pfarreien zugeordnet.</p>}
      <ul>
        {pfarreien.map((pfarrei) => (
          <li key={pfarrei.id}>
            <Link to={`/pfarreien/${pfarrei.id}/stammdaten`}>{pfarrei.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
