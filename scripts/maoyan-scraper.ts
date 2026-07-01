import { apiClient } from './lib/api-client'
import { resolveMaoyanMovie } from './lib/maoyan-api'
import { estimateTheaterEndDate, fetchScheduledReleases } from './lib/release-schedule'

interface MaoyanEntry {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: string | null
}

interface DashboardResponse {
  movieList?: {
    data?: {
      list?: Array<{
        movieInfo: {
          movieId: number
          movieName: string
          releaseInfo: string
        }
      }>
    }
  }
}

function parseReleaseDate(releaseInfo: string): string {
  const daysMatch = releaseInfo.match(/上映(\d+)天/)
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10)
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
  }

  const dateMatch = releaseInfo.match(/(\d{4})年(\d{2})月(\d{2})日/)
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
  }

  return new Date().toISOString().slice(0, 10)
}

async function scrapeMaoyanInTheater(): Promise<MaoyanEntry[]> {
  const res = await fetch('https://piaofang.maoyan.com/dashboard-ajax?orderType=0', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': 'https://piaofang.maoyan.com/dashboard',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  })

  if (!res.ok) {
    throw new Error(`Maoyan API failed: ${res.status}`)
  }

  const data = await res.json() as DashboardResponse
  const list = data.movieList?.data?.list ?? []

  return list
    .map(item => ({
      maoyan_id: String(item.movieInfo.movieId),
      title: item.movieInfo.movieName,
      release_date: parseReleaseDate(item.movieInfo.releaseInfo),
      theater_end_date: null as null,
    }))
    .filter(e => e.maoyan_id && e.title)
}

async function scrapeHistoricalReleases(): Promise<MaoyanEntry[]> {
  const scheduled = await fetchScheduledReleases(2025, [11, 12])
  console.log(`[maoyan-scraper] Found ${scheduled.length} scheduled releases for 2025-11/12`)

  const entries: MaoyanEntry[] = []
  for (const movie of scheduled) {
    try {
      const resolved = await resolveMaoyanMovie(movie.title, movie.release_date)
      if (!resolved) {
        console.warn(`[maoyan-scraper] Could not resolve: ${movie.title} (${movie.release_date})`)
        continue
      }

      entries.push({
        maoyan_id: resolved.maoyan_id,
        title: resolved.title,
        release_date: resolved.release_date,
        theater_end_date: estimateTheaterEndDate(resolved.release_date),
      })
    } catch (err) {
      console.warn(`[maoyan-scraper] Error resolving ${movie.title}:`, err)
    }
    await new Promise(r => setTimeout(r, 150))
  }

  return entries
}

function mergeMovies(historical: MaoyanEntry[], inTheater: MaoyanEntry[]): MaoyanEntry[] {
  const map = new Map<string, MaoyanEntry>()
  for (const movie of historical) map.set(movie.maoyan_id, movie)
  for (const movie of inTheater) map.set(movie.maoyan_id, movie)
  return Array.from(map.values())
}

async function main() {
  console.log('[maoyan-scraper] Starting...')
  try {
    const [inTheater, historical] = await Promise.all([
      scrapeMaoyanInTheater(),
      scrapeHistoricalReleases(),
    ])

    console.log(`[maoyan-scraper] In theater: ${inTheater.length}, historical 2025-11/12: ${historical.length}`)

    if (inTheater.length === 0) {
      throw new Error('No in-theater movies scraped — aborting to prevent mark-left-theater wipe')
    }

    const movies = mergeMovies(historical, inTheater)
    console.log(`[maoyan-scraper] Syncing ${movies.length} movies total`)

    await apiClient.syncMovies(movies)
    console.log('[maoyan-scraper] Synced to DB')
  } catch (err) {
    console.error('[maoyan-scraper] FAILED:', err)
    process.exit(1)
  }
}

main()
