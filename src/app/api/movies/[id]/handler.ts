import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function movieDetailHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = getDb()

  const [movie] = await db.select().from(movies).where(eq(movies.id, numId))
  if (!movie) return Response.json({ error: 'Not found' }, { status: 404 })

  const platforms = await db.select().from(moviePlatforms).where(eq(moviePlatforms.movieId, movie.id))

  return Response.json({ ...movie, platforms })
}
