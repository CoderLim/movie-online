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
