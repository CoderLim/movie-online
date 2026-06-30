import { getDb } from '@/db/client'
import { movies } from '@/db/schema'
import { like } from 'drizzle-orm'

export async function movieSearchHandler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  if (!q || q.trim().length === 0) {
    return Response.json({ error: 'Missing q parameter' }, { status: 400 })
  }

  const db = getDb()
  const results = await db
    .select()
    .from(movies)
    .where(like(movies.title, `%${q}%`))
    .limit(20)

  return Response.json({ results })
}
