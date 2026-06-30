const BASE_URL = process.env.APP_URL!   // e.g. https://movie-online.pages.dev
const SECRET  = process.env.SYNC_SECRET!

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} failed: ${res.status} ${text}`)
  }
}

export const apiClient = {
  syncMovies: (movies: unknown[]) => post('/api/sync/movies', { movies }),
  syncEnrich: (movies: unknown[]) => post('/api/sync/enrich', { movies }),
  syncPlatforms: (updates: unknown[]) => post('/api/sync/platforms', { updates }),
}
