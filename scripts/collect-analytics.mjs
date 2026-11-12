import fs from 'node:fs/promises'
import crypto from 'node:crypto'

const STATS_TOPIC = 'barcode-studio-stats-4c8e2f7a'
const STORE_URL = new URL('../analytics-store.json', import.meta.url)
const OUT_URL = new URL('../public/analytics.json', import.meta.url)

const emptyTotals = {
  installs: 0,
  opens: 0,
  qrDownloads: 0,
  barcodeDownloads: 0,
  scans: 0,
  updateDownloads: 0,
  siteDownloadClicks: 0,
  siteVisits: 0,
  actions: 0,
}

const defaultStore = {
  lastEventTime: 0,
  processedIds: [],
  installs: [],
  dayUsers: {},
  totals: emptyTotals,
  byDay: {},
  byHour: {},
  byAction: {},
  recent: [],
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  hour12: false,
})

function today() {
  return dateFormatter.format(new Date())
}

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

async function readJson(url, fallback) {
  try {
    const raw = await fs.readFile(url, 'utf8')
    return JSON.parse(raw)
  } catch {
    return structuredClone(fallback)
  }
}

function ensureDay(store, date) {
  if (!store.byDay[date]) {
    store.byDay[date] = {
      date,
      opens: 0,
      users: 0,
      qrDownloads: 0,
      barcodeDownloads: 0,
      scans: 0,
      updateDownloads: 0,
      siteDownloads: 0,
      actions: 0,
    }
  }
  if (!store.dayUsers[date]) store.dayUsers[date] = []
  if (!store.byHour[date]) store.byHour[date] = Array(24).fill(0)
  return store.byDay[date]
}

const store = await readJson(STORE_URL, defaultStore)
// Make sure older stores still have all keys
store.processedIds ??= []
store.installs ??= []
store.dayUsers ??= {}
store.totals = { ...emptyTotals, ...(store.totals ?? {}) }
store.byDay ??= {}
store.byHour ??= {}
store.byAction ??= {}
store.recent ??= []

const since = store.lastEventTime > 0 ? String(store.lastEventTime) : 'all'
let messages = []
try {
  const response = await fetch(
    `https://ntfy.sh/${STATS_TOPIC}/json?poll=1&since=${encodeURIComponent(since)}`,
    { headers: { 'User-Agent': 'BarcodeStudioAnalytics/1.0' } },
  )
  if (response.ok) {
    const text = await response.text()
    messages = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }
} catch (error) {
  console.error('Failed to fetch stats:', error.message)
}

const processed = new Set(store.processedIds)
const installSet = new Set(store.installs)
let maxTime = store.lastEventTime

for (const message of messages) {
  if (!message || message.event === 'open' || message.event === 'keepalive') continue
  if (typeof message.message !== 'string') continue
  const messageId = message.id
  if (messageId && processed.has(messageId)) continue

  let payload
  try {
    payload = JSON.parse(message.message)
  } catch {
    continue
  }
  if (!payload || typeof payload.event !== 'string' || typeof payload.at !== 'number') {
    continue
  }

  const at = payload.at
  const date = dateFormatter.format(new Date(at * 1000))
  const hour = Number(hourFormatter.format(new Date(at * 1000))) % 24
  const user = hashId(payload.install ?? 'unknown')
  const day = ensureDay(store, date)
  const event = payload.event

  if (event === 'app_install') {
    store.totals.installs += 1
    installSet.add(user)
  } else if (event === 'app_open') {
    store.totals.opens += 1
    day.opens += 1
    if (!store.dayUsers[date].includes(user)) store.dayUsers[date].push(user)
    store.byHour[date][hour] = (store.byHour[date][hour] ?? 0) + 1
  } else if (event === 'qr_download') {
    store.totals.qrDownloads += 1
    day.qrDownloads += 1
  } else if (event === 'barcode_download') {
    store.totals.barcodeDownloads += 1
    day.barcodeDownloads += 1
  } else if (event === 'scan_success') {
    store.totals.scans += 1
    day.scans += 1
  } else if (event === 'update_download') {
    store.totals.updateDownloads += 1
    day.updateDownloads += 1
  } else if (event === 'apk_download_click') {
    store.totals.siteDownloadClicks += 1
    day.siteDownloads += 1
    if (!store.dayUsers[date].includes(user)) store.dayUsers[date].push(user)
  } else if (event === 'site_visit') {
    store.totals.siteVisits += 1
    if (!store.dayUsers[date].includes(user)) store.dayUsers[date].push(user)
  }

  store.totals.actions += 1
  day.actions += 1
  store.byAction[event] = (store.byAction[event] ?? 0) + 1
  store.recent.push({
    time: at,
    event,
    extra: payload.extra && typeof payload.extra === 'object' ? payload.extra : {},
  })

  if (messageId) {
    processed.add(messageId)
    store.processedIds.push(messageId)
  }
  if (typeof message.time === 'number' && message.time > maxTime) {
    maxTime = message.time
  } else if (at > maxTime) {
    maxTime = at
  }
}

store.lastEventTime = maxTime
store.processedIds = [...processed].slice(-2000)
store.installs = [...installSet]
for (const date of Object.keys(store.byDay)) {
  store.byDay[date].users = store.dayUsers[date]?.length ?? 0
}
store.recent = store.recent
  .sort((a, b) => b.time - a.time)
  .slice(0, 80)

const keepDates = (Object.keys(store.byDay).sort().slice(-90))
for (const date of Object.keys(store.byDay)) {
  if (!keepDates.includes(date)) delete store.byDay[date]
}
for (const date of Object.keys(store.dayUsers)) {
  if (!keepDates.includes(date)) delete store.dayUsers[date]
}
for (const date of Object.keys(store.byHour)) {
  if (!keepDates.includes(date)) delete store.byHour[date]
}

const now = today()
const last7 = Object.keys(store.dayUsers)
  .filter((date) => date <= now)
  .sort()
  .slice(-7)
const active7Set = new Set()
for (const date of last7) {
  for (const user of store.dayUsers[date] ?? []) active7Set.add(user)
}

const byDay = keepDates.sort().map((date) => store.byDay[date])
const recent = store.recent.slice(0, 80).map((event) => ({
  time: event.time,
  event: event.event,
  extra: event.extra,
}))

const output = {
  generatedAt: new Date().toISOString(),
  totals: {
    ...store.totals,
    uniqueInstalls: store.installs.length,
  },
  activeToday: store.dayUsers[now]?.length ?? 0,
  active7d: active7Set.size,
  byDay,
  byHourToday: store.byHour[now] ?? Array(24).fill(0),
  byAction: store.byAction,
  recent,
}

let outputExists = true
try {
  await fs.access(OUT_URL)
} catch {
  outputExists = false
}
if (messages.length === 0 && outputExists) {
  console.log('Analytics: no new events')
  process.exit(0)
}

await fs.writeFile(STORE_URL, JSON.stringify(store, null, 2) + '\n')
await fs.writeFile(OUT_URL, JSON.stringify(output, null, 2) + '\n')
console.log(
  `Analytics collected: ${messages.length} messages, ${output.totals.actions} actions, ${output.totals.uniqueInstalls} installs`,
)
