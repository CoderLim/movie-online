import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'

const APP_URL = process.env.APP_URL!
const SYNC_SECRET = process.env.SYNC_SECRET!

interface MovieToEnrich {
  id: number
  maoyan_id: string
  title: string
  release_date: string
}

interface EnrichedData {
  maoyan_id: string
  douban_id: string
  poster_url: string
  rating: number
  description: string
}

async function fetchMoviesToEnrich(): Promise<MovieToEnrich[]> {
  const res = await fetch(`${APP_URL}/api/movies?no_douban=1`, {
    headers: { 'Authorization': `Bearer ${SYNC_SECRET}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch movies to enrich: ${res.status}`)
  const data = await res.json() as { movies: MovieToEnrich[] }
  return data.movies
}

async function enrichFromMaoyan(movie: MovieToEnrich): Promise<string | null> {
  const page = await fetchWithBrowser(`https://www.maoyan.com/films/${movie.maoyan_id}`)
  try {
    const doubanLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="movie.douban.com/subject/"]') as HTMLAnchorElement | null
      return a?.href ?? null
    })
    if (doubanLink) {
      const match = doubanLink.match(/subject\/(\d+)/)
      return match?.[1] ?? null
    }
    return null
  } finally {
    await page.close()
  }
}

async function enrichFromDoubanSearch(movie: MovieToEnrich): Promise<EnrichedData | null> {
  const year = movie.release_date.slice(0, 4)
  const query = encodeURIComponent(`${movie.title} ${year}`)
  const page = await fetchWithBrowser(`https://search.douban.com/movie/subject_search?search_text=${query}`)

  try {
    const result = await page.evaluate((year: string) => {
      const items = Array.from(document.querySelectorAll('.item-root'))
      for (const item of items) {
        const yearEl = item.querySelector('.abstract')
        const itemYear = yearEl?.textContent?.match(/\d{4}/)?.[0]
        if (!itemYear || Math.abs(parseInt(itemYear) - parseInt(year)) > 1) continue

        const link = item.querySelector('a[href*="movie.douban.com/subject/"]') as HTMLAnchorElement | null
        const doubanId = link?.href?.match(/subject\/(\d+)/)?.[1]
        const poster = (item.querySelector('img') as HTMLImageElement | null)?.src
        const ratingEl = item.querySelector('.rating_nums')
        const desc = item.querySelector('.abstract')?.textContent?.trim()

        if (doubanId) {
          return {
            douban_id: doubanId,
            poster_url: poster ?? '',
            rating: parseFloat(ratingEl?.textContent ?? '0'),
            description: desc ?? '',
          }
        }
      }
      return null
    }, year)

    return result ? { ...result, maoyan_id: movie.maoyan_id } : null
  } finally {
    await page.close()
  }
}

async function enrichMovie(movie: MovieToEnrich): Promise<EnrichedData | null> {
  // Strategy 1: get Douban ID from Maoyan detail page
  const doubanId = await enrichFromMaoyan(movie)
  if (doubanId) {
    const page = await fetchWithBrowser(`https://movie.douban.com/subject/${doubanId}/`)
    try {
      const detail = await page.evaluate(() => {
        const poster = (document.querySelector('#mainpic img') as HTMLImageElement | null)?.src
        const rating = parseFloat(document.querySelector('.rating_num')?.textContent ?? '0')
        const desc = document.querySelector('#link-report .all.hidden span')?.textContent?.trim()
          ?? document.querySelector('#link-report span')?.textContent?.trim()
          ?? ''
        return { poster_url: poster ?? '', rating, description: desc }
      })
      return { maoyan_id: movie.maoyan_id, douban_id: doubanId, ...detail }
    } finally {
      await page.close()
    }
  }

  // Strategy 2: search Douban
  return enrichFromDoubanSearch(movie)
}

async function main() {
  console.log('[douban-enricher] Starting...')
  try {
    const toEnrich = await fetchMoviesToEnrich()
    console.log(`[douban-enricher] ${toEnrich.length} movies need enrichment`)

    const enriched: EnrichedData[] = []
    for (const movie of toEnrich) {
      console.log(`[douban-enricher] Processing: ${movie.title}`)
      try {
        const data = await enrichMovie(movie)
        if (data) {
          enriched.push(data)
        } else {
          console.log(`[douban-enricher] Skipping ${movie.title} – no match found`)
        }
      } catch (err) {
        console.error(`[douban-enricher] Error enriching ${movie.title}:`, err)
        // Continue with next movie
      }
      await new Promise(r => setTimeout(r, 1500))
    }

    if (enriched.length > 0) {
      await apiClient.syncEnrich(enriched)
    }
    console.log(`[douban-enricher] Enriched ${enriched.length} movies`)
  } finally {
    await closeBrowser()
  }
}

main().catch(err => {
  console.error('[douban-enricher] FAILED:', err)
  process.exit(1)
})
