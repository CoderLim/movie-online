import { getDb } from '@/db/client'
import { moviePlatforms } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'
import { sql } from 'drizzle-orm'

export interface PlatformUpdate {
  movie_id: number
  platform: string
  status: 'not_available' | 'available'
  play_url?: string
}

export async function syncPlatformsHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { updates: PlatformUpdate[] }
  try {
    body = await request.json() as { updates: PlatformUpdate[] }
  } catch {
    return Response.json({ error: 'Bad Request: invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body?.updates)) {
    return Response.json({ error: 'Bad Request: updates must be an array' }, { status: 400 })
  }

  const db = getDb()
  const now = new Date().toISOString()

  for (const u of body.updates) {
    const newAvailableAt = u.status === 'available' ? now : null
    await db
      .insert(moviePlatforms)
      .values({
        movieId: u.movie_id,
        platform: u.platform,
        status: u.status,
        playUrl: u.play_url ?? null,
        availableAt: newAvailableAt,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: [moviePlatforms.movieId, moviePlatforms.platform],
        set: {
          status: u.status,
          playUrl: u.play_url ?? null,
          // Preserve original availableAt if row was already available
          availableAt: sql`CASE WHEN ${moviePlatforms.status} = 'available' THEN ${moviePlatforms.availableAt} ELSE ${newAvailableAt} END`,
          lastCheckedAt: now,
        },
      })
  }

  return Response.json({ ok: true, count: body.updates.length })
}
