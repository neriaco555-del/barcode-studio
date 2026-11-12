import './admin.css'

const ADMIN_CODE = '7391'
const NEWS_TOPIC = 'barcode-studio-news-4c8e2f7a'
const UNLOCK_KEY = 'barcode-admin-web'

interface AnalyticsDay {
  date: string
  opens: number
  users: number
  qrDownloads: number
  barcodeDownloads: number
  scans: number
  updateDownloads: number
  siteDownloads: number
  actions: number
}

interface Analytics {
  generatedAt?: string
  totals?: Record<string, number>
  activeToday?: number
  active7d?: number
  byDay?: AnalyticsDay[]
  byAction?: Record<string, number>
  recent?: { time: number; event: string; extra?: Record<string, unknown> }[]
}

const ACTION_LABELS: Record<string, string> = {
  app_install: 'התקנה',
  app_open: 'פתיחת אפליקציה',
  qr_download: 'הורדת QR',
  barcode_download: 'הורדת ברקוד',
  scan_success: 'סריקה מוצלחת',
  update_download: 'הורדת עדכון',
  apk_download_click: 'הורדה מהאתר',
  site_visit: 'ביקור באתר',
}

const loginScreen = document.getElementById('login-screen')!
const dashboard = document.getElementById('dashboard')!
const loginForm = document.getElementById('login-form') as HTMLFormElement
const codeInput = document.getElementById('admin-code') as HTMLInputElement
const loginError = document.getElementById('login-error')!
const lockButton = document.getElementById('lock-button')!
const refreshButton = document.getElementById('refresh-button')!
const updatedLabel = document.getElementById('updated')!
const toast = document.getElementById('toast')!

let latest: Analytics = {}

function unlock() {
  loginScreen.hidden = true
  dashboard.hidden = false
  lockButton.hidden = false
  void loadAnalytics()
}

function lock() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    // ignore
  }
  dashboard.hidden = true
  loginScreen.hidden = false
  lockButton.hidden = true
  codeInput.value = ''
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (codeInput.value.trim() !== ADMIN_CODE) {
    loginError.hidden = false
    return
  }
  loginError.hidden = true
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    // ignore
  }
  unlock()
})

lockButton.addEventListener('click', lock)
refreshButton.addEventListener('click', () => void loadAnalytics())

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 3200)
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function setText(id: string, value: number | string) {
  const element = document.getElementById(id)
  if (element) element.textContent = typeof value === 'number' ? value.toLocaleString('he-IL') : value
}

async function loadAnalytics() {
  updatedLabel.textContent = 'טוען…'
  try {
    const response = await fetch(`./analytics.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('missing')
    latest = (await response.json()) as Analytics
  } catch {
    latest = {}
  }
  render()
}

function render() {
  const totals = latest.totals ?? {}
  setText('stat-downloads', number(totals.siteDownloadClicks))
  setText('stat-installs', number(totals.installs ?? totals.uniqueInstalls))
  setText('stat-active-today', number(latest.activeToday))
  setText('stat-active-week', number(latest.active7d))
  setText(
    'stat-qr',
    number(totals.qrDownloads) + number(totals.barcodeDownloads),
  )
  setText('stat-scans', number(totals.scans))
  updatedLabel.textContent = latest.generatedAt
    ? `עודכן ${new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(latest.generatedAt))}`
    : 'אין נתונים עדיין'

  renderChart()
  renderActions()
  renderRecent()
}

function renderChart() {
  const chart = document.getElementById('chart')!
  const days = (latest.byDay ?? []).slice(-14)
  if (days.length === 0) {
    chart.innerHTML = '<p class="chart-empty">אין נתונים עדיין — הנתונים ייאספו לאחר שימוש באפליקציה.</p>'
    return
  }
  const max = Math.max(1, ...days.flatMap((day) => [number(day.users), number(day.opens)]))
  chart.innerHTML = days
    .map((day) => {
      const users = Math.round((number(day.users) / max) * 100)
      const opens = Math.round((number(day.opens) / max) * 100)
      const label = day.date.slice(5)
      return `<div class="chart-day" title="${day.date}: ${number(day.users)} משתמשים, ${number(day.opens)} פתיחות">
        <div class="bars">
          <i class="bar-users" style="height:${Math.max(users, 2)}%"></i>
          <i class="bar-opens" style="height:${Math.max(opens, 2)}%"></i>
        </div>
        <span>${label}</span>
      </div>`
    })
    .join('')
}

function renderActions() {
  const container = document.getElementById('actions')!
  const entries = Object.entries(latest.byAction ?? {})
    .filter(([, count]) => number(count) > 0)
    .sort(([, a], [, b]) => number(b) - number(a))
    .slice(0, 8)
  if (entries.length === 0) {
    container.innerHTML = '<p class="chart-empty">עוד לא נרשמו פעולות.</p>'
    return
  }
  const max = Math.max(...entries.map(([, count]) => number(count)))
  container.innerHTML = entries
    .map(([action, count]) => {
      const width = Math.max(3, Math.round((number(count) / max) * 100))
      return `<div class="action-row">
        <span>${ACTION_LABELS[action] ?? action}</span>
        <div class="action-bar"><i style="width:${width}%"></i></div>
        <b>${number(count).toLocaleString('he-IL')}</b>
      </div>`
    })
    .join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderRecent() {
  const body = document.getElementById('recent')!
  const events = (latest.recent ?? []).slice(0, 40)
  if (events.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="chart-empty">אין פעילות עדיין.</td></tr>'
    return
  }
  body.innerHTML = events
    .map((event) => {
      const time = new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(event.time * 1000))
      const extra = event.extra ?? {}
      const details = Object.entries(extra)
        .filter(([key]) => ['version', 'format', 'ext', 'brand'].includes(key))
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(' · ')
      return `<tr>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(ACTION_LABELS[event.event] ?? event.event)}</td>
        <td>${escapeHtml(details || '—')}</td>
      </tr>`
    })
    .join('')
}

const broadcastForm = document.getElementById('broadcast-form') as HTMLFormElement
const bcTitle = document.getElementById('bc-title') as HTMLInputElement
const bcMessage = document.getElementById('bc-message') as HTMLTextAreaElement
const bcPriority = document.getElementById('bc-priority') as HTMLSelectElement
const bcSend = document.getElementById('bc-send') as HTMLButtonElement
const bcStatus = document.getElementById('bc-status')!

broadcastForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const message = bcMessage.value.trim()
  if (!message) {
    bcStatus.hidden = false
    bcStatus.className = 'bc-status error'
    bcStatus.textContent = 'כתבו תוכן להתראה.'
    return
  }
  bcSend.disabled = true
  bcStatus.hidden = false
  bcStatus.className = 'bc-status'
  bcStatus.textContent = 'שולח…'
  try {
    const response = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: NEWS_TOPIC,
        title: bcTitle.value.trim() || 'ברקוד סטודיו',
        message,
        priority: Number(bcPriority.value) || 3,
        tags: ['bell'],
      }),
    })
    if (!response.ok) throw new Error('failed')
    bcStatus.className = 'bc-status success'
    bcStatus.textContent = 'ההתראה נשלחה. היא תופיע במכשירים תוך כ־15 דקות.'
    bcMessage.value = ''
    showToast('ההתראה נשלחה בהצלחה')
  } catch {
    bcStatus.className = 'bc-status error'
    bcStatus.textContent = 'השליחה נכשלה. בדקו את החיבור ונסו שוב.'
  } finally {
    bcSend.disabled = false
  }
})

try {
  if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
    unlock()
  }
} catch {
  // stay locked
}
