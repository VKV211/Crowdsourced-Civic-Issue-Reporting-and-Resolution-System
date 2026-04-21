import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Client, Databases, Query } from 'appwrite'
import { useAuth } from '../App'

// ── Appwrite ───────────────────────────────────────────────────
const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('699eabd30027a825d35d')

const db = new Databases(client)

const DB_ID       = '699eacf6000802d9fae9'
const REPORTS_COL = 'reports'
const USER_COL    = 'user'
const BUCKET_ID   = '699fd88000005425cf39'
const ENDPOINT    = 'https://cloud.appwrite.io/v1'
const PROJECT_ID  = '699eabd30027a825d35d'

// ── Google Maps API Key ────────────────────────────────────────
const GMAPS_KEY = 'AIzaSyD-6-GBBKAFCWbiJDGpKGZCzIfIegreAPc'
// ──────────────────────────────────────────────────────────────
const isInvalidReport = (r) => r.isValid === false

const imgUrl = (fileId) =>
  `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${PROJECT_ID}`

const DEPARTMENTS = [
  { name: 'Electric', icon: '⚡', color: '#ca8a04' },
  { name: 'Waste',    icon: '🗑️', color: '#16a34a' },
  { name: 'Road',     icon: '🛣️', color: '#ea580c' },
]

const STATUS_STYLE = {
  pending:     { label: 'Pending',     color: '#d97706' },
  assigned:    { label: 'Assigned',    color: '#7c3aed' },
  in_progress: { label: 'In Progress', color: '#1d4ed8' },
  resolved:    { label: 'Resolved',    color: '#15803d' },
}

const PRIORITY_CFG = {
  high:   { label: '🔴 High',   color: '#ef4444', bg: '#fef2f2' },
  medium: { label: '🟡 Medium', color: '#f59e0b', bg: '#fffbeb' },
  low:    { label: '🟢 Low',    color: '#10b981', bg: '#f0fdf4' },
}

const POINTS_OPTIONS = [
  { label: '✅ Valid — High',   priority: 'high',   isValid: true,  pts: 30, color: '#ef4444', bg: '#fef2f2' },
  { label: '✅ Valid — Medium', priority: 'medium', isValid: true,  pts: 20, color: '#f59e0b', bg: '#fffbeb' },
  { label: '✅ Valid — Low',    priority: 'low',    isValid: true,  pts: 10, color: '#10b981', bg: '#f0fdf4' },
  { label: '❌ Invalid',        priority: 'none',   isValid: false, pts: -5, color: '#94a3b8', bg: '#f8fafc' },
]

// ══════════════════════════════════════════════════════════════
//  AI PRIORITY ANALYSER
//  Analyses: keywords + time + nearby places (Google Maps API)
// ══════════════════════════════════════════════════════════════
async function analyseWithAI(description, lat, lng, createdAt) {
  const reasons = []
  let score = 0  // higher = more urgent

  // ── 1. Description Keywords ────────────────────────────────
  const text = description.toLowerCase()

  const highKeywords = [
    'accident', 'dangerous', 'fire', 'flood', 'electric shock',
    'fallen wire', 'live wire', 'collapse', 'emergency', 'urgent',
    'injury', 'explosion', 'gas leak', 'electrocution', 'burning'
  ]
  const medKeywords = [
    'broken', 'damaged', 'leaking', 'pothole', 'streetlight',
    'crack', 'blocked', 'sewage', 'overflow', 'fallen tree',
    'road damage', 'water pipe', 'power cut', 'no electricity'
  ]
  const lowKeywords = [
    'dirty', 'garbage', 'minor', 'small crack', 'litter',
    'graffiti', 'paint', 'noise', 'smell', 'complaint', 'request'
  ]

  const foundHigh = highKeywords.filter(k => text.includes(k))
  const foundMed  = medKeywords.filter(k => text.includes(k))
  const foundLow  = lowKeywords.filter(k => text.includes(k))

  if (foundHigh.length > 0) {
    score += 3
    reasons.push(`🔴 Dangerous keywords: "${foundHigh.join('", "')}"`)
  } else if (foundMed.length > 0) {
    score += 2
    reasons.push(`🟡 Issue keywords: "${foundMed.join('", "')}"`)
  } else if (foundLow.length > 0) {
    score += 1
    reasons.push(`🟢 Minor keywords: "${foundLow.join('", "')}"`)
  } else {
    score += 1
    reasons.push('📝 No specific urgency keywords found')
  }

  // ── 2. Time of Report ──────────────────────────────────────
  const reportTime = new Date(createdAt)
  const hour = reportTime.getHours()

  const isPeak  = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)
  const isNight = hour >= 22 || hour <= 5

  if (isNight) {
    score += 2
    reasons.push(`🌙 Night time report (${hour}:00) — safety concern`)
  } else if (isPeak) {
    score += 1
    reasons.push(`🚦 Peak hour report (${hour}:00) — high traffic impact`)
  } else {
    reasons.push(`🕐 Off-peak hours (${hour}:00)`)
  }

  // ── 3. Nearby Places via Google Maps API ──────────────────
  try {
    const types = ['hospital', 'school', 'police', 'fire_station']
    const radius = 300  // 300 meters

    let nearbyHighPlaces = []
    let nearbyMedPlaces  = []

    for (const type of types) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GMAPS_KEY}`
      try {
        const res  = await fetch(url)
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          nearbyHighPlaces.push(...data.results.slice(0, 2).map(p => p.name))
        }
      } catch (_) {}
    }

    // Check markets, bus stops
    const medTypes = ['bus_station', 'shopping_mall', 'market', 'transit_station']
    for (const type of medTypes) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${300}&type=${type}&key=${GMAPS_KEY}`
      try {
        const res  = await fetch(url)
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          nearbyMedPlaces.push(...data.results.slice(0, 2).map(p => p.name))
        }
      } catch (_) {}
    }

    if (nearbyHighPlaces.length > 0) {
      score += 3
      reasons.push(`🏥 Near critical places: ${nearbyHighPlaces.slice(0, 3).join(', ')}`)
    } else if (nearbyMedPlaces.length > 0) {
      score += 1
      reasons.push(`🚌 Near public places: ${nearbyMedPlaces.slice(0, 3).join(', ')}`)
    } else {
      reasons.push('🏘️ Residential/interior area')
    }

    // ── 4. Road Type via Geocoding ─────────────────────────
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAPS_KEY}`
    const geoRes  = await fetch(geocodeUrl)
    const geoData = await geoRes.json()

    if (geoData.results && geoData.results.length > 0) {
      const addr = geoData.results[0].formatted_address?.toLowerCase() || ''
      const types = geoData.results[0].types || []
      const components = geoData.results[0].address_components || []
      const routeComp = components.find(c => c.types.includes('route'))
      const routeName = routeComp?.long_name?.toLowerCase() || ''

      const isMainRoad = types.includes('route') &&
        (routeName.includes('main') || routeName.includes('highway') ||
         routeName.includes('national') || routeName.includes('nh') ||
         routeName.includes('road') || routeName.includes('avenue') ||
         routeName.includes('boulevard'))

      const isLane = routeName.includes('lane') || routeName.includes('gully') ||
        routeName.includes('cross') || routeName.includes('street')

      if (isMainRoad) {
        score += 3
        reasons.push(`🛣️ Main road location: "${routeComp?.long_name}"`)
      } else if (isLane) {
        score += 1
        reasons.push(`🔀 Lane/street location: "${routeComp?.long_name}"`)
      } else {
        score += 1
        reasons.push(`📍 Location: ${geoData.results[0].formatted_address?.split(',').slice(0, 2).join(',')}`)
      }
    }

  } catch (e) {
    reasons.push('📍 Location analysis: Google Maps API unavailable')
    score += 1
  }

  // ── Determine final priority from score ───────────────────
  let priority
  if (score >= 7) {
    priority = 'high'
  } else if (score >= 4) {
    priority = 'medium'
  } else {
    priority = 'low'
  }

  return { priority, reasons, score }
}

// ══════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const [reports,      setReports]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState('all')
  const [expandedId,   setExpandedId]   = useState(null)
  const [noteInputs,   setNoteInputs]   = useState({})
  const [notif,        setNotif]        = useState('')
  const [busy,         setBusy]         = useState('')
  const [aiLoading,    setAiLoading]    = useState({})  // reportId → true/false
  const [aiResults,    setAiResults]    = useState({})  // reportId → {priority, reasons}

  const { authUser, setAuthUser } = useAuth()
  const navigate  = useNavigate()
  const timerRef  = useRef(null)
  const pollRef   = useRef(null)

  useEffect(() => {
    loadReports()
    pollRef.current = setInterval(loadReports, 10000)
    return () => { clearInterval(pollRef.current); clearTimeout(timerRef.current) }
  }, [])

  const loadReports = async () => {
    try {
      const res = await db.listDocuments(DB_ID, REPORTS_COL, [
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ])
      setReports(res.documents || [])
    } catch (e) {
      console.error('loadReports:', e)
    }
    setLoading(false)
  }

  // ── Run AI Analysis on a report ────────────────────────────
  const runAIAnalysis = async (report) => {
    setAiLoading(p => ({ ...p, [report.$id]: true }))
    try {
      const result = await analyseWithAI(
        report.description || '',
        report.latitude,
        report.longitude,
        report.$createdAt,
      )
      setAiResults(p => ({ ...p, [report.$id]: result }))

      // Auto-save AI priority to Appwrite
      await db.updateDocument(DB_ID, REPORTS_COL, report.$id, {
        priority:  result.priority,
        adminNote: `AI Priority: ${result.priority.toUpperCase()} — ${result.reasons.join(' | ')}`,
      })
      await loadReports()
      toast(`🤖 AI Analysis complete! Priority: ${result.priority.toUpperCase()}`)
    } catch (e) {
      console.error('AI analysis error:', e)
      toast('❌ AI analysis failed. Please try again.')
    }
    setAiLoading(p => ({ ...p, [report.$id]: false }))
  }

  // ── Assign to department ───────────────────────────────────
  const assignDept = async (reportId, deptName) => {
    const key = `assign-${reportId}-${deptName}`
    setBusy(key)
    try {
      await db.updateDocument(DB_ID, REPORTS_COL, reportId, {
        status:     'assigned',
        department: deptName,
      })
      await loadReports()
      toast(`✅ Assigned to ${deptName} Department!`)
    } catch (e) {
      toast('❌ Failed to assign.')
    }
    setBusy('')
  }

  // ── Award Points ───────────────────────────────────────────
  // Updates reports + user.points in Appwrite
  const awardPoints = async (report, option) => {
    const key = `pts-${report.$id}`
    setBusy(key)
    try {
      // Update report
      await db.updateDocument(DB_ID, REPORTS_COL, report.$id, {
      isValid:       option.isValid,
      priority:      option.priority,
      pointsAwarded: option.pts,
      status: option.isValid ? report.status : 'resolved' // 🔥 force stop
        })

      // Get user current points
      const userDoc = await db.getDocument(DB_ID, USER_COL, report.userId)
      const current = userDoc.points ?? 0
      const newPts  = Math.max(0, current + option.pts)

      // Update user points
      await db.updateDocument(DB_ID, USER_COL, report.userId, {
        points: newPts,
      })

      await loadReports()
      const msg = option.isValid
        ? `🏆 +${option.pts} pts awarded to ${report.username}! New total: ${newPts} pts`
        : `❌ Report marked invalid. -5 pts from ${report.username}`
      toast(msg)
    } catch (e) {
      console.error('awardPoints:', e)
      toast('❌ Failed to award points. Check if user table has "points" column.')
    }
    setBusy('')
  }

  const saveNote = async (reportId) => {
    const note = noteInputs[reportId]?.trim()
    if (!note) return
    setBusy(`note-${reportId}`)
    try {
      await db.updateDocument(DB_ID, REPORTS_COL, reportId, { adminNote: note })
      await loadReports()
      setNoteInputs(p => ({ ...p, [reportId]: '' }))
      toast('📝 Note saved!')
    } catch (e) {
      toast('❌ Could not save note.')
    }
    setBusy('')
  }

  const toast = (msg) => {
    setNotif(msg)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setNotif(''), 5000)
  }

  const handleLogout = () => { setAuthUser(null); navigate('/') }

  const list = filter === 'all' ? reports : reports.filter(r => r.status === filter)
  const cnt  = (st) => reports.filter(r => r.status === st).length

  const alreadyAwarded = (r) =>
    r.pointsAwarded !== undefined && r.pointsAwarded !== null && r.pointsAwarded !== 0

  return (
    <div style={s.page}>

      {/* NAVBAR */}
      <nav style={s.nav}>
        <div style={s.navL}>
          <span style={s.logo}>🏛️ Civic Issue Portal</span>
          <span style={s.badge}>ADMIN</span>
        </div>
        <div style={s.navR}>
          <span style={s.who}>👤 {authUser?.name}</span>
          {cnt('pending') > 0 && (
            <span style={s.bell}>🔔<span style={s.bellN}>{cnt('pending')}</span></span>
          )}
          <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {notif && <div style={s.toast}>{notif}</div>}

      <div style={s.wrap}>

        {/* STATS */}
        <div style={s.statsGrid}>
          {[
            { label: '📋 Total',       n: reports.length,     color: '#2563eb' },
            { label: '⏳ Pending',     n: cnt('pending'),      color: '#d97706' },
            { label: '📤 Assigned',    n: cnt('assigned'),     color: '#7c3aed' },
            { label: '🔧 In Progress', n: cnt('in_progress'),  color: '#1d4ed8' },
            { label: '✅ Resolved',    n: cnt('resolved'),     color: '#15803d' },
          ].map(({ label, n, color }) => (
            <div key={label} style={{ ...s.statCard, borderTop: `4px solid ${color}` }}>
              <div style={{ ...s.statN, color }}>{n}</div>
              <div style={s.statL}>{label}</div>
            </div>
          ))}
        </div>

        {/* AI SYSTEM BANNER */}
        <div style={s.aiBanner}>
          <div style={s.aiLeft}>
            <span style={s.aiIcon}>🤖</span>
            <div>
              <div style={s.aiTitle}>AI Priority Detection Active</div>
              <div style={s.aiSub}>Analyses: keywords · time · nearby places · road type via Google Maps</div>
            </div>
          </div>
          <div style={s.aiRight}>
            <span style={{ ...s.aiPill, background: '#fef2f2', color: '#ef4444' }}>🔴 High = urgent</span>
            <span style={{ ...s.aiPill, background: '#fffbeb', color: '#f59e0b' }}>🟡 Medium</span>
            <span style={{ ...s.aiPill, background: '#f0fdf4', color: '#10b981' }}>🟢 Low</span>
          </div>
        </div>

        {/* POINTS GUIDE */}
        <div style={s.ptsBanner}>
          <span style={s.pbTitle}>🏆 Points:</span>
          {POINTS_OPTIONS.map(o => (
            <span key={o.priority}
              style={{ ...s.pbPill, background: o.bg, color: o.color, border: `1px solid ${o.color}40` }}>
              {o.label} → <strong>{o.pts > 0 ? `+${o.pts}` : o.pts} pts</strong>
            </span>
          ))}
        </div>

        {/* STATUS FLOW */}
        <div style={s.flowBar}>
          <span style={s.flowHead}>Flow:</span>
          {['pending', 'assigned', 'in_progress', 'resolved'].map((st, i, a) => (
            <span key={st} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...s.flowPill, background: STATUS_STYLE[st].color }}>
                {STATUS_STYLE[st].label}
              </span>
              {i < a.length - 1 && <span style={s.flowArrow}>→</span>}
            </span>
          ))}
        </div>

        {/* FILTER TABS */}
        <div style={s.tabs}>
          {['all', 'pending', 'assigned', 'in_progress', 'resolved'].map(f => (
            <button key={f} style={filter === f ? s.tabOn : s.tabOff}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* REPORT LIST */}
        {loading ? (
          <div style={s.center}><div style={s.spin} /><p style={s.centerTxt}>Loading...</p></div>
        ) : list.length === 0 ? (
          <div style={s.center}><div style={{ fontSize: 52 }}>📭</div><p style={s.centerTxt}>No reports.</p></div>
        ) : (
          list.map(r => {
            const st   = STATUS_STYLE[r.status] || STATUS_STYLE.pending
            const exp  = expandedId === r.$id
            const di   = DEPARTMENTS.find(d => d.name === r.department)
            const pcfg = r.priority && r.priority !== 'none' ? PRIORITY_CFG[r.priority] : null
            const aiR  = aiResults[r.$id]
            const awarded = alreadyAwarded(r)

            return (
              <div key={r.$id} style={{ ...s.card, borderLeft: `5px solid ${st.color}` }}>

                {/* CARD HEADER */}
                <div style={s.cardTop} onClick={() => setExpandedId(exp ? null : r.$id)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.tagRow}>
                      <span style={{ ...s.tag, background: st.color }}>{st.label}</span>
                      {di    && <span style={{ ...s.tag, background: di.color }}>{di.icon} {di.name}</span>}
                      {pcfg  && <span style={{ ...s.tag, background: pcfg.color }}>{pcfg.label} Priority</span>}
                      {awarded && (
                        <span style={{ ...s.tag, background: r.pointsAwarded > 0 ? '#15803d' : '#64748b' }}>
                          {r.pointsAwarded > 0 ? `🏆 +${r.pointsAwarded} pts` : `❌ ${r.pointsAwarded} pts`}
                        </span>
                      )}
                    </div>
                    <div style={s.cardName}>Reported by <strong>{r.username || 'Unknown'}</strong></div>
                    <div style={s.cardDate}>
                      🕐 {new Date(r.$createdAt).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {r.latitude && (
                        <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank" rel="noreferrer" style={s.mapA}
                          onClick={e => e.stopPropagation()}>  📍 Map</a>
                      )}
                    </div>
                  </div>
                  <span style={s.chevron}>{exp ? '▲' : '▼'}</span>
                </div>

                <p style={s.desc}>{r.description || 'No description.'}</p>

                {/* EXPANDED */}
                {exp && (
                  <div style={s.body}>
                       {isInvalidReport(r) && (
                        <div style={{
                         background: '#fef2f2',
                          border: '1.5px solid #ef4444',
                          color: '#b91c1c',
                          borderRadius: 12,
                          padding: '12px 14px',
                        marginTop: 10,
                        fontWeight: 600
                        }}>
                        ❌ This report is marked INVALID. No further action allowed.
                       </div>
                       )}

                    {/* Photo */}
                    {r.image && (
                      <div style={{ marginBottom: 14 }}>
                        <p style={s.secLabel}>📷 Issue Photo</p>
                        <img src={imgUrl(r.image)} alt="Issue" style={s.photo}
                          onClick={() => window.open(imgUrl(r.image), '_blank')} />
                        <p style={s.photoHint}>Click to view full size</p>
                      </div>
                    )}

                    {/* GPS */}
                    {r.latitude && (
                      <div style={s.locBox}>
                        <span style={{ fontSize: 20 }}>📍</span>
                        <div>
                          <div style={s.locTitle}>GPS Location</div>
                          <div style={s.locCoord}>
                            Lat: {Number(r.latitude).toFixed(6)} &nbsp;|&nbsp; Lng: {Number(r.longitude).toFixed(6)}
                          </div>
                        </div>
                        <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`}
                          target="_blank" rel="noreferrer" style={s.locBtn}>Open Map →</a>
                      </div>
                    )}

                    {/* ── AI ANALYSIS SECTION ────────────────── */}
                    <div style={s.aiBox}>
                      <div style={s.aiBoxHeader}>
                        <span style={s.aiBoxTitle}>🤖 AI Priority Analysis</span>
                        {!r.priority && !aiR && !isInvalidReport(r) && (
                          <button
                            style={s.aiRunBtn}
                            onClick={() => runAIAnalysis(r)}
                            disabled={aiLoading[r.$id]}>
                            {aiLoading[r.$id] ? '⏳ Analysing...' : '▶ Run AI Analysis'}
                          </button>
                        )}
                        {(r.priority || aiR) && (
                          <button
                            style={{ ...s.aiRunBtn, background: '#f1f5f9', color: '#475569' }}
                            onClick={() => runAIAnalysis(r)}
                            disabled={aiLoading[r.$id]}>
                            {aiLoading[r.$id] ? '⏳ Re-analysing...' : '🔄 Re-analyse'}
                          </button>
                        )}
                      </div>

                      {/* Show AI result from Appwrite (saved) or local state */}
                      {(r.priority && r.priority !== 'none') || aiR ? (() => {
                        const priority = aiR?.priority || r.priority
                        const reasons  = aiR?.reasons  || (r.adminNote ? [r.adminNote] : [])
                        const cfg      = PRIORITY_CFG[priority] || PRIORITY_CFG.low

                        return (
                          <div style={{ marginTop: 12 }}>
                            {/* Priority result */}
                            <div style={{ ...s.aiResult, background: cfg.bg, borderColor: cfg.color }}>
                              <div style={{ fontSize: 28 }}>
                                {priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 16, color: cfg.color }}>
                                  {priority.toUpperCase()} PRIORITY
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                  AI detected this based on the analysis below
                                </div>
                              </div>
                            </div>

                            {/* Reasons breakdown */}
                            {reasons.length > 0 && (
                              <div style={s.reasonsBox}>
                                <div style={s.reasonsTitle}>📊 Analysis Breakdown:</div>
                                {reasons.map((reason, i) => (
                                  <div key={i} style={s.reasonItem}>
                                    <span style={s.reasonDot}>•</span>
                                    <span>{reason}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })() : (
                        <div style={s.aiEmpty}>
                          Click "Run AI Analysis" to auto-detect priority based on
                          description keywords, time of report, nearby places and road type.
                        </div>
                      )}
                    </div>

                    {/* Admin note display */}
                    {r.adminNote && (
                      <div style={s.noteShow}>
                        📝 <strong>Note:</strong> {r.adminNote}
                      </div>
                    )}

                    {/* Add note */}
                    {r.status !== 'resolved' && (
                      <div style={s.noteRow}>
                        <input style={s.noteInput} type="text"
                          placeholder="Add a note for the department..."
                          value={noteInputs[r.$id] || ''}
                          onChange={e => setNoteInputs(p => ({ ...p, [r.$id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveNote(r.$id)} />
                        <button style={s.noteBtn} onClick={() => saveNote(r.$id)}
                          disabled={busy === `note-${r.$id}`}>
                          {busy === `note-${r.$id}` ? '...' : 'Save'}
                        </button>
                      </div>
                    )}

                    {/* ── ASSIGN TO DEPARTMENT ──────────────── */}
                    {r.status === 'pending' && !isInvalidReport(r) && (
                      <div style={s.assignBox}>
                        <p style={s.assignTitle}>
                          📤 Assign to Department:
                          {r.priority && r.priority !== 'none' && (
                            <span style={{ marginLeft: 8, fontSize: 13, color: PRIORITY_CFG[r.priority]?.color }}>
                              (AI suggests {r.priority} priority)
                            </span>
                          )}
                        </p>
                        <div style={s.assignRow}>
                          {DEPARTMENTS.map(dept => {
                            const k = `assign-${r.$id}-${dept.name}`
                            return (
                              <button key={dept.name}
                                style={{ ...s.assignBtn, background: dept.color }}
                                onClick={() => assignDept(r.$id, dept.name)}
                                disabled={busy === k}>
                                {busy === k ? '⏳...' : `${dept.icon} ${dept.name}`}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── POINTS VALIDATION (resolved + not awarded) ── */}
                    {(r.priority && r.priority !== 'none') && !awarded && (
                      <div style={s.ptsBox}>
                        <p style={s.ptsTitle}>🏆 Award Points to {r.username || 'User'}</p>
                        <p style={s.ptsSub}>
                          Review and award points. AI suggested:
                          {r.priority && r.priority !== 'none'
                            ? <strong style={{ color: PRIORITY_CFG[r.priority]?.color }}> {r.priority.toUpperCase()}</strong>
                            : ' Run AI analysis first for suggestion'}
                        </p>
                        <div style={s.ptsRow}>
                          {POINTS_OPTIONS.map(opt => {
                            const k   = `pts-${r.$id}`
                            const rec = r.priority === opt.priority  // AI recommended this one
                            return (
                              <button key={opt.priority}
                                style={{
                                  ...s.ptsBtn,
                                  background: opt.bg,
                                  color: opt.color,
                                  border: rec ? `3px solid ${opt.color}` : `1.5px solid ${opt.color}50`,
                                  transform: rec ? 'scale(1.03)' : 'scale(1)',
                                }}
                                onClick={() => awardPoints(r, opt)}
                                disabled={!!busy}>
                                {rec && <div style={{ fontSize: 10, marginBottom: 2 }}>🤖 AI Suggested</div>}
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
                                <div style={{ fontSize: 20, fontWeight: 800 }}>
                                  {opt.pts > 0 ? `+${opt.pts}` : opt.pts} pts
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Points already awarded */}
                    {r.status === 'resolved' && awarded && (
                      <div style={{
                        ...s.ptsAwarded,
                        borderColor: r.pointsAwarded > 0 ? '#10b981' : '#94a3b8',
                        background:  r.pointsAwarded > 0 ? '#f0fdf4' : '#f8fafc',
                        color:       r.pointsAwarded > 0 ? '#15803d' : '#64748b',
                      }}>
                        <span style={{ fontSize: 26 }}>{r.pointsAwarded > 0 ? '🏆' : '❌'}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {r.pointsAwarded > 0
                              ? `+${r.pointsAwarded} points awarded to ${r.username}`
                              : `Report marked invalid — ${r.pointsAwarded} pts deducted`}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Priority: {r.priority || 'N/A'} &nbsp;|&nbsp;
                            Valid: {r.isValid ? 'Yes ✅' : 'No ❌'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Status message */}
                    {(r.status === 'assigned' || r.status === 'in_progress') && (
                      <div style={{ ...s.statusMsg, borderColor: st.color, color: st.color }}>
                        {r.status === 'assigned'    && `📤 Waiting for ${r.department || 'dept'} to start work`}
                        {r.status === 'in_progress' && `🔧 ${r.department || 'Department'} is currently working on this`}
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
  page:       { minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Segoe UI, sans-serif' },
  nav:        { background: '#1e3a5f', color: '#fff', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' },
  navL:       { display: 'flex', alignItems: 'center', gap: 12 },
  logo:       { fontSize: 20, fontWeight: 800 },
  badge:      { background: '#f59e0b', color: '#1e3a5f', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800 },
  navR:       { display: 'flex', alignItems: 'center', gap: 16 },
  who:        { fontSize: 14, color: '#cbd5e1' },
  bell:       { fontSize: 18 },
  bellN:      { background: '#ef4444', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: 11, fontWeight: 800, marginLeft: 2 },
  logoutBtn:  { background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  toast:      { position: 'fixed', top: 70, right: 24, background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 999, fontSize: 14, fontWeight: 500, maxWidth: 400 },
  wrap:       { maxWidth: 980, margin: '0 auto', padding: '24px 16px' },
  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 14 },
  statCard:   { background: '#fff', borderRadius: 14, padding: '16px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  statN:      { fontSize: 28, fontWeight: 800 },
  statL:      { fontSize: 11, color: '#64748b', marginTop: 4 },
  // AI Banner
  aiBanner:   { background: 'linear-gradient(135deg, #1e3a8a, #4f46e5)', borderRadius: 14, padding: '14px 18px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  aiLeft:     { display: 'flex', alignItems: 'center', gap: 12 },
  aiIcon:     { fontSize: 28 },
  aiTitle:    { color: '#fff', fontWeight: 700, fontSize: 14 },
  aiSub:      { color: '#a5b4fc', fontSize: 12 },
  aiRight:    { display: 'flex', gap: 8, flexWrap: 'wrap' },
  aiPill:     { padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  // Points banner
  ptsBanner:  { background: '#fff', borderRadius: 12, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  pbTitle:    { fontSize: 13, fontWeight: 700, color: '#475569' },
  pbPill:     { padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 },
  flowBar:    { background: '#fff', borderRadius: 12, padding: '10px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  flowHead:   { fontSize: 13, fontWeight: 700, color: '#475569' },
  flowPill:   { color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 },
  flowArrow:  { color: '#94a3b8', fontWeight: 700 },
  tabs:       { display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  tabOff:     { padding: '8px 16px', borderRadius: 20, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569' },
  tabOn:      { padding: '8px 16px', borderRadius: 20, border: 'none', background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  center:     { textAlign: 'center', padding: '60px 0' },
  centerTxt:  { color: '#94a3b8', marginTop: 12 },
  spin:       { width: 40, height: 40, border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' },
  card:       { background: '#fff', borderRadius: 16, padding: '18px 20px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer' },
  cardTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  tagRow:     { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  tag:        { color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  cardName:   { fontSize: 15, fontWeight: 600, color: '#1e293b' },
  cardDate:   { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  mapA:       { color: '#3b82f6', textDecoration: 'none', marginLeft: 6 },
  chevron:    { color: '#94a3b8', fontSize: 13, marginLeft: 10, flexShrink: 0 },
  desc:       { color: '#475569', fontSize: 14, margin: '6px 0 0', lineHeight: 1.6 },
  body:       { marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 },
  secLabel:   { fontSize: 12, fontWeight: 700, color: '#64748b', margin: '0 0 6px' },
  photo:      { width: 140, height: 140, objectFit: 'cover', borderRadius: 12, cursor: 'pointer', border: '2px solid #e2e8f0', display: 'block' },
  photoHint:  { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  locBox:     { display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', borderRadius: 12, padding: '10px 14px', marginBottom: 14 },
  locTitle:   { fontWeight: 700, fontSize: 13 },
  locCoord:   { fontSize: 12, color: '#64748b' },
  locBtn:     { marginLeft: 'auto', background: '#3b82f6', color: '#fff', padding: '7px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  // AI Analysis box
  aiBox:      { background: '#f8faff', border: '1.5px solid #c7d2fe', borderRadius: 14, padding: '14px 16px', marginBottom: 14 },
  aiBoxHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  aiBoxTitle: { fontSize: 14, fontWeight: 700, color: '#3730a3' },
  aiRunBtn:   { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  aiResult:   { display: 'flex', alignItems: 'center', gap: 14, border: '2px solid', borderRadius: 12, padding: '12px 16px', marginBottom: 10 },
  reasonsBox: { background: '#fff', borderRadius: 10, padding: '10px 14px' },
  reasonsTitle:{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 },
  reasonItem: { display: 'flex', gap: 8, fontSize: 13, color: '#374151', padding: '3px 0' },
  reasonDot:  { color: '#6366f1', flexShrink: 0 },
  aiEmpty:    { color: '#64748b', fontSize: 13, marginTop: 8, lineHeight: 1.6 },
  noteShow:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#92400e', marginBottom: 12 },
  noteRow:    { display: 'flex', gap: 8, marginBottom: 14 },
  noteInput:  { flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' },
  noteBtn:    { background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' },
  assignBox:  { background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 14, padding: '14px 16px', marginTop: 6 },
  assignTitle:{ fontSize: 14, fontWeight: 700, color: '#3730a3', margin: '0 0 12px' },
  assignRow:  { display: 'flex', gap: 10, flexWrap: 'wrap' },
  assignBtn:  { color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  statusMsg:  { border: '1.5px solid', borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 500, marginTop: 8 },
  ptsBox:     { background: '#fefce8', border: '2px solid #fde68a', borderRadius: 16, padding: '16px', marginTop: 12 },
  ptsTitle:   { fontSize: 15, fontWeight: 800, color: '#92400e', margin: '0 0 6px' },
  ptsSub:     { fontSize: 12, color: '#a16207', margin: '0 0 14px', lineHeight: 1.5 },
  ptsRow:     { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  ptsBtn:     { padding: '12px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', fontFamily: 'Segoe UI, sans-serif', transition: 'all 0.15s' },
  ptsAwarded: { display: 'flex', alignItems: 'center', gap: 14, border: '1.5px solid', borderRadius: 12, padding: '12px 16px', marginTop: 12 },
}