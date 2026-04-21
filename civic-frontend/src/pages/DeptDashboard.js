import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Client, Databases, Storage, Query, ID } from 'appwrite'
import { useAuth } from '../App'

// ── Appwrite ───────────────────────────────────────────────────
const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('699eabd30027a825d35d')

const db      = new Databases(client)
const storage = new Storage(client)

const DB_ID       = '699eacf6000802d9fae9'
const REPORTS_COL = 'reports'
const BUCKET_ID   = '699fd88000005425cf39'  // same bucket for all images
const ENDPOINT    = 'https://cloud.appwrite.io/v1'
const PROJECT_ID  = '699eabd30027a825d35d'
// ──────────────────────────────────────────────────────────────

// Build image URL from Appwrite Storage file ID
const imgUrl = (fileId) =>
  `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${PROJECT_ID}`

const DEPT_UI = {
  Electric: { icon: '⚡', color: '#ca8a04' },
  Waste:    { icon: '🗑️', color: '#16a34a' },
  Road:     { icon: '🛣️', color: '#ea580c' },
}

const STATUS_STYLE = {
  assigned:    { label: 'Assigned',    color: '#7c3aed' },
  in_progress: { label: 'In Progress', color: '#1d4ed8' },
  resolved:    { label: 'Resolved',    color: '#15803d' },
}

const PRIORITY_CFG = {
  high:   { label: '🔴 High',   color: '#ef4444' },
  medium: { label: '🟡 Medium', color: '#f59e0b' },
  low:    { label: '🟢 Low',    color: '#10b981' },
}

export default function DeptDashboard() {
  const [reports,    setReports]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [notes,      setNotes]      = useState({})
  const [notif,      setNotif]      = useState('')
  const [busy,       setBusy]       = useState('')

  // Proof image state per report — { reportId: File }
  const [proofFiles,    setProofFiles]    = useState({})
  // Preview URL per report for showing selected image before upload
  const [proofPreviews, setProofPreviews] = useState({})
  // Upload progress per report
  const [uploading,     setUploading]     = useState({})

  const { authUser, setAuthUser } = useAuth()
  const navigate  = useNavigate()
  const timerRef  = useRef(null)
  const pollRef   = useRef(null)

  const deptName = authUser?.name || ''
  const deptUI   = DEPT_UI[deptName] || { icon: '🏢', color: '#475569' }

  useEffect(() => {
    if (!deptName) return
    loadReports()
    pollRef.current = setInterval(loadReports, 10000)
    return () => { clearInterval(pollRef.current); clearTimeout(timerRef.current) }
  }, [deptName])

  // ── Load only reports for this department ─────────────────────
  const loadReports = async () => {
    try {
      const res = await db.listDocuments(DB_ID, REPORTS_COL, [
        Query.equal('department', deptName),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ])
      setReports(res.documents || [])
    } catch (e) {
      console.error('loadReports:', e)
    }
    setLoading(false)
  }

  // ── Mark In Progress ──────────────────────────────────────────
  const markInProgress = async (reportId) => {
    setBusy(`prog-${reportId}`)
    try {
      const data = { status: 'in_progress' }
      if (notes[reportId]?.trim()) data.adminNote = notes[reportId].trim()
      await db.updateDocument(DB_ID, REPORTS_COL, reportId, data)
      await loadReports()
      toast('🔧 Status updated: Work In Progress!')
    } catch (e) {
      toast('❌ Failed to update status.')
    }
    setBusy('')
  }

  // ── Handle proof image file selection ─────────────────────────
  const handleFileSelect = (reportId, file) => {
    if (!file) return
    // Save file object
    setProofFiles(p => ({ ...p, [reportId]: file }))
    // Create preview URL
    const previewUrl = URL.createObjectURL(file)
    setProofPreviews(p => ({ ...p, [reportId]: previewUrl }))
  }

  // ── Upload proof image + Mark Resolved ────────────────────────
  // Steps:
  //   1. Upload proof image to Appwrite Storage
  //   2. Update report:
  //        status        → 'resolved'
  //        resolvedImage → proof image file ID   ← NEW FIELD
  //        resolvedAt    → current timestamp      ← NEW FIELD
  //        adminNote     → resolution note
  // Citizen sees both before and after images in Flutter app
  const uploadProofAndResolve = async (reportId) => {
    const file = proofFiles[reportId]
    if (!file) {
      toast('⚠️ Please select a proof image first!')
      return
    }

    setUploading(p => ({ ...p, [reportId]: true }))
    try {
      // Step 1: Upload proof image to Appwrite Storage
      const uploaded = await storage.createFile(
        BUCKET_ID,
        ID.unique(),
        file,
      )

      // Step 2: Update report as resolved with proof image
      const resolvedAt = new Date().toISOString()
      await db.updateDocument(DB_ID, REPORTS_COL, reportId, {
        status:        'resolved',
        resolvedImage: uploaded.$id,       // ← proof image file ID
        resolvedAt:    resolvedAt,         // ← resolution timestamp
        adminNote: notes[reportId]?.trim()
          || `Issue resolved by ${deptName} Department on ${new Date().toLocaleDateString('en-IN')}`,
      })

      // Clean up preview
      setProofFiles(p => { const n = { ...p }; delete n[reportId]; return n })
      setProofPreviews(p => { const n = { ...p }; delete n[reportId]; return n })

      await loadReports()
      toast('✅ Issue resolved with proof! Citizen has been notified. 🎉')
    } catch (e) {
      console.error('uploadProofAndResolve:', e)
      toast('❌ Upload failed. Please try again.')
    }
    setUploading(p => ({ ...p, [reportId]: false }))
  }

  const toast = (msg) => {
    setNotif(msg)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setNotif(''), 4000)
  }

  const handleLogout = () => {
    setAuthUser(null)
    navigate('/')
  }

  const cnt = (st) => reports.filter(r => r.status === st).length

  return (
    <div style={s.page}>

      {/* NAVBAR */}
      <nav style={{ ...s.nav, background: deptUI.color }}>
        <div style={s.navL}>
          <span style={s.logo}>{deptUI.icon} {deptName} Department</span>
          <span style={s.badge}>DEPT</span>
        </div>
        <div style={s.navR}>
          {cnt('assigned') > 0 && (
            <span style={s.bell}>🔔<span style={s.bellN}>{cnt('assigned')}</span></span>
          )}
          <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {notif && <div style={s.toast}>{notif}</div>}

      <div style={s.wrap}>

        {/* STATS */}
        <div style={s.statsGrid}>
          {[
            { label: '📥 Assigned',    n: cnt('assigned'),    color: '#7c3aed' },
            { label: '🔧 In Progress', n: cnt('in_progress'), color: '#1d4ed8' },
            { label: '✅ Resolved',    n: cnt('resolved'),    color: '#15803d' },
          ].map(({ label, n, color }) => (
            <div key={label} style={{ ...s.statCard, borderTop: `4px solid ${color}` }}>
              <div style={{ ...s.statN, color }}>{n}</div>
              <div style={s.statL}>{label}</div>
            </div>
          ))}
        </div>

        {/* WORKFLOW BANNER */}
        <div style={s.flowBar}>
          <span style={s.flowHead}>📋 Your Workflow:</span>
          {[
            { label: 'Assigned',    color: '#7c3aed' },
            { label: 'In Progress', color: '#1d4ed8' },
            { label: 'Resolved',    color: '#15803d' },
          ].map(({ label, color }, i, a) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...s.flowPill, background: color }}>{label}</span>
              {i < a.length - 1 && <span style={s.flowArrow}>→</span>}
            </span>
          ))}
          <span style={s.flowNote}>Upload proof photo when marking as resolved</span>
        </div>

        <h2 style={s.pageTitle}>{deptUI.icon} Issues Assigned to {deptName} Department</h2>

        {/* REPORTS */}
        {loading ? (
          <div style={s.center}><div style={s.spin} /><p style={s.centerTxt}>Loading...</p></div>
        ) : reports.length === 0 ? (
          <div style={s.center}>
            <div style={{ fontSize: 52 }}>🎉</div>
            <p style={s.centerTxt}>No issues assigned to {deptName} yet!</p>
          </div>
        ) : (
          reports.map(r => {
            const st       = STATUS_STYLE[r.status] || STATUS_STYLE.assigned
            const exp      = expandedId === r.$id
            const resolved = r.status === 'resolved'
            const pcfg     = r.priority && r.priority !== 'none' ? PRIORITY_CFG[r.priority] : null
            const preview  = proofPreviews[r.$id]
            const isUploading = uploading[r.$id]

            return (
              <div key={r.$id} style={{ ...s.card, borderLeft: `5px solid ${st.color}` }}>

                {/* CARD HEADER */}
                <div style={s.cardTop} onClick={() => setExpandedId(exp ? null : r.$id)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.tagRow}>
                      <span style={{ ...s.tag, background: st.color }}>{st.label}</span>
                      {pcfg && (
                        <span style={{ ...s.tag, background: pcfg.color }}>
                          {pcfg.label} Priority
                        </span>
                      )}
                      {resolved && r.resolvedImage && (
                        <span style={{ ...s.tag, background: '#0369a1' }}>
                          📸 Proof Uploaded
                        </span>
                      )}
                    </div>
                    <div style={s.cardName}>
                      Reported by <strong>{r.username || 'Unknown'}</strong>
                    </div>
                    <div style={s.cardDate}>
                      🕐 {new Date(r.$createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {r.latitude && (
                        <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank" rel="noreferrer" style={s.mapA}
                          onClick={e => e.stopPropagation()}>
                          &nbsp;📍 Location
                        </a>
                      )}
                    </div>
                  </div>
                  <span style={s.chevron}>{exp ? '▲' : '▼'}</span>
                </div>

                <p style={s.desc}>{r.description || 'No description.'}</p>

                {/* EXPANDED */}
                {exp && (
                  <div style={s.body}>

                    {/* ── BEFORE IMAGE (issue photo) ─────────── */}
                    {r.image && (
                      <div style={s.imgSection}>
                        <p style={s.imgLabel}>📷 Before — Issue Photo</p>
                        <img src={imgUrl(r.image)} alt="Issue"
                          style={s.photo}
                          onClick={() => window.open(imgUrl(r.image), '_blank')} />
                        <p style={s.photoHint}>Click to view full size</p>
                      </div>
                    )}

                    {/* ── AFTER IMAGE (proof of resolution) ──── */}
                    {resolved && r.resolvedImage && (
                      <div style={{ ...s.imgSection, marginTop: 14 }}>
                        <p style={{ ...s.imgLabel, color: '#15803d' }}>
                          ✅ After — Proof of Resolution
                        </p>
                        <img src={imgUrl(r.resolvedImage)} alt="Resolved"
                          style={{ ...s.photo, border: '2px solid #10b981' }}
                          onClick={() => window.open(imgUrl(r.resolvedImage), '_blank')} />
                        <p style={s.photoHint}>
                          Resolved on {r.resolvedAt
                            ? new Date(r.resolvedAt).toLocaleString('en-IN')
                            : 'Date not recorded'}
                        </p>
                      </div>
                    )}

                    {/* GPS */}
                    {r.latitude && (
                      <div style={s.locBox}>
                        <span style={{ fontSize: 20 }}>📍</span>
                        <div>
                          <div style={s.locTitle}>GPS Location</div>
                          <div style={s.locCoord}>
                            Lat: {Number(r.latitude).toFixed(5)} | Lng: {Number(r.longitude).toFixed(5)}
                          </div>
                        </div>
                        <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank" rel="noreferrer" style={s.locBtn}>
                          Go to Site →
                        </a>
                      </div>
                    )}

                    {/* Admin note */}
                    {r.adminNote && (
                      <div style={s.noteShow}>
                        📝 <strong>Note:</strong> {r.adminNote}
                      </div>
                    )}

                    {/* ── ACTIONS (not shown when resolved) ──── */}
                    {!resolved && (
                      <div style={s.actSection}>

                        {/* Progress note */}
                        <textarea
                          style={s.textarea}
                          placeholder="Add a progress note (optional)..."
                          value={notes[r.$id] || ''}
                          onChange={e => setNotes(p => ({ ...p, [r.$id]: e.target.value }))}
                        />

                        {/* assigned → in_progress */}
                        {r.status === 'assigned' && (
                          <button
                            style={{ ...s.actionBtn, background: '#1d4ed8' }}
                            onClick={() => markInProgress(r.$id)}
                            disabled={busy === `prog-${r.$id}`}>
                            {busy === `prog-${r.$id}` ? '⏳ Updating...' : '🔧 Start Work — Going to Site'}
                          </button>
                        )}

                        {/* in_progress → resolved with proof image upload */}
                        {r.status === 'in_progress' && (
                          <div style={s.proofSection}>
                            <p style={s.proofTitle}>
                              📸 Upload Proof of Work Done
                            </p>
                            <p style={s.proofSub}>
                              Take a photo of the completed work and upload it.
                              This proof will be sent to the citizen and visible in their app.
                            </p>

                            {/* Image preview */}
                            {preview && (
                              <div style={s.previewBox}>
                                <img src={preview} alt="Preview"
                                  style={s.previewImg} />
                                <p style={s.previewLabel}>
                                  ✅ Image selected — ready to upload
                                </p>
                              </div>
                            )}

                            {/* File input */}
                            <label style={s.fileLabel}>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => handleFileSelect(r.$id, e.target.files[0])}
                              />
                              📁 {preview ? 'Change Photo' : 'Select Proof Photo'}
                            </label>

                            {/* Upload + Resolve button */}
                            <button
                              style={{
                                ...s.resolveBtn,
                                opacity: isUploading ? 0.7 : 1,
                                cursor: isUploading ? 'not-allowed' : 'pointer',
                              }}
                              onClick={() => uploadProofAndResolve(r.$id)}
                              disabled={isUploading}>
                              {isUploading
                                ? '⏳ Uploading & Resolving...'
                                : '✅ Upload Proof & Mark Resolved'}
                            </button>

                            {!proofFiles[r.$id] && (
                              <p style={s.proofWarning}>
                                ⚠️ You must upload a proof photo to resolve this issue
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Resolved confirmation */}
                    {resolved && (
                      <div style={s.resolvedBox}>
                        <span style={{ fontSize: 24 }}>✅</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            Resolved by {deptName} Department!
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            {r.resolvedImage
                              ? 'Proof image uploaded — citizen can see it in their app'
                              : 'No proof image uploaded'}
                          </div>
                          {r.resolvedAt && (
                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                              🕐 {new Date(r.resolvedAt).toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const s = {
  page:        { minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Segoe UI, sans-serif' },
  nav:         { color: '#fff', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' },
  navL:        { display: 'flex', alignItems: 'center', gap: 12 },
  logo:        { fontSize: 20, fontWeight: 800 },
  badge:       { background: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800 },
  navR:        { display: 'flex', alignItems: 'center', gap: 16 },
  bell:        { fontSize: 18 },
  bellN:       { background: '#ef4444', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: 11, fontWeight: 800, marginLeft: 2 },
  logoutBtn:   { background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  toast:       { position: 'fixed', top: 70, right: 24, background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 999, fontSize: 14, fontWeight: 500, maxWidth: 380 },
  wrap:        { maxWidth: 980, margin: '0 auto', padding: '24px 16px' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 18 },
  statCard:    { background: '#fff', borderRadius: 14, padding: '18px 12px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  statN:       { fontSize: 30, fontWeight: 800 },
  statL:       { fontSize: 12, color: '#64748b', marginTop: 4 },
  flowBar:     { background: '#fff', borderRadius: 12, padding: '11px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  flowHead:    { fontSize: 13, fontWeight: 700, color: '#475569' },
  flowPill:    { color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 },
  flowArrow:   { color: '#94a3b8', fontWeight: 700 },
  flowNote:    { fontSize: 11, color: '#94a3b8' },
  pageTitle:   { fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 16 },
  center:      { textAlign: 'center', padding: '60px 0' },
  centerTxt:   { color: '#94a3b8', marginTop: 12 },
  spin:        { width: 40, height: 40, border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' },
  card:        { background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  tagRow:      { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  tag:         { color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  cardName:    { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  cardDate:    { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  mapA:        { color: '#3b82f6', textDecoration: 'none', marginLeft: 6 },
  chevron:     { color: '#94a3b8', fontSize: 13, marginLeft: 10, flexShrink: 0 },
  desc:        { color: '#475569', fontSize: 14, margin: '6px 0 0', lineHeight: 1.6 },
  body:        { marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 },
  // Image sections
  imgSection:  { marginBottom: 8 },
  imgLabel:    { fontSize: 13, fontWeight: 700, color: '#475569', margin: '0 0 8px' },
  photo:       { width: 160, height: 160, objectFit: 'cover', borderRadius: 12, cursor: 'pointer', border: '2px solid #e2e8f0', display: 'block' },
  photoHint:   { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  locBox:      { display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 14, marginTop: 14 },
  locTitle:    { fontWeight: 700, fontSize: 13 },
  locCoord:    { fontSize: 12, color: '#64748b' },
  locBtn:      { marginLeft: 'auto', background: '#3b82f6', color: '#fff', padding: '7px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  noteShow:    { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#92400e', marginBottom: 14 },
  actSection:  { borderTop: '1px solid #f1f5f9', paddingTop: 14 },
  textarea:    { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, resize: 'vertical', minHeight: 70, marginBottom: 12, boxSizing: 'border-box', fontFamily: 'Segoe UI, sans-serif', color: '#475569', outline: 'none' },
  actionBtn:   { color: '#fff', border: 'none', borderRadius: 12, padding: '13px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 15, width: '100%', marginBottom: 12 },
  // Proof upload section
  proofSection:{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, padding: '18px', marginTop: 4 },
  proofTitle:  { fontSize: 15, fontWeight: 800, color: '#15803d', margin: '0 0 6px' },
  proofSub:    { fontSize: 13, color: '#16a34a', margin: '0 0 14px', lineHeight: 1.5 },
  previewBox:  { marginBottom: 14 },
  previewImg:  { width: 180, height: 180, objectFit: 'cover', borderRadius: 12, border: '2px solid #10b981', display: 'block' },
  previewLabel:{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: 600 },
  fileLabel:   { display: 'inline-block', background: '#fff', color: '#16a34a', border: '2px solid #86efac', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13, marginBottom: 12 },
  resolveBtn:  { width: '100%', padding: '14px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, marginBottom: 8 },
  proofWarning:{ fontSize: 12, color: '#dc2626', textAlign: 'center' },
  resolvedBox: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', color: '#15803d', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8 },
}