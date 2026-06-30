import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'
import { matchesMovie, type PlatformResult } from '../src/lib/platform-match'

const APP_URL = process.env.APP_URL!
const SYNC_SECRET = process.env.SYNC_SECRET!

interface MovieToCheck {
  id: number
  title: string
  release_date: string
  theater_end_date: string
  platforms: Array<{ platform: string; status: string; last_checked_at: string | null }>
}

const PLATFORMS = [
  { key: 'tencent', searchUrl: (title: string) => `https://v.qq.com/x/search/?q=${encodeURIComponent(title)}&stag=0&filter_type=movie` },
  { key: 'iqiyi',   searchUrl: (title: string) => `https://www.iqiyi.com/search.html#src=input&query=${encodeURIComponent(title)}` },
  { key: 'youku',   searchUrl: (title: string) => `https://so.youku.com/search_video/q_${encodeURIComponent(title)}?searchfrom=1` },
  { key: 'mango',   searchUrl: (title: string) => `https://so.mgtv.com/so/k-${encodeURIComponent(title)}.html` },
  { key: 'bilibili', searchUrl: (title: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}&search_type=video&tids=23` },
  { key: 'xigua',  searchUrl: (title: string) => `https://www.ixigua.com/search/${encodeURIComponent(title)}/?search_type=video` },
]

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function shouldCheck(lastCheckedAt: string | null, theaterEndDate: string): boolean {
  const days = daysSince(theaterEndDate)
  // Only check movies that have actually left theaters
  if (days < 0) return false
  const interval = days <= 30 ? 1 : days <= 90 ? 3 : 7
  if (!lastCheckedAt) return true
  const daysSinceCheck = daysSince(lastCheckedAt)
  return daysSinceCheck >= interval
}

async function checkPlatform(
  movie: MovieToCheck,
  platform: typeof PLATFORMS[0]
): Promise<{ status: 'available' | 'not_available'; play_url?: string }> {
  const page = await fetchWithBrowser(platform.searchUrl(movie.title))
  try {
    // Return all candidates so matchesMovie can evaluate each one
    const candidates = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[class*="result"], [class*="item"], [class*="card"]')).slice(0, 5)
      return items.map(item => {
        const titleEl = item.querySelector('[class*="title"], h3, h2') as HTMLElement | null
        const rawTitle = titleEl?.textContent?.trim() ?? ''
        const yearEl = item.querySelector('[class*="year"], [class*="date"]')
        const yearText = yearEl?.textContent ?? ''
        const yearMatch = yearText.match(/\d{4}/)
        const year = yearMatch ? parseInt(yearMatch[0]) : 0
        const typeEl = item.querySelector('[class*="type"], [class*="category"]')
        const type = typeEl?.textContent?.toLowerCase().includes('电影') ? 'movie' : 'other'
        const durationEl = item.querySelector('[class*="duration"], [class*="time"]')
        const durationText = durationEl?.textContent ?? ''
        const durationMatch = durationText.match(/(\d+)分/)
        const durationMinutes = durationMatch ? parseInt(durationMatch[1]) : 90
        const statusEl = item.querySelector('[class*="vip"], [class*="pay"], [class*="free"]')
        const statusText = statusEl?.textContent?.toLowerCase() ?? ''
        const status = statusText.includes('预售') || statusText.includes('即将') ? 'presale' : 'available'
        const link = (item.querySelector('a') as HTMLAnchorElement | null)?.href ?? ''

        return { title: rawTitle, year, type, durationMinutes, status, link }
      })
    })

    // Check all candidates; return first match
    for (const candidate of candidates) {
      const matches = matchesMovie(
        { title: movie.title, releaseDate: movie.release_date },
        {
          title: candidate.title,
          year: candidate.year,
          type: candidate.type === 'movie' ? 'movie' : 'other',
          durationMinutes: candidate.durationMinutes,
          status: candidate.status,
        } as PlatformResult
      )
      if (matches) {
        return { status: 'available', play_url: candidate.link }
      }
    }

    return { status: 'not_available' }
  } finally {
    await page.close()
  }
}

async function fetchMoviesToCheck(): Promise<MovieToCheck[]> {
  const res = await fetch(`${APP_URL}/api/movies?needs_check=1`, {
    headers: { 'Authorization': `Bearer ${SYNC_SECRET}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch movies to check: ${res.status}`)
  return (await res.json() as { movies: MovieToCheck[] }).movies
}

async function main() {
  console.log('[platform-checker] Starting...')
  try {
    const movies = await fetchMoviesToCheck()
    console.log(`[platform-checker] ${movies.length} movies to process`)

    const updates: Array<{ movie_id: number; platform: string; status: string; play_url?: string }> = []

    for (const movie of movies) {
      for (const platform of PLATFORMS) {
        const existingPlatform = movie.platforms.find(p => p.platform === platform.key)
        if (existingPlatform?.status === 'available') continue  // already online, skip
        if (!shouldCheck(existingPlatform?.last_checked_at ?? null, movie.theater_end_date)) continue

        console.log(`[platform-checker] Checking ${movie.title} on ${platform.key}`)
        try {
          const result = await checkPlatform(movie, platform)
          updates.push({ movie_id: movie.id, platform: platform.key, ...result })
        } catch (err) {
          console.error(`[platform-checker] Error checking ${movie.title} on ${platform.key}:`, err)
        }

        await new Promise(r => setTimeout(r, 1000))
      }
    }

    if (updates.length > 0) {
      await apiClient.syncPlatforms(updates)
    }
    console.log(`[platform-checker] Done. ${updates.length} platform updates`)
  } finally {
    await closeBrowser()
  }
}

main().catch(err => {
  console.error('[platform-checker] FAILED:', err)
  process.exit(1)
})
