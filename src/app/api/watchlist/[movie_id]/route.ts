import { getDb } from '@/db/client'
import { watchlist } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { getUserToken } from '@/lib/cookie'

export const runtime = 'edge'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ movie_id: string }> }
): Promise<Response> {
  const { movie_id } = await params
  const numId = parseInt(movie_id, 10)
  if (isNaN(numId)) {
    return Response.json({ error: 'Invalid movie_id' }, { status: 400 })
  }

  const userToken = await getUserToken()
  const db = getDb()

  await db
    .delete(watchlist)
    .where(and(
      eq(watchlist.userToken, userToken),
      eq(watchlist.movieId, numId)
    ))

  return Response.json({ ok: true })
}
