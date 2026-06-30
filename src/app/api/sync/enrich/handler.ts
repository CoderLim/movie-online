import { getDb } from '@/db/client'
import { movies } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export interface EnrichPayload {
  maoyan_id: string
  douban_id: string
  poster_url: string
  rating: number
  description: string
}

export async function syncEnrichHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { movies: EnrichPayload[] }
  try {
    body = await request.json() as { movies: EnrichPayload[] }
  } catch {
    return Response.json({ error: 'Bad Request: invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body?.movies)) {
    return Response.json({ error: 'Bad Request: movies must be an array' }, { status: 400 })
  }

  const db = getDb()
  const now = new Date().toISOString()

  for (const m of body.movies) {
    await db
      .update(movies)
      .set({
        doubanId: m.douban_id,
        posterUrl: m.poster_url,
        rating: m.rating,
        description: m.description,
        updatedAt: now,
      })
      .where(eq(movies.maoyanId, m.maoyan_id))
  }

  return Response.json({ ok: true, count: body.movies.length })
}
