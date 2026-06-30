import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: { DB: {} } })),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    get: vi.fn(() => ({ value: 'test-token' })),
    set: vi.fn(),
  })),
}))

import { watchlistGetHandler, watchlistPostHandler } from '@/app/api/watchlist/handler'

describe('GET /api/watchlist', () => {
  it('returns watchlist for user_token', async () => {
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any)

    const req = new Request('http://localhost/api/watchlist')
    const res = await watchlistGetHandler(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('items')
  })
})

describe('POST /api/watchlist', () => {
  it('returns 429 when count exceeds 200', async () => {
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(new Array(200).fill({})),
        }),
      }),
    } as any)

    const req = new Request('http://localhost/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movie_id: 1 }),
    })
    const res = await watchlistPostHandler(req)
    expect(res.status).toBe(429)
  })
})
