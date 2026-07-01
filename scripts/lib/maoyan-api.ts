export interface MaoyanDetail {
  id: number
  img?: string
  sc?: number | string
  dra?: string
  pubDate?: number
}

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

async function fetchFromMobileApi(movieId: string): Promise<MaoyanDetail | null> {
  const res = await fetch(`https://m.maoyan.com/ajax/detailmovie?movieId=${movieId}`, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept': 'application/json',
    },
    redirect: 'follow',
  })

  if (!res.ok) return null

  const data = await res.json() as { detailMovie?: MaoyanDetail }
  return data.detailMovie ?? null
}

async function fetchFromNetstartApi(movieId: string): Promise<MaoyanDetail | null> {
  const res = await fetch(`https://apis.netstart.cn/maoyan/movie/detail?movieId=${movieId}`, {
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) return null

  const data = await res.json() as { movie?: { id: number; img?: string; sc?: number | string; dra?: string } }
  const movie = data.movie
  if (!movie) return null

  return {
    id: movie.id,
    img: movie.img,
    sc: movie.sc,
    dra: movie.dra,
  }
}

export async function fetchMaoyanDetail(movieId: string): Promise<MaoyanDetail | null> {
  try {
    const detail = await fetchFromMobileApi(movieId)
    if (detail?.img) return detail
  } catch {
    // fall through to backup API
  }

  try {
    return await fetchFromNetstartApi(movieId)
  } catch {
    return null
  }
}

export function formatMaoyanPosterUrl(url: string): string {
  return url.replace(/\/w\.h\//, '/248.350/')
}

export interface MaoyanSearchHit {
  id: number
  name: string
  release?: string
}

export async function searchMaoyanMovies(title: string): Promise<MaoyanSearchHit[]> {
  const res = await fetch(
    `https://apis.netstart.cn/maoyan/search/movies?keyword=${encodeURIComponent(title)}`,
    { headers: { Accept: 'application/json' } },
  )

  if (!res.ok) return []

  const data = await res.json()
  return Array.isArray(data) ? data as MaoyanSearchHit[] : []
}

function releaseDateFromHit(hit: MaoyanSearchHit): string | null {
  if (!hit.release) return null
  return hit.release.slice(0, 10)
}

export async function resolveMaoyanMovie(
  title: string,
  releaseDate: string,
): Promise<{ maoyan_id: string; title: string; release_date: string } | null> {
  const hits = await searchMaoyanMovies(title)
  if (hits.length === 0) return null

  const targetYear = parseInt(releaseDate.slice(0, 4), 10)
  const targetMonth = parseInt(releaseDate.slice(5, 7), 10)

  let best: MaoyanSearchHit | null = null
  let bestScore = -1

  for (const hit of hits) {
    const hitDate = releaseDateFromHit(hit)
    if (!hitDate) continue

    const hitYear = parseInt(hitDate.slice(0, 4), 10)
    const hitMonth = parseInt(hitDate.slice(5, 7), 10)
    if (Math.abs(hitYear - targetYear) > 1) continue

    let score = 0
    if (hit.name === title || hit.name.includes(title) || title.includes(hit.name)) score += 3
    if (hitDate === releaseDate) score += 5
    else if (hitYear === targetYear && hitMonth === targetMonth) score += 2
    else if (hitYear === targetYear) score += 1

    if (score > bestScore) {
      bestScore = score
      best = hit
    }
  }

  if (!best || bestScore < 2) return null

  return {
    maoyan_id: String(best.id),
    title: best.name,
    release_date: releaseDateFromHit(best) ?? releaseDate,
  }
}
