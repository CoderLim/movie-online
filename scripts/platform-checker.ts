import { apiClient } from './lib/api-client'
import { PLATFORM_SEARCHERS } from './lib/platform-search'
import { matchesMovie } from '../src/lib/platform-match'

const APP_URL = process.env.APP_URL!
const SYNC_SECRET = process.env.SYNC_SECRET!

interface MovieToCheck {
  id: number
  title: string
  release_date: string
  theater_end_date: string
  platforms: Array<{ platform: string; status: string; last_checked_at: string | null }>
}

const PLATFORM_KEYS = ['tencent', 'iqiyi', 'youku', 'mango', 'bilibili', 'xigua'] as const

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function shouldCheck(lastCheckedAt: string | null, theaterEndDate: string): boolean {
  const days = daysSince(theaterEndDate)
  if (days < 0) return false
  const interval = days <= 30 ? 1 : days <= 90 ? 3 : 7
  if (!lastCheckedAt) return true
  return daysSince(lastCheckedAt) >= interval
}

async function checkPlatform(
  movie: MovieToCheck,
  platformKey: (typeof PLATFORM_KEYS)[number]
): Promise<{ status: 'available' | 'not_available'; play_url?: string }> {
  const search = PLATFORM_SEARCHERS[platformKey]
  if (!search) return { status: 'not_available' }

  const candidates = await search(movie.title)
  const movieInfo = { title: movie.title, releaseDate: movie.release_date }

  for (const candidate of candidates) {
    if (matchesMovie(movieInfo, candidate)) {
      return { status: 'available', play_url: candidate.play_url }
    }
  }

  return { status: 'not_available' }
}

async function fetchMoviesToCheck(): Promise<MovieToCheck[]> {
  const res = await fetch(`${APP_URL}/api/movies?needs_check=1`, {
    headers: { Authorization: `Bearer ${SYNC_SECRET}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch movies to check: ${res.status}`)
  return (await res.json() as { movies: MovieToCheck[] }).movies
}

async function main() {
  console.log('[platform-checker] Starting...')
  const movies = await fetchMoviesToCheck()
  console.log(`[platform-checker] ${movies.length} movies to process`)

  const updates: Array<{ movie_id: number; platform: string; status: string; play_url?: string }> = []

  for (const movie of movies) {
    for (const platformKey of PLATFORM_KEYS) {
      const existingPlatform = movie.platforms.find(p => p.platform === platformKey)
      if (existingPlatform?.status === 'available') continue
      // 未上线结果可能是误报，每次运行都重检；仅对已确认上线的跳过
      const needsInterval =
        existingPlatform?.status === 'not_available'
          ? false
          : !shouldCheck(existingPlatform?.last_checked_at ?? null, movie.theater_end_date)
      if (needsInterval) continue

      console.log(`[platform-checker] Checking ${movie.title} on ${platformKey}`)
      try {
        const result = await checkPlatform(movie, platformKey)
        updates.push({ movie_id: movie.id, platform: platformKey, ...result })
        console.log(`[platform-checker]   → ${result.status}${result.play_url ? ` ${result.play_url}` : ''}`)
      } catch (err) {
        console.error(`[platform-checker] Error checking ${movie.title} on ${platformKey}:`, err)
      }

      await new Promise(r => setTimeout(r, 500))
    }
  }

  if (updates.length > 0) {
    await apiClient.syncPlatforms(updates)
  }
  console.log(`[platform-checker] Done. ${updates.length} platform updates`)
}

main().catch(err => {
  console.error('[platform-checker] FAILED:', err)
  process.exit(1)
})
