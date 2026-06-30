import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { eq, isNull, isNotNull } from 'drizzle-orm'
import { validateBearerToken } from '@/lib/auth'

export async function moviesListHandler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)

  // Internal: return movies needing Douban enrichment
  if (searchParams.get('no_douban') === '1') {
    if (!validateBearerToken(req)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = getDb()
    const rows = await db.select().from(movies).where(isNull(movies.doubanId)).limit(50)
    return Response.json({ movies: rows.map(m => ({
      id: m.id, maoyan_id: m.maoyanId, title: m.title, release_date: m.releaseDate
    }))})
  }

  // Internal: return movies needing platform check
  if (searchParams.get('needs_check') === '1') {
    if (!validateBearerToken(req)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = getDb()
    const rows = await db
      .select()
      .from(movies)
      .leftJoin(moviePlatforms, eq(movies.id, moviePlatforms.movieId))
      .where(isNotNull(movies.theaterEndDate))

    const movieMap = new Map<number, any>()
    for (const row of rows) {
      if (!movieMap.has(row.movies.id)) {
        movieMap.set(row.movies.id, {
          id: row.movies.id,
          title: row.movies.title,
          release_date: row.movies.releaseDate,
          theater_end_date: row.movies.theaterEndDate,
          platforms: [],
        })
      }
      if (row.movie_platforms) {
        movieMap.get(row.movies.id).platforms.push({
          platform: row.movie_platforms.platform,
          status: row.movie_platforms.status,
          last_checked_at: row.movie_platforms.lastCheckedAt,
        })
      }
    }
    return Response.json({ movies: Array.from(movieMap.values()) })
  }

  // Public: return movies grouped by status
  const db = getDb()
  const rows = await db
    .select()
    .from(movies)
    .leftJoin(moviePlatforms, eq(movies.id, moviePlatforms.movieId))

  const movieMap = new Map<number, {
    movie: typeof movies.$inferSelect
    platforms: typeof moviePlatforms.$inferSelect[]
  }>()

  for (const row of rows) {
    if (!movieMap.has(row.movies.id)) {
      movieMap.set(row.movies.id, { movie: row.movies, platforms: [] })
    }
    if (row.movie_platforms) {
      movieMap.get(row.movies.id)!.platforms.push(row.movie_platforms)
    }
  }

  const all = Array.from(movieMap.values())

  const inTheater = all
    .filter(r => r.movie.theaterEndDate === null)
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  const leftTheater = all.filter(r => r.movie.theaterEndDate !== null)

  const waitingOnline = leftTheater
    .filter(r => r.platforms.every(p => p.status === 'not_available'))
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  const available = leftTheater
    .filter(r => r.platforms.some(p => p.status === 'available'))
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  return Response.json({ inTheater, waitingOnline, available })
}
