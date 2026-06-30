import { getDb } from '@/db/client'
import { watchlist, movies, moviePlatforms } from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { getUserToken } from '@/lib/cookie'
import Link from 'next/link'

export const runtime = 'edge'

const PLATFORM_LABELS: Record<string, string> = {
  tencent: '腾讯', iqiyi: '爱奇艺', youku: '优酷',
  mango: '芒果', bilibili: 'B站', xigua: '西瓜',
}

export default async function WatchlistPage() {
  const userToken = await getUserToken()
  const db = getDb()

  const wlRows = await db
    .select()
    .from(watchlist)
    .leftJoin(movies, eq(watchlist.movieId, movies.id))
    .where(eq(watchlist.userToken, userToken))

  const movieIds = wlRows.map(r => r.movies?.id).filter((id): id is number => id !== undefined)
  const allPlatforms = movieIds.length > 0
    ? await db.select().from(moviePlatforms).where(inArray(moviePlatforms.movieId, movieIds))
    : []

  const items = wlRows
    .filter(r => r.movies)
    .map(r => ({
      ...r.movies!,
      platforms: allPlatforms.filter(p => p.movieId === r.movies!.id),
    }))

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>我的追踪列表</h1>
      <p style={{ color: '#999', fontSize: 13, marginBottom: 24 }}>
        追踪列表保存在本设备，清除 Cookie 或换设备后将重置。
      </p>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: '48px 0' }}>
          还没有追踪的电影，<Link href="/">去首页添加</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map(movie => (
          <div key={movie.id} style={{
            display: 'flex', gap: 16, alignItems: 'center',
            background: 'white', borderRadius: 8, padding: '12px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            {movie.posterUrl
              ? <img src={movie.posterUrl} alt={movie.title} style={{ width: 48, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              : <div style={{ width: 48, height: 72, background: '#eee', borderRadius: 4, flexShrink: 0 }} />
            }
            <div style={{ flex: 1 }}>
              <Link href={`/movie/${movie.id}`} style={{ fontWeight: 600, color: '#333', textDecoration: 'none' }}>
                {movie.title}
              </Link>
              {movie.rating && <div style={{ color: '#f60', fontSize: 12 }}>★ {movie.rating}</div>}
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {movie.platforms.map(p => (
                  <span key={p.platform} style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 3,
                    background: p.status === 'available' ? '#e6f7e6' : '#f5f5f5',
                    color: p.status === 'available' ? '#389e0d' : '#999',
                  }}>
                    {PLATFORM_LABELS[p.platform] ?? p.platform}
                    {p.status === 'available' ? ' ✓' : ''}
                  </span>
                ))}
              </div>
            </div>
            <form action={`/api/watchlist/${movie.id}`} method="POST">
              <input type="hidden" name="_method" value="DELETE" />
              <button type="submit" style={{
                background: 'none', border: '1px solid #ddd', borderRadius: 4,
                padding: '4px 10px', cursor: 'pointer', color: '#999', fontSize: 12,
              }}>
                移除
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
