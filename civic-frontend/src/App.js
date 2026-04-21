import { createContext, useContext, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage      from './pages/LoginPage'
import AdminDashboard from './pages/AdminDashboard'
import DeptDashboard  from './pages/DeptDashboard'

// ── Auth Context ───────────────────────────────────────────────
// Stores who logged in — data comes FROM Appwrite, NOT localStorage
// authUser = { role: 'admin',      name: 'Admin Name' }
// authUser = { role: 'department', name: 'Electric' | 'Waste' | 'Road' }
export const AuthContext = createContext(null)
export const useAuth     = () => useContext(AuthContext)

export default function App() {
  const [authUser, setAuthUser] = useState(null)

  return (
    <AuthContext.Provider value={{ authUser, setAuthUser }}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LoginPage />} />

          {/* Admin only */}
          <Route
            path="/admin"
            element={
              authUser?.role === 'admin'
                ? <AdminDashboard />
                : <Navigate to="/" replace />
            }
          />

          {/* Department only */}
          <Route
            path="/department"
            element={
              authUser?.role === 'department'
                ? <DeptDashboard />
                : <Navigate to="/" replace />
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}