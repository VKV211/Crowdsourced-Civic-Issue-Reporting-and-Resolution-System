import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Client, Databases, Query } from 'appwrite'
import { useAuth } from '../App'

// ── Appwrite credentials ───────────────────────────────────────
const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('699eabd30027a825d35d')

const db = new Databases(client)

const DB_ID       = '699eacf6000802d9fae9'
const ADMINS_COL  = 'admins'       // columns: name, email, password
const DEPTS_COL   = 'departments'  // columns: name, email, password
// ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [role,     setRole]     = useState(null)   // 'admin' | 'department'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const { setAuthUser } = useAuth()
  const navigate        = useNavigate()

  const selectRole = (r) => {
    setRole(r)
    setEmail('')
    setPassword('')
    setError('')
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password.')
      return
    }
    setLoading(true)
    setError('')

    try {
      // Which collection to check
      const collection = role === 'admin' ? ADMINS_COL : DEPTS_COL

      const result = await db.listDocuments(DB_ID, collection, [
        Query.equal('email',    email.trim().toLowerCase()),
        Query.equal('password', password),
      ])

      if (result.documents.length === 0) {
        setError('Incorrect email or password. Please try again.')
        setLoading(false)
        return
      }

      const doc = result.documents[0]

      // Save to React Context — data straight from Appwrite
      setAuthUser({
        role: role,
        name: doc.name,   // admin name  OR  dept name (Electric/Waste/Road)
        id:   doc.$id,
      })

      navigate(role === 'admin' ? '/admin' : '/department')

    } catch (err) {
      console.error('Login error:', err)
      setError('Connection error. Check your internet and try again.')
    }

    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.emoji}>🏛️</div>
          <h1 style={s.title}>Civic Issue Portal</h1>
          <p style={s.sub}>Government Staff Login</p>
        </div>

        {/* ── Step 1: Pick role ────────────────────────────── */}
        {!role && (
          <>
            <p style={s.pickLabel}>Who are you logging in as?</p>

            <button style={s.adminPickBtn} onClick={() => selectRole('admin')}>
              <span style={s.pickIcon}>🛡️</span>
              <div>
                <div style={s.pickTitle}>Admin</div>
                <div style={s.pickSub}>Government Administrator</div>
              </div>
              <span style={s.pickArrow}>›</span>
            </button>

            <button style={s.deptPickBtn} onClick={() => selectRole('department')}>
              <span style={s.pickIcon}>🔧</span>
              <div>
                <div style={s.pickTitle}>Department</div>
                <div style={s.pickSub}>Electric · Waste · Road</div>
              </div>
              <span style={s.pickArrow}>›</span>
            </button>
          </>
        )}

        {/* ── Step 2: Login form ───────────────────────────── */}
        {role && (
          <>
            {/* Banner */}
            <div style={role === 'admin' ? s.adminBanner : s.deptBanner}>
              <span>{role === 'admin' ? '🛡️  Admin Login' : '🔧  Department Login'}</span>
              <button style={s.backBtn} onClick={() => selectRole(null)}>‹ Back</button>
            </div>

            {/* Error */}
            {error && <div style={s.errorBox}>⚠️  {error}</div>}

            {/* Email */}
            <label style={s.label}>Email Address</label>
            <input
              style={s.input}
              type="email"
              placeholder={role === 'admin' ? 'admin@civic.com' : 'electric@civic.com'}
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="off"
            />

            {/* Password */}
            <label style={s.label}>Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleLogin()}
            />

            {/* Submit */}
            <button
              style={loading ? s.btnDisabled : role === 'admin' ? s.adminBtn : s.deptBtn}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? '⏳  Logging in...' : '🔐  Login'}
            </button>
          </>
        )}

        <p style={s.footer}>For access issues, contact your system administrator</p>
      </div>
    </div>
  )
}

const s = {
  page:        { minHeight: '100vh', backgroundColor: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card:        { background: '#fff', borderRadius: 20, padding: '40px 34px', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.11)' },
  header:      { textAlign: 'center', marginBottom: 28 },
  emoji:       { fontSize: 54, marginBottom: 8 },
  title:       { fontSize: 24, fontWeight: 800, color: '#1a365d', margin: '0 0 6px' },
  sub:         { color: '#718096', margin: 0, fontSize: 14 },
  pickLabel:   { textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 16 },
  adminPickBtn:{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', background: '#eff6ff', border: '2px solid #bfdbfe', borderRadius: 14, cursor: 'pointer', marginBottom: 12, textAlign: 'left' },
  deptPickBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: 14, cursor: 'pointer', textAlign: 'left' },
  pickIcon:    { fontSize: 30 },
  pickTitle:   { fontSize: 16, fontWeight: 700, color: '#1e293b' },
  pickSub:     { fontSize: 12, color: '#64748b', marginTop: 2 },
  pickArrow:   { marginLeft: 'auto', fontSize: 22, color: '#94a3b8' },
  adminBanner: { background: '#1e3a5f', color: '#fff', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 15, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  deptBanner:  { background: '#15803d', color: '#fff', padding: '12px 16px', borderRadius: 12, marginBottom: 20, fontSize: 15, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 },
  errorBox:    { background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 },
  label:       { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, marginTop: 14 },
  input:       { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  adminBtn:    { width: '100%', marginTop: 22, padding: 14, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  deptBtn:     { width: '100%', marginTop: 22, padding: 14, background: '#15803d', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  btnDisabled: { width: '100%', marginTop: 22, padding: 14, background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'not-allowed' },
  footer:      { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 24, marginBottom: 0 },
}
