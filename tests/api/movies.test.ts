import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: { DB: {} } })),
}))

import { moviesListHandler } from '@/app/api/movies/handler'
import { movieDetailHandler } from '@/app/api/movies/[id]/handler'
import { movieSearchHandler } from '@/app/api/movies/search/handler'

describe('GET /api/movies', () => {
  it('returns grouped movie list', async () => {
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any)

    const req = new Request('http://localhost/api/movies')
    const res = await moviesListHandler(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('inTheater')
    expect(data).toHaveProperty('waitingOnline')
    expect(data).toHaveProperty('available')
  })
})

describe('GET /api/movies/search', () => {
  it('returns 400 when q param is missing', async () => {
    const req = new Request('http://localhost/api/movies/search')
    const res = await movieSearchHandler(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 when q param is provided', async () => {
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any)

    const req = new Request('http://localhost/api/movies/search?q=哪吒')
    const res = await movieSearchHandler(req)
    expect(res.status).toBe(200)
  })
})
