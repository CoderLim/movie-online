import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  getDb: vi.fn(),
}))
vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: { DB: {} } })),
}))

import { syncMoviesHandler } from '@/app/api/sync/movies/handler'
import { syncEnrichHandler } from '@/app/api/sync/enrich/handler'
import { syncPlatformsHandler } from '@/app/api/sync/platforms/handler'

describe('POST /api/sync/movies', () => {
  it('returns 401 without valid Bearer token', async () => {
    const req = new Request('http://localhost/api/sync/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movies: [] }),
    })
    process.env.SYNC_SECRET = 'test-secret'
    const res = await syncMoviesHandler(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid token and empty array', async () => {
    const req = new Request('http://localhost/api/sync/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret',
      },
      body: JSON.stringify({ movies: [] }),
    })
    process.env.SYNC_SECRET = 'test-secret'

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue(mockDb as any)

    const res = await syncMoviesHandler(req)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sync/enrich', () => {
  it('returns 401 without valid token', async () => {
    const req = new Request('http://localhost/api/sync/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movies: [] }),
    })
    process.env.SYNC_SECRET = 'test-secret'
    const res = await syncEnrichHandler(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/sync/platforms', () => {
  it('returns 401 without valid token', async () => {
    const req = new Request('http://localhost/api/sync/platforms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [] }),
    })
    process.env.SYNC_SECRET = 'test-secret'
    const res = await syncPlatformsHandler(req)
    expect(res.status).toBe(401)
  })
})
