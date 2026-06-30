import { getDb } from '@/db/client'
import { moviePlatforms } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'

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

  const body = await request.json() as { updates: PlatformUpdate[] }
  const db = getDb()
  const now = new Date().toISOString()

  for (const u of body.updates) {
    await db
      .insert(moviePlatforms)
      .values({
        movieId: u.movie_id,
        platform: u.platform,
        status: u.status,
        playUrl: u.play_url ?? null,
        availableAt: u.status === 'available' ? now : null,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: [moviePlatforms.movieId, moviePlatforms.platform],
        set: {
          status: u.status,
          playUrl: u.play_url ?? null,
          availableAt: u.status === 'available' ? now : null,
          lastCheckedAt: now,
        },
      })
  }

  return Response.json({ ok: true, count: body.updates.length })
}
