import { getDb } from '@/db/client'
import { watchlist, movies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getUserToken } from '@/lib/cookie'

const WATCHLIST_LIMIT = 200

export async function watchlistGetHandler(_req: Request): Promise<Response> {
  const userToken = await getUserToken()
  const db = getDb()

  const rows = await db
    .select()
    .from(watchlist)
    .leftJoin(movies, eq(watchlist.movieId, movies.id))
    .where(eq(watchlist.userToken, userToken))

  const items = rows
    .filter(r => r.movies !== null)
    .map(r => r.movies!)

  return Response.json({ items })
}

export async function watchlistPostHandler(req: Request): Promise<Response> {
  const userToken = await getUserToken()
  const db = getDb()

  let body: { movie_id: number }
  try {
    body = await req.json() as { movie_id: number }
  } catch {
    return Response.json({ error: 'Bad Request: invalid JSON' }, { status: 400 })
  }
  if (!Number.isInteger(body?.movie_id)) {
    return Response.json({ error: 'Bad Request: movie_id must be an integer' }, { status: 400 })
  }

  // Check limit
  const existing = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userToken, userToken))
  if (existing.length >= WATCHLIST_LIMIT) {
    return Response.json({ error: 'Watchlist limit reached (200)' }, { status: 429 })
  }

  await db
    .insert(watchlist)
    .values({ movieId: body.movie_id, userToken, createdAt: new Date().toISOString() })
    .onConflictDoNothing()

  return Response.json({ ok: true })
}
