import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MiniplaenePage } from './pages/MiniplaenePage'
import { ProfilePage } from './pages/ProfilePage'
import { StammdatenPage } from './pages/StammdatenPage'

// react-pdf/pdfjs-dist wiegt allein mehrere hundert KB und wird sonst nur für den Editor
// gebraucht - per Lazy-Import landet es in einem eigenen Chunk statt im initialen Bundle, das
// z.B. beim Login oder auf Seiten ohne Vorschau mitgeladen würde.
const MiniplanEditorPage = lazy(() =>
  import('./pages/MiniplanEditorPage').then((m) => ({ default: m.MiniplanEditorPage })),
)

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return null
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profil"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pfarreien/:pfarreiId/stammdaten"
        element={
          <ProtectedRoute>
            <StammdatenPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pfarreien/:pfarreiId/miniplaene"
        element={
          <ProtectedRoute>
            <MiniplaenePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pfarreien/:pfarreiId/miniplaene/:miniplanId"
        element={
          <ProtectedRoute>
            <Suspense fallback={null}>
              <MiniplanEditorPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
