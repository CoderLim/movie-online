import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'

interface MaoyanEntry {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: null  // all movies in the hot list are still in theaters
}

async function scrapeMaoyanList(): Promise<MaoyanEntry[]> {
  // Maoyan real-time box office: https://piaofang.maoyan.com/rankings/movie
  const page = await fetchWithBrowser('https://piaofang.maoyan.com/rankings/movie')

  await page.waitForSelector('[class*="MovieName"]', { timeout: 15000 })

  const entries = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="MovieItem"]'))
    return rows.map(row => {
      const link = row.querySelector('a[href*="/movie/"]') as HTMLAnchorElement | null
      const titleEl = row.querySelector('[class*="MovieName"]')
      const dateEl = row.querySelector('[class*="releaseInfo"]')

      const href = link?.href ?? ''
      const maoyanId = href.match(/\/movie\/(\d+)/)?.[1] ?? ''
      const title = titleEl?.textContent?.trim() ?? ''
      // Date format from Maoyan: "2024年01月01日上映" → "2024-01-01"
      const rawDate = dateEl?.textContent ?? ''
      const releaseDate = rawDate.replace(/(\d{4})年(\d{2})月(\d{2})日.*/, '$1-$2-$3')

      return { maoyan_id: maoyanId, title, release_date: releaseDate, theater_end_date: null as null }
    }).filter(e => e.maoyan_id && e.title)
  })

  await page.close()
  return entries
}

async function main() {
  console.log('[maoyan-scraper] Starting...')
  const movies = await scrapeMaoyanList()
  console.log(`[maoyan-scraper] Found ${movies.length} movies in theaters`)

  await apiClient.syncMovies(movies)
  console.log('[maoyan-scraper] Synced to DB')

  await closeBrowser()
}

main().catch(err => {
  console.error('[maoyan-scraper] FAILED:', err)
  process.exit(1)
})
