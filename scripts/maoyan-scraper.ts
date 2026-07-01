import { apiClient } from './lib/api-client'

interface MaoyanEntry {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: null  // all movies in the hot list are still in theaters
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

async function scrapeMaoyanList(): Promise<MaoyanEntry[]> {
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

async function main() {
  console.log('[maoyan-scraper] Starting...')
  try {
    const movies = await scrapeMaoyanList()
    console.log(`[maoyan-scraper] Found ${movies.length} movies in theaters`)

    if (movies.length === 0) {
      throw new Error('No movies scraped — possible API breakage, aborting to prevent mark-left-theater wipe')
    }

    await apiClient.syncMovies(movies)
    console.log('[maoyan-scraper] Synced to DB')
  } catch (err) {
    console.error('[maoyan-scraper] FAILED:', err)
    process.exit(1)
  }
}

main()
