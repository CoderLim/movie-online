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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

export const apiClient = {
  syncMovies: async (movies: unknown[], options?: { markLeftTheater?: boolean }) => {
    await post('/api/sync/movies', {
      movies,
      mark_left_theater: options?.markLeftTheater ?? true,
    })
  },

  syncMoviesBatched: async (
    movies: unknown[],
    batchSize = 25,
    options?: { markLeftTheater?: boolean },
  ) => {
    const markLeftTheater = options?.markLeftTheater ?? false
    const batches = chunk(movies, batchSize)
    for (let i = 0; i < batches.length; i++) {
      const isLast = i === batches.length - 1
      await post('/api/sync/movies', {
        movies: batches[i],
        mark_left_theater: markLeftTheater && isLast,
      })
    }
  },

  syncEnrich: (movies: unknown[]) => post('/api/sync/enrich', { movies }),
  syncPlatforms: (updates: unknown[]) => post('/api/sync/platforms', { updates }),
}
