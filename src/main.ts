import QRCode from 'qrcode'
import './style.css'

const STATS_TOPIC = 'barcode-studio-stats-4c8e2f7a'
const SITE_ID_KEY = 'barcode-site-id'
const SITE_VISIT_KEY = 'barcode-site-visit'
const VISIT_THROTTLE = 30 * 60 * 1000

function siteId(): string {
  try {
    const existing = localStorage.getItem(SITE_ID_KEY)
    if (existing) return existing
    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(SITE_ID_KEY, created)
    return created
  } catch {
    return `anon-${Date.now().toString(36)}`
  }
}

function trackSite(event: string, extra: Record<string, unknown> = {}) {
  try {
    void fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        topic: STATS_TOPIC,
        title: 'stats',
        message: JSON.stringify({
          v: 1,
          install: siteId(),
          event,
          at: Math.floor(Date.now() / 1000),
          extra,
        }),
        tags: ['bar_chart'],
      }),
    }).catch(() => undefined)
  } catch {
    // analytics should never break the page
  }
}

try {
  const lastVisit = Number(localStorage.getItem(SITE_VISIT_KEY)) || 0
  if (Date.now() - lastVisit > VISIT_THROTTLE) {
    localStorage.setItem(SITE_VISIT_KEY, String(Date.now()))
    trackSite('site_visit', { page: 'landing' })
  }
} catch {
  trackSite('site_visit', { page: 'landing' })
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null
  const link = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!link) return
  if (link.href.includes('.apk')) {
    trackSite('apk_download_click', { page: 'landing' })
  }
})

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const header = document.getElementById('site-header')
const progressBar = document.getElementById('progress-bar')
const yearElement = document.getElementById('year')

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear())
}

const apkUrl = new URL('./downloads/barcode-studio.apk', window.location.href).href
const downloadLink = document.getElementById('apk-download') as HTMLAnchorElement | null
if (downloadLink) {
  downloadLink.href = apkUrl
}

/* Download QR — always points at the APK on whichever host serves this page. */
const qrCanvas = document.getElementById('download-qr') as HTMLCanvasElement | null
if (qrCanvas) {
  QRCode.toCanvas(qrCanvas, apkUrl, {
    width: 480,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#141019', light: '#ffffff' },
  }).catch(() => {
    qrCanvas.style.display = 'none'
  })
}

/* Toast */
const toast = document.getElementById('toast')
let toastTimer = 0
function showToast(message: string) {
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600)
}

/* Copy download link */
const copyButton = document.getElementById('copy-link')
copyButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(apkUrl)
    showToast('הקישור להורדה הועתק ללוח')
  } catch {
    showToast('לא הצלחנו להעתיק — אפשר ללחוץ ישירות על כפתור ההורדה')
  }
})

/* Scroll progress + header state */
let ticking = false
function onScroll() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(() => {
    const scrollTop = window.scrollY
    const height = document.documentElement.scrollHeight - window.innerHeight
    const progress = height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0
    if (progressBar) progressBar.style.width = `${progress}%`
    header?.classList.toggle('scrolled', scrollTop > 12)
    ticking = false
  })
}
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* Reveal on scroll */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in')
        revealObserver.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
)
document.querySelectorAll('[data-reveal]').forEach((element) => {
  if (prefersReduced) element.classList.add('in')
  else revealObserver.observe(element)
})

/* Animated counters */
function animateCount(element: HTMLElement) {
  const target = Number(element.dataset.count ?? 0)
  const suffix = element.dataset.suffix ?? ''
  const duration = 1400
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    element.textContent = `${Math.round(target * eased)}${suffix}`
    if (progress < 1) window.requestAnimationFrame(step)
  }
  window.requestAnimationFrame(step)
}

const stats = document.querySelector('.stats')
if (stats) {
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        stats.querySelectorAll<HTMLElement>('[data-count]').forEach((element) => {
          if (prefersReduced) {
            element.textContent = `${element.dataset.count ?? 0}${element.dataset.suffix ?? ''}`
          } else {
            animateCount(element)
          }
        })
        countObserver.disconnect()
      })
    },
    { threshold: 0.4 },
  )
  countObserver.observe(stats)
}

/* Hover glow in hero */
const hero = document.querySelector<HTMLElement>('.hero')
hero?.addEventListener('pointermove', (event) => {
  const x = (event.clientX / window.innerWidth) * 100
  const y = (event.clientY / Math.max(1, window.innerHeight)) * 100
  hero.style.setProperty('--mx', `${x}%`)
  hero.style.setProperty('--my', `${y}%`)
})

/* 3D tilt on the hero phone */
const visual = document.getElementById('hero-visual')
const phone = document.getElementById('hero-phone')
if (visual && phone && !prefersReduced && window.matchMedia('(pointer: fine)').matches) {
  let frame = 0
  visual.addEventListener('pointermove', (event) => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      const rect = visual.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      phone.style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 11}deg)`
      frame = 0
    })
  })
  visual.addEventListener('pointerleave', () => {
    phone.style.transform = ''
  })
}

/* Seamless marquee */
const marqueeTrack = document.getElementById('marquee-track')
if (marqueeTrack) {
  marqueeTrack.innerHTML += marqueeTrack.innerHTML
}

/* FAQ: only one open at a time */
const faqItems = Array.from(document.querySelectorAll<HTMLDetailsElement>('.faq details'))
faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return
    faqItems.forEach((other) => {
      if (other !== item) other.open = false
    })
  })
})

/* Smooth anchor scrolling with header offset */
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const id = anchor.getAttribute('href')
    if (!id || id === '#') return
    const target = document.querySelector(id)
    if (!target) return
    event.preventDefault()
    const top = target.getBoundingClientRect().top + window.scrollY - 84
    window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' })
  })
})
