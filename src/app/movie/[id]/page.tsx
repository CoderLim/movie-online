import { getDb } from '@/db/client'
import { movies, moviePlatforms, watchlist } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUserToken } from '@/lib/cookie'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const runtime = 'edge'

const PLATFORM_LABELS: Record<string, string> = {
  tencent: '腾讯视频', iqiyi: '爱奇艺', youku: '优酷',
  mango: '芒果TV', bilibili: '哔哩哔哩', xigua: '西瓜视频',
}

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = getDb()

  const [movie] = await db.select().from(movies).where(eq(movies.id, parseInt(id)))
  if (!movie) notFound()

  const platforms = await db.select().from(moviePlatforms).where(eq(moviePlatforms.movieId, movie.id))
  const userToken = await getUserToken()
  const [inWatchlist] = await db.select().from(watchlist).where(
    and(eq(watchlist.userToken, userToken), eq(watchlist.movieId, movie.id))
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Link href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← 返回</Link>

      <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
        {movie.posterUrl
          ? <img src={movie.posterUrl} alt={movie.title} style={{ width: 160, height: 240, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          : <div style={{ width: 160, height: 240, background: '#eee', borderRadius: 8, flexShrink: 0 }} />
        }
        <div>
          <h1 style={{ margin: '0 0 8px' }}>{movie.title}</h1>
          {movie.rating && <div style={{ color: '#f60', marginBottom: 8 }}>★ {movie.rating} (豆瓣)</div>}
          {movie.releaseDate && <div style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>上映：{movie.releaseDate}</div>}
          {movie.theaterEndDate && (
            <div style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
              下映：{movie.theaterEndDate} <span style={{ color: '#999', fontSize: 12 }}>(估算)</span>
            </div>
          )}
          {movie.description && <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>{movie.description}</p>}

          <form action={inWatchlist ? `/api/watchlist/${movie.id}` : '/api/watchlist'} method="POST">
            {!inWatchlist && <input type="hidden" name="movie_id" value={movie.id} />}
            <button type="submit" style={{
              padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: inWatchlist ? '#fff1f0' : '#1a1a2e', color: inWatchlist ? '#cf1322' : 'white',
            }}>
              {inWatchlist ? '取消追踪' : '+ 加入追踪'}
            </button>
          </form>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>平台上线状态</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {['tencent', 'iqiyi', 'youku', 'mango', 'bilibili', 'xigua'].map(platformKey => {
          const p = platforms.find(x => x.platform === platformKey)
          const isAvailable = p?.status === 'available'
          return (
            <div key={platformKey} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: 'white', borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <span style={{ fontWeight: 600, width: 80 }}>{PLATFORM_LABELS[platformKey]}</span>
              <span style={{ color: isAvailable ? '#389e0d' : '#999' }}>
                {isAvailable ? '✅ 已上线' : '⏳ 未上线'}
              </span>
              {isAvailable && p?.playUrl && (
                <a href={p.playUrl} target="_blank" rel="noopener noreferrer"
                  style={{ marginLeft: 'auto', color: '#1677ff', textDecoration: 'none', fontSize: 14 }}>
                  去看 →
                </a>
              )}
              {!isAvailable && p?.lastCheckedAt && (
                <span style={{ marginLeft: 'auto', color: '#bbb', fontSize: 12 }}>
                  最后检查：{p.lastCheckedAt.slice(0, 10)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
