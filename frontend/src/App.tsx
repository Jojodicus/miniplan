import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MiniplanEditorPage } from './pages/MiniplanEditorPage'
import { MiniplaenePage } from './pages/MiniplaenePage'
import { StammdatenPage } from './pages/StammdatenPage'

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
            <MiniplanEditorPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
