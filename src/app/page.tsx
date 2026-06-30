import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'

export const runtime = 'edge'

const PLATFORM_LABELS: Record<string, string> = {
  tencent: '腾讯', iqiyi: '爱奇艺', youku: '优酷',
  mango: '芒果', bilibili: 'B站', xigua: '西瓜',
}

async function getGroupedMovies(search?: string) {
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
    if (search && !row.movies.title.includes(search)) continue
    if (!movieMap.has(row.movies.id)) {
      movieMap.set(row.movies.id, { movie: row.movies, platforms: [] })
    }
    if (row.movie_platforms) {
      movieMap.get(row.movies.id)!.platforms.push(row.movie_platforms)
    }
  }

  const all = Array.from(movieMap.values())
  return {
    inTheater: all.filter(r => !r.movie.theaterEndDate),
    waitingOnline: all.filter(r => r.movie.theaterEndDate && r.platforms.every(p => p.status !== 'available')),
    available: all.filter(r => r.movie.theaterEndDate && r.platforms.some(p => p.status === 'available')),
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const { inTheater, waitingOnline, available } = await getGroupedMovies(q)

  return (
    <div>
      <form style={{ marginBottom: 24 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索电影..."
          style={{ padding: '8px 12px', width: 280, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
        />
        <button type="submit" style={{ marginLeft: 8, padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          搜索
        </button>
      </form>

      <Section title="🎬 正在院线" movies={inTheater} />
      <Section title="⏳ 等待上线" movies={waitingOnline} />
      <Section title="✅ 已上线" movies={available} />
    </div>
  )
}

function Section({ title, movies: items }: { title: string; movies: { movie: any; platforms: any[] }[] }) {
  if (items.length === 0) return null
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ marginBottom: 16, color: '#333' }}>{title} ({items.length})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {items.map(({ movie, platforms }) => (
          <Link key={movie.id} href={`/movie/${movie.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
              {movie.posterUrl
                ? <img src={movie.posterUrl} alt={movie.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover' }} />
                : <div style={{ width: '100%', aspectRatio: '2/3', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>暂无海报</div>
              }
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{movie.title}</div>
                {movie.rating && <div style={{ color: '#f60', fontSize: 12 }}>★ {movie.rating}</div>}
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {platforms.map(p => (
                    <span key={p.platform} style={{
                      fontSize: 11, padding: '1px 5px', borderRadius: 3,
                      background: p.status === 'available' ? '#e6f7e6' : '#f5f5f5',
                      color: p.status === 'available' ? '#389e0d' : '#999',
                    }}>
                      {PLATFORM_LABELS[p.platform] ?? p.platform}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
