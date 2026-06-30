import { getDb } from '@/db/client'
import { movies } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'
import { and, isNull, notInArray } from 'drizzle-orm'

export interface MaoyanMovie {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: string | null  // null = still in theater
}

export async function syncMoviesHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { movies: MaoyanMovie[] }
  try {
    body = await request.json() as { movies: MaoyanMovie[] }
  } catch {
    return Response.json({ error: 'Bad Request: invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body?.movies)) {
    return Response.json({ error: 'Bad Request: movies must be an array' }, { status: 400 })
  }

  const db = getDb()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // Upsert incoming movies
  for (const m of body.movies) {
    await db
      .insert(movies)
      .values({
        title: m.title,
        maoyanId: m.maoyan_id,
        releaseDate: m.release_date,
        theaterEndDate: m.theater_end_date,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: movies.maoyanId,
        set: {
          title: m.title,
          theaterEndDate: m.theater_end_date,
          updatedAt: now,
        },
      })
  }

  // Mark movies that have left theaters (not in incoming list)
  if (body.movies.length > 0) {
    const incomingIds = body.movies.map(m => m.maoyan_id)
    await db
      .update(movies)
      .set({ theaterEndDate: today, updatedAt: now })
      .where(and(isNull(movies.theaterEndDate), notInArray(movies.maoyanId, incomingIds)))
  }

  return Response.json({ ok: true, count: body.movies.length })
}
