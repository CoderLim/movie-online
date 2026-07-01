import { fetchMaoyanDetail, formatMaoyanPosterUrl } from './lib/maoyan-api'
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

async function enrichFromMaoyanApi(movie: MovieToEnrich): Promise<EnrichedData | null> {
  const detail = await fetchMaoyanDetail(movie.maoyan_id)
  if (!detail?.img) return null

  const rating = parseFloat(String(detail.sc ?? 0)) || 0

  return {
    maoyan_id: movie.maoyan_id,
    douban_id: '',
    poster_url: formatMaoyanPosterUrl(detail.img),
    rating,
    description: detail.dra ?? '',
  }
}

async function main() {
  console.log('[douban-enricher] Starting...')
  const toEnrich = await fetchMoviesToEnrich()
  console.log(`[douban-enricher] ${toEnrich.length} movies need enrichment`)

  const enriched: EnrichedData[] = []
  for (const movie of toEnrich) {
    console.log(`[douban-enricher] Processing: ${movie.title}`)
    try {
      const data = await enrichFromMaoyanApi(movie)
      if (data) {
        enriched.push(data)
      } else {
        console.log(`[douban-enricher] Skipping ${movie.title} – no poster found`)
      }
    } catch (err) {
      console.error(`[douban-enricher] Error enriching ${movie.title}:`, err)
    }
    await new Promise(r => setTimeout(r, 200))
  }

  if (enriched.length > 0) {
    await apiClient.syncEnrich(enriched)
  }
  console.log(`[douban-enricher] Enriched ${enriched.length} movies`)
}

main().catch(err => {
  console.error('[douban-enricher] FAILED:', err)
  process.exit(1)
})
