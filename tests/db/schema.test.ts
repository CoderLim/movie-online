import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { movies, moviePlatforms, watchlist } from '@/db/schema'
import { eq } from 'drizzle-orm'

function createTestDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  // Create tables manually matching schema
  sqlite.exec(`
    CREATE TABLE movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      maoyan_id TEXT UNIQUE NOT NULL,
      douban_id TEXT,
      poster_url TEXT,
      rating REAL,
      description TEXT,
      release_date TEXT,
      theater_end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE movie_platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_available',
      play_url TEXT,
      available_at TEXT,
      last_checked_at TEXT,
      UNIQUE(movie_id, platform)
    );
    CREATE TABLE watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      user_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_token, movie_id)
    );
  `)
  return db
}

describe('movies schema', () => {
  it('inserts and retrieves a movie by maoyan_id', async () => {
    const db = createTestDb()
    const now = new Date().toISOString()
    await db.insert(movies).values({
      title: '测试电影',
      maoyanId: 'maoyan_123',
      createdAt: now,
      updatedAt: now,
    })
    const result = await db.select().from(movies).where(eq(movies.maoyanId, 'maoyan_123'))
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('测试电影')
  })

  it('upserts movie_platforms without duplicates', async () => {
    const db = createTestDb()
    const now = new Date().toISOString()
    await db.insert(movies).values({ title: 'A', maoyanId: 'mx1', createdAt: now, updatedAt: now })
    const [movie] = await db.select().from(movies)

    // Insert twice
    await db.insert(moviePlatforms).values({ movieId: movie.id, platform: 'tencent', lastCheckedAt: now }).onConflictDoUpdate({
      target: [moviePlatforms.movieId, moviePlatforms.platform],
      set: { lastCheckedAt: now },
    })
    await db.insert(moviePlatforms).values({ movieId: movie.id, platform: 'tencent', lastCheckedAt: now }).onConflictDoUpdate({
      target: [moviePlatforms.movieId, moviePlatforms.platform],
      set: { lastCheckedAt: now },
    })

    const rows = await db.select().from(moviePlatforms).where(eq(moviePlatforms.movieId, movie.id))
    expect(rows).toHaveLength(1)
  })
})
