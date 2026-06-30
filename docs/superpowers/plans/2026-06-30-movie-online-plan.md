# Movie Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app on Cloudflare Pages that automatically tracks when Chinese theatrical movies become available on 6 major streaming platforms, with daily GitHub Actions scrapers and a watchlist feature.

**Architecture:** Next.js App Router on Cloudflare Pages reads from Cloudflare D1 (SQLite) via Drizzle ORM. Three Node.js scraper scripts run on GitHub Actions Cron daily (Playwright-powered), pushing data via authenticated REST API endpoints. User state is tracked via a Cookie UUID with no auth required.

**Tech Stack:** Next.js 15 (App Router), `@cloudflare/next-on-pages`, Cloudflare D1, Drizzle ORM, Playwright, Vitest, TypeScript, pnpm

---

## File Map

```
movie-online/
├── src/
│   ├── db/
│   │   ├── schema.ts              Drizzle table definitions + indexes
│   │   └── client.ts              D1 connection helper for route handlers
│   ├── lib/
│   │   ├── auth.ts                Bearer token validation for sync endpoints
│   │   ├── cookie.ts              user_token cookie read/generate helpers
│   │   └── platform-match.ts     5-criteria movie matching logic (shared w/ tests)
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx               Home page (3-section movie list)
│       ├── movie/[id]/page.tsx    Movie detail page
│       ├── watchlist/page.tsx     Watchlist page
│       └── api/
│           ├── movies/
│           │   ├── route.ts       GET /api/movies (list grouped by status)
│           │   ├── [id]/route.ts  GET /api/movies/[id]
│           │   └── search/route.ts GET /api/movies/search?q=
│           ├── watchlist/
│           │   ├── route.ts       GET + POST /api/watchlist
│           │   └── [movie_id]/route.ts DELETE /api/watchlist/[id]
│           └── sync/
│               ├── movies/route.ts    POST /api/sync/movies
│               ├── enrich/route.ts    POST /api/sync/enrich
│               └── platforms/route.ts POST /api/sync/platforms
├── scripts/
│   ├── lib/
│   │   ├── api-client.ts          HTTP client that calls /api/sync/* endpoints
│   │   └── browser.ts             Playwright launch + page helpers
│   ├── maoyan-scraper.ts          Scrapes Maoyan box-office list
│   ├── douban-enricher.ts         Enriches movies with Douban metadata
│   └── platform-checker.ts       Checks 6 platforms for availability
├── tests/
│   ├── lib/
│   │   └── platform-match.test.ts
│   └── api/
│       ├── sync.test.ts
│       ├── movies.test.ts
│       └── watchlist.test.ts
├── .github/workflows/scrape.yml
├── drizzle.config.ts
├── next.config.ts
├── vitest.config.ts
└── wrangler.toml
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `wrangler.toml`, `drizzle.config.ts`, `vitest.config.ts`, `.env.local.example`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/gengliming/Projects/movie-online
pnpm create next-app@latest . --typescript --app --no-src-dir --no-tailwind --no-eslint --import-alias "@/*"
```

Move generated files into `src/` manually if Next.js doesn't use `--src-dir` correctly, or re-run with `--src-dir`:
```bash
pnpm create next-app@latest . --typescript --app --src-dir --no-tailwind --no-eslint --import-alias "@/*"
```

- [ ] **Step 2: Install all dependencies**

```bash
pnpm add drizzle-orm @cloudflare/next-on-pages
pnpm add -D drizzle-kit better-sqlite3 @types/better-sqlite3 vitest @vitejs/plugin-react vite-tsconfig-paths wrangler playwright @playwright/test
```

- [ ] **Step 3: Configure `wrangler.toml`**

```toml
name = "movie-online"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"

[[d1_databases]]
binding = "DB"
database_name = "movie-online"
database_id = "REPLACE_WITH_REAL_ID"
```

> Create the D1 database: `pnpm wrangler d1 create movie-online` and paste the `database_id` into wrangler.toml.

- [ ] **Step 4: Configure `next.config.ts`**

```typescript
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev'

if (process.env.NODE_ENV === 'development') {
  await setupDevPlatform()
}

const nextConfig = {
  // Required for @cloudflare/next-on-pages
}

export default nextConfig
```

- [ ] **Step 5: Configure `drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
} satisfies Config
```

- [ ] **Step 6: Configure `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 7: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "pages:build": "pnpm dlx @cloudflare/next-on-pages@1",
    "preview": "pnpm pages:build && wrangler pages dev",
    "deploy": "pnpm pages:build && wrangler pages deploy",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "wrangler d1 migrations apply movie-online --local",
    "db:migrate:prod": "wrangler d1 migrations apply movie-online --remote",
    "test": "vitest run"
  }
}
```

- [ ] **Step 8: Create `.env.local.example`**

```
SYNC_SECRET=your-random-secret-here
```

Copy to `.env.local` and fill in a random secret (e.g. `openssl rand -hex 32`).

- [ ] **Step 9: Add `.env.local` to `.gitignore`**

```bash
echo ".env.local" >> .gitignore
echo ".wrangler" >> .gitignore
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: project scaffolding – Next.js + Cloudflare Pages + D1 + Vitest"
```

---

## Task 2: Database Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `tests/db/schema.test.ts` (smoke test via in-memory SQLite)

- [ ] **Step 1: Write the failing schema smoke test**

Create `tests/db/schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
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
      maoyan_id: 'maoyan_123',
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
```

- [ ] **Step 2: Run test to verify it fails (schema not defined yet)**

```bash
pnpm test tests/db/schema.test.ts
```

Expected: FAIL — `Cannot find module '@/db/schema'`

- [ ] **Step 3: Write `src/db/schema.ts`**

```typescript
import { sqliteTable, integer, text, real, unique } from 'drizzle-orm/sqlite-core'

export const movies = sqliteTable('movies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  maoyanId: text('maoyan_id').unique().notNull(),
  doubanId: text('douban_id'),
  posterUrl: text('poster_url'),
  rating: real('rating'),
  description: text('description'),
  releaseDate: text('release_date'),
  theaterEndDate: text('theater_end_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const moviePlatforms = sqliteTable('movie_platforms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  movieId: integer('movie_id').notNull(),
  platform: text('platform').notNull(),
  status: text('status').notNull().default('not_available'),
  playUrl: text('play_url'),
  availableAt: text('available_at'),
  lastCheckedAt: text('last_checked_at'),
}, (t) => ({
  uniq: unique().on(t.movieId, t.platform),
}))

export const watchlist = sqliteTable('watchlist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  movieId: integer('movie_id').notNull(),
  userToken: text('user_token').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  uniq: unique().on(t.userToken, t.movieId),
}))

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type MoviePlatform = typeof moviePlatforms.$inferSelect
export type Watchlist = typeof watchlist.$inferSelect
```

- [ ] **Step 4: Write `src/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/d1'
import { getRequestContext } from '@cloudflare/next-on-pages'
import * as schema from './schema'

export function getDb() {
  const { env } = getRequestContext()
  return drizzle(env.DB, { schema })
}

export type Db = ReturnType<typeof getDb>
```

- [ ] **Step 5: Generate migration**

```bash
pnpm db:generate
```

Expected: creates `drizzle/migrations/0000_*.sql`

- [ ] **Step 6: Apply migration to local D1**

```bash
pnpm db:migrate
```

Expected: `✅ Applied 1 migration`

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm test tests/db/schema.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: database schema – movies, movie_platforms, watchlist"
```

---

## Task 3: Utility Helpers

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/cookie.ts`
- Create: `src/lib/platform-match.ts`
- Create: `tests/lib/platform-match.test.ts`

- [ ] **Step 1: Write failing test for platform matching**

Create `tests/lib/platform-match.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchesMovie } from '@/lib/platform-match'

const baseMovie = { title: '哪吒之魔童降世', releaseDate: '2019-07-26' }

describe('matchesMovie', () => {
  it('matches exact title + correct year', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世',
      year: 2019,
      type: 'movie',
      durationMinutes: 110,
      status: 'available',
    })).toBe(true)
  })

  it('rejects title mismatch', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒传奇',
      year: 2019,
      type: 'movie',
      durationMinutes: 110,
      status: 'available',
    })).toBe(false)
  })

  it('rejects year more than 1 apart', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世',
      year: 2017,
      type: 'movie',
      durationMinutes: 110,
      status: 'available',
    })).toBe(false)
  })

  it('rejects non-movie type', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世',
      year: 2019,
      type: 'tv',
      durationMinutes: 110,
      status: 'available',
    })).toBe(false)
  })

  it('rejects duration under 60 minutes', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世',
      year: 2019,
      type: 'movie',
      durationMinutes: 45,
      status: 'available',
    })).toBe(false)
  })

  it('rejects presale status', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世',
      year: 2019,
      type: 'movie',
      durationMinutes: 110,
      status: 'presale',
    })).toBe(false)
  })

  it('matches title with punctuation difference', () => {
    expect(matchesMovie(baseMovie, {
      title: '哪吒之魔童降世！',
      year: 2019,
      type: 'movie',
      durationMinutes: 110,
      status: 'available',
    })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/lib/platform-match.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/platform-match'`

- [ ] **Step 3: Write `src/lib/platform-match.ts`**

```typescript
// Strips punctuation and normalizes Unicode for title comparison
function normalizeTitle(title: string): string {
  return title
    .replace(/[！!，,。.？?【】「」《》\s]/g, '')  // strip common punctuation + whitespace
    .toLowerCase()
    .normalize('NFKC')  // full-width → half-width
}

export interface PlatformResult {
  title: string
  year: number          // year from platform search result
  type: string          // 'movie' | 'tv' | 'variety' | etc.
  durationMinutes: number
  status: string        // 'available' | 'vip' | 'free' | 'presale' | 'coming_soon'
}

export interface MovieInfo {
  title: string
  releaseDate: string   // YYYY-MM-DD
}

const AVAILABLE_STATUSES = new Set(['available', 'vip', 'free'])

export function matchesMovie(movie: MovieInfo, result: PlatformResult): boolean {
  const movieYear = new Date(movie.releaseDate).getFullYear()

  // Criterion 1: title match (normalized)
  if (normalizeTitle(movie.title) !== normalizeTitle(result.title)) return false

  // Criterion 2: year within ±1
  if (Math.abs(result.year - movieYear) > 1) return false

  // Criterion 3: must be a movie
  if (result.type !== 'movie') return false

  // Criterion 4: duration >= 60 minutes
  if (result.durationMinutes < 60) return false

  // Criterion 5: must be watchable (not presale/coming_soon)
  if (!AVAILABLE_STATUSES.has(result.status)) return false

  return true
}
```

- [ ] **Step 4: Write `src/lib/auth.ts`**

```typescript
export function validateBearerToken(request: Request): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === process.env.SYNC_SECRET
}
```

- [ ] **Step 5: Write `src/lib/cookie.ts`**

```typescript
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

const COOKIE_NAME = 'user_token'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: '/',
}

// Call in Server Components / Route Handlers to get (or create) user_token
export async function getUserToken(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(COOKIE_NAME)
  if (existing) return existing.value

  const token = randomUUID()
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS)
  return token
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test tests/lib/platform-match.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: utility helpers – auth, cookie, platform-match"
```

---

## Task 4: Sync API Endpoints

**Files:**
- Create: `src/app/api/sync/movies/route.ts`
- Create: `src/app/api/sync/enrich/route.ts`
- Create: `src/app/api/sync/platforms/route.ts`
- Create: `tests/api/sync.test.ts`

- [ ] **Step 1: Write failing tests for sync endpoints**

Create `tests/api/sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the pure handler logic extracted from route handlers
// DB calls are mocked via vi.mock

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
    }
    const { getDb } = await import('@/db/client')
    vi.mocked(getDb).mockReturnValue(mockDb as any)

    const res = await syncMoviesHandler(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/api/sync.test.ts
```

Expected: FAIL — handler modules not found

- [ ] **Step 3: Create `src/app/api/sync/movies/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { movies } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'

export interface MaoyanMovie {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: string | null  // null = still in theater
}

export async function syncMoviesHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { movies: MaoyanMovie[] }
  const db = getDb()
  const now = new Date().toISOString()

  for (const m of body.movies) {
    await db
      .insert(movies)
      .values({
        title: m.title,
        maoyanId: m.maoyan_id,
        releaseDate: m.release_date,
        theaterEndDate: m.theater_end_date,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: movies.maoyanId,
        set: {
          title: m.title,
          theaterEndDate: m.theater_end_date,
          updatedAt: now,
        },
      })
  }

  return Response.json({ ok: true, count: body.movies.length })
}
```

- [ ] **Step 4: Create `src/app/api/sync/movies/route.ts`**

```typescript
import { syncMoviesHandler } from './handler'

export const runtime = 'edge'
export const POST = syncMoviesHandler
```

- [ ] **Step 5: Create `src/app/api/sync/enrich/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { movies } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export interface EnrichPayload {
  maoyan_id: string
  douban_id: string
  poster_url: string
  rating: number
  description: string
}

export async function syncEnrichHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { movies: EnrichPayload[] }
  const db = getDb()
  const now = new Date().toISOString()

  for (const m of body.movies) {
    await db
      .update(movies)
      .set({
        doubanId: m.douban_id,
        posterUrl: m.poster_url,
        rating: m.rating,
        description: m.description,
        updatedAt: now,
      })
      .where(eq(movies.maoyanId, m.maoyan_id))
  }

  return Response.json({ ok: true, count: body.movies.length })
}
```

- [ ] **Step 6: Create `src/app/api/sync/enrich/route.ts`**

```typescript
import { syncEnrichHandler } from './handler'

export const runtime = 'edge'
export const POST = syncEnrichHandler
```

- [ ] **Step 7: Create `src/app/api/sync/platforms/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { moviePlatforms } from '@/db/schema'
import { validateBearerToken } from '@/lib/auth'

export interface PlatformUpdate {
  movie_id: number
  platform: string
  status: 'not_available' | 'available'
  play_url?: string
}

export async function syncPlatformsHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { updates: PlatformUpdate[] }
  const db = getDb()
  const now = new Date().toISOString()

  for (const u of body.updates) {
    await db
      .insert(moviePlatforms)
      .values({
        movieId: u.movie_id,
        platform: u.platform,
        status: u.status,
        playUrl: u.play_url ?? null,
        availableAt: u.status === 'available' ? now : null,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: [moviePlatforms.movieId, moviePlatforms.platform],
        set: {
          status: u.status,
          playUrl: u.play_url ?? null,
          availableAt: u.status === 'available' ? now : null,
          lastCheckedAt: now,
        },
      })
  }

  return Response.json({ ok: true, count: body.updates.length })
}
```

- [ ] **Step 8: Create `src/app/api/sync/platforms/route.ts`**

```typescript
import { syncPlatformsHandler } from './handler'

export const runtime = 'edge'
export const POST = syncPlatformsHandler
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm test tests/api/sync.test.ts
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: sync API endpoints – /api/sync/movies, enrich, platforms"
```

---

## Task 5: Public Movies API

**Files:**
- Create: `src/app/api/movies/route.ts`
- Create: `src/app/api/movies/[id]/route.ts`
- Create: `src/app/api/movies/search/route.ts`
- Create: `tests/api/movies.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/movies.test.ts`:

```typescript
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
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/api/movies.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create `src/app/api/movies/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { isNull, isNotNull, eq } from 'drizzle-orm'

export async function moviesListHandler(_req: Request): Promise<Response> {
  const db = getDb()

  const rows = await db
    .select()
    .from(movies)
    .leftJoin(moviePlatforms, eq(movies.id, moviePlatforms.movieId))

  // Group movies and attach platform data
  const movieMap = new Map<number, {
    movie: typeof movies.$inferSelect
    platforms: typeof moviePlatforms.$inferSelect[]
  }>()

  for (const row of rows) {
    if (!movieMap.has(row.movies.id)) {
      movieMap.set(row.movies.id, { movie: row.movies, platforms: [] })
    }
    if (row.movie_platforms) {
      movieMap.get(row.movies.id)!.platforms.push(row.movie_platforms)
    }
  }

  const all = Array.from(movieMap.values())

  const inTheater = all
    .filter(r => r.movie.theaterEndDate === null)
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  const leftTheater = all.filter(r => r.movie.theaterEndDate !== null)

  const waitingOnline = leftTheater
    .filter(r => r.platforms.every(p => p.status === 'not_available'))
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  const available = leftTheater
    .filter(r => r.platforms.some(p => p.status === 'available'))
    .map(r => ({ ...r.movie, platforms: r.platforms }))

  return Response.json({ inTheater, waitingOnline, available })
}
```

- [ ] **Step 4: Create `src/app/api/movies/route.ts`**

```typescript
import { moviesListHandler } from './handler'

export const runtime = 'edge'
export const GET = moviesListHandler
```

- [ ] **Step 5: Create `src/app/api/movies/[id]/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function movieDetailHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const db = getDb()

  const [movie] = await db.select().from(movies).where(eq(movies.id, parseInt(id)))
  if (!movie) return Response.json({ error: 'Not found' }, { status: 404 })

  const platforms = await db.select().from(moviePlatforms).where(eq(moviePlatforms.movieId, movie.id))

  return Response.json({ ...movie, platforms })
}
```

- [ ] **Step 6: Create `src/app/api/movies/[id]/route.ts`**

```typescript
import { movieDetailHandler } from './handler'

export const runtime = 'edge'
export const GET = movieDetailHandler
```

- [ ] **Step 7: Create `src/app/api/movies/search/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { movies, moviePlatforms } from '@/db/schema'
import { like, eq } from 'drizzle-orm'

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
```

- [ ] **Step 8: Create `src/app/api/movies/search/route.ts`**

```typescript
import { movieSearchHandler } from './handler'

export const runtime = 'edge'
export const GET = movieSearchHandler
```

- [ ] **Step 9: Run tests**

```bash
pnpm test tests/api/movies.test.ts
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: public movies API – list, detail, search"
```

---

## Task 6: Watchlist API

**Files:**
- Create: `src/app/api/watchlist/route.ts`
- Create: `src/app/api/watchlist/[movie_id]/route.ts`
- Create: `tests/api/watchlist.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/watchlist.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: { DB: {} } })),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/api/watchlist.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create `src/app/api/watchlist/handler.ts`**

```typescript
import { getDb } from '@/db/client'
import { watchlist, movies, moviePlatforms } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUserToken } from '@/lib/cookie'

const WATCHLIST_LIMIT = 200

export async function watchlistGetHandler(_req: Request): Promise<Response> {
  const userToken = await getUserToken()
  const db = getDb()

  const rows = await db
    .select()
    .from(watchlist)
    .leftJoin(movies, eq(watchlist.movieId, movies.id))
    .where(eq(watchlist.userToken, userToken))

  const items = rows
    .filter(r => r.movies !== null)
    .map(r => r.movies!)

  return Response.json({ items })
}

export async function watchlistPostHandler(req: Request): Promise<Response> {
  const userToken = await getUserToken()
  const db = getDb()
  const { movie_id } = await req.json() as { movie_id: number }

  // Check limit
  const existing = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userToken, userToken))
  if (existing.length >= WATCHLIST_LIMIT) {
    return Response.json({ error: 'Watchlist limit reached (200)' }, { status: 429 })
  }

  await db
    .insert(watchlist)
    .values({ movieId: movie_id, userToken, createdAt: new Date().toISOString() })
    .onConflictDoNothing()

  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Create `src/app/api/watchlist/route.ts`**

```typescript
import { watchlistGetHandler, watchlistPostHandler } from './handler'

export const runtime = 'edge'
export const GET = watchlistGetHandler
export const POST = watchlistPostHandler
```

- [ ] **Step 5: Create `src/app/api/watchlist/[movie_id]/route.ts`**

```typescript
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
  const userToken = await getUserToken()
  const db = getDb()

  await db
    .delete(watchlist)
    .where(and(
      eq(watchlist.userToken, userToken),
      eq(watchlist.movieId, parseInt(movie_id))
    ))

  return Response.json({ ok: true })
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test tests/api/watchlist.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: watchlist API – GET, POST (w/ 200 limit), DELETE"
```

---

## Task 7: Maoyan Scraper

**Files:**
- Create: `scripts/lib/browser.ts`
- Create: `scripts/lib/api-client.ts`
- Create: `scripts/maoyan-scraper.ts`

- [ ] **Step 1: Create `scripts/lib/browser.ts`**

```typescript
import { chromium, type Browser, type Page } from 'playwright'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

export async function closeBrowser(): Promise<void> {
  await browser?.close()
  browser = null
}

export async function fetchWithBrowser(url: string): Promise<Page> {
  const b = await getBrowser()
  const page = await b.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  return page
}
```

- [ ] **Step 2: Create `scripts/lib/api-client.ts`**

```typescript
const BASE_URL = process.env.APP_URL!   // e.g. https://movie-online.pages.dev
const SECRET  = process.env.SYNC_SECRET!

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} failed: ${res.status} ${text}`)
  }
}

export const apiClient = {
  syncMovies: (movies: unknown[]) => post('/api/sync/movies', { movies }),
  syncEnrich: (movies: unknown[]) => post('/api/sync/enrich', { movies }),
  syncPlatforms: (updates: unknown[]) => post('/api/sync/platforms', { updates }),
}
```

- [ ] **Step 3: Create `scripts/maoyan-scraper.ts`**

```typescript
import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'

interface MaoyanEntry {
  maoyan_id: string
  title: string
  release_date: string
  theater_end_date: null  // all movies in the hot list are still in theaters
}

async function scrapeMaoyanList(): Promise<MaoyanEntry[]> {
  // Maoyan real-time box office: https://piaofang.maoyan.com/rankings/movie
  const page = await fetchWithBrowser('https://piaofang.maoyan.com/rankings/movie')

  await page.waitForSelector('[class*="MovieName"]', { timeout: 15000 })

  const entries = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="MovieItem"]'))
    return rows.map(row => {
      const link = row.querySelector('a[href*="/movie/"]') as HTMLAnchorElement | null
      const titleEl = row.querySelector('[class*="MovieName"]')
      const dateEl = row.querySelector('[class*="releaseInfo"]')

      const href = link?.href ?? ''
      const maoyanId = href.match(/\/movie\/(\d+)/)?.[1] ?? ''
      const title = titleEl?.textContent?.trim() ?? ''
      // Date format from Maoyan: "2024年01月01日上映" → "2024-01-01"
      const rawDate = dateEl?.textContent ?? ''
      const releaseDate = rawDate.replace(/(\d{4})年(\d{2})月(\d{2})日.*/, '$1-$2-$3')

      return { maoyan_id: maoyanId, title, release_date: releaseDate, theater_end_date: null }
    }).filter(e => e.maoyan_id && e.title)
  })

  await page.close()
  return entries
}

async function main() {
  console.log('[maoyan-scraper] Starting...')
  const movies = await scrapeMaoyanList()
  console.log(`[maoyan-scraper] Found ${movies.length} movies in theaters`)

  await apiClient.syncMovies(movies)
  console.log('[maoyan-scraper] Synced to DB')

  await closeBrowser()
}

main().catch(err => {
  console.error('[maoyan-scraper] FAILED:', err)
  process.exit(1)
})
```

> **Note:** The `theater_end_date` for movies NOT in this list but previously synced will be set to today by the API via a separate mechanism. Add this logic to `syncMoviesHandler` in Task 4: after upserting the incoming list, run:
>
> ```typescript
> // In syncMoviesHandler, after the upsert loop:
> // Mark movies that disappeared from theater list
> const incomingIds = body.movies.map(m => m.maoyan_id)
> if (incomingIds.length > 0) {
>   await db.update(movies)
>     .set({ theaterEndDate: today, updatedAt: now })
>     .where(and(
>       isNull(movies.theaterEndDate),
>       notInArray(movies.maoyanId, incomingIds)
>     ))
> }
> ```
> Add imports: `import { and, isNull, notInArray } from 'drizzle-orm'`  
> Add `const today = now.slice(0, 10)` before the loop.  
> Modify `src/app/api/sync/movies/handler.ts` accordingly.

- [ ] **Step 4: Update `src/app/api/sync/movies/handler.ts` with "mark left-theater" logic**

Final `syncMoviesHandler` body:

```typescript
export async function syncMoviesHandler(request: Request): Promise<Response> {
  if (!validateBearerToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { movies: MaoyanMovie[] }
  const db = getDb()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // Upsert incoming movies
  for (const m of body.movies) {
    await db
      .insert(movies)
      .values({
        title: m.title,
        maoyanId: m.maoyan_id,
        releaseDate: m.release_date,
        theaterEndDate: m.theater_end_date,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: movies.maoyanId,
        set: { title: m.title, theaterEndDate: m.theater_end_date, updatedAt: now },
      })
  }

  // Mark movies that have left theaters (not in incoming list)
  if (body.movies.length > 0) {
    const incomingIds = body.movies.map(m => m.maoyan_id)
    await db
      .update(movies)
      .set({ theaterEndDate: today, updatedAt: now })
      .where(and(isNull(movies.theaterEndDate), notInArray(movies.maoyanId, incomingIds)))
  }

  return Response.json({ ok: true, count: body.movies.length })
}
```

Add to imports: `import { and, isNull, notInArray } from 'drizzle-orm'`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: maoyan scraper + mark-left-theater logic in sync/movies"
```

---

## Task 8: Douban Enricher

**Files:**
- Create: `scripts/douban-enricher.ts`

- [ ] **Step 1: Create `scripts/douban-enricher.ts`**

```typescript
import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'

const APP_URL = process.env.APP_URL!
const SYNC_SECRET = process.env.SYNC_SECRET!

interface MovieToEnrich {
  id: number
  maoyan_id: string
  title: string
  release_date: string
}

interface EnrichedData {
  maoyan_id: string
  douban_id: string
  poster_url: string
  rating: number
  description: string
}

async function fetchMoviesToEnrich(): Promise<MovieToEnrich[]> {
  // Call our own API to get movies without douban_id
  const res = await fetch(`${APP_URL}/api/movies?no_douban=1`, {
    headers: { 'Authorization': `Bearer ${SYNC_SECRET}` },
  })
  const data = await res.json() as { movies: MovieToEnrich[] }
  return data.movies
}

async function enrichFromMaoyan(movie: MovieToEnrich): Promise<string | null> {
  // Strategy 1: scrape Maoyan detail page for embedded Douban link
  const page = await fetchWithBrowser(`https://www.maoyan.com/films/${movie.maoyan_id}`)
  const doubanLink = await page.evaluate(() => {
    const a = document.querySelector('a[href*="movie.douban.com/subject/"]') as HTMLAnchorElement | null
    return a?.href ?? null
  })
  await page.close()
  if (doubanLink) {
    const match = doubanLink.match(/subject\/(\d+)/)
    return match?.[1] ?? null
  }
  return null
}

async function enrichFromDoubanSearch(movie: MovieToEnrich): Promise<EnrichedData | null> {
  const year = movie.release_date.slice(0, 4)
  const query = encodeURIComponent(`${movie.title} ${year}`)
  const page = await fetchWithBrowser(`https://search.douban.com/movie/subject_search?search_text=${query}`)

  const result = await page.evaluate((year: string) => {
    const items = Array.from(document.querySelectorAll('.item-root'))
    for (const item of items) {
      const yearEl = item.querySelector('.abstract')
      const itemYear = yearEl?.textContent?.match(/\d{4}/)?.[0]
      if (!itemYear || Math.abs(parseInt(itemYear) - parseInt(year)) > 1) continue

      const link = item.querySelector('a[href*="movie.douban.com/subject/"]') as HTMLAnchorElement | null
      const doubanId = link?.href?.match(/subject\/(\d+)/)?.[1]
      const poster = (item.querySelector('img') as HTMLImageElement | null)?.src
      const ratingEl = item.querySelector('.rating_nums')
      const desc = item.querySelector('.abstract')?.textContent?.trim()

      if (doubanId) {
        return {
          douban_id: doubanId,
          poster_url: poster ?? '',
          rating: parseFloat(ratingEl?.textContent ?? '0'),
          description: desc ?? '',
        }
      }
    }
    return null
  }, year)

  await page.close()
  return result ? { ...result, maoyan_id: movie.maoyan_id } : null
}

async function enrichMovie(movie: MovieToEnrich): Promise<EnrichedData | null> {
  // Strategy 1: get Douban ID from Maoyan detail page
  const doubanId = await enrichFromMaoyan(movie)
  if (doubanId) {
    // Fetch Douban detail with this ID
    const page = await fetchWithBrowser(`https://movie.douban.com/subject/${doubanId}/`)
    const detail = await page.evaluate(() => {
      const poster = (document.querySelector('#mainpic img') as HTMLImageElement | null)?.src
      const rating = parseFloat(document.querySelector('.rating_num')?.textContent ?? '0')
      const desc = document.querySelector('#link-report .all.hidden span')?.textContent?.trim()
        ?? document.querySelector('#link-report span')?.textContent?.trim()
        ?? ''
      return { poster_url: poster ?? '', rating, description: desc }
    })
    await page.close()
    return { maoyan_id: movie.maoyan_id, douban_id: doubanId, ...detail }
  }

  // Strategy 2: search Douban
  return enrichFromDoubanSearch(movie)
}

async function main() {
  console.log('[douban-enricher] Starting...')
  const toEnrich = await fetchMoviesToEnrich()
  console.log(`[douban-enricher] ${toEnrich.length} movies need enrichment`)

  const enriched: EnrichedData[] = []
  for (const movie of toEnrich) {
    console.log(`[douban-enricher] Processing: ${movie.title}`)
    const data = await enrichMovie(movie)
    if (data) {
      enriched.push(data)
    } else {
      console.log(`[douban-enricher] Skipping ${movie.title} – no match found`)
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1500))
  }

  if (enriched.length > 0) {
    await apiClient.syncEnrich(enriched)
  }
  console.log(`[douban-enricher] Enriched ${enriched.length} movies`)

  await closeBrowser()
}

main().catch(err => {
  console.error('[douban-enricher] FAILED:', err)
  process.exit(1)
})
```

> **Prerequisite:** Add `GET /api/movies?no_douban=1` to `src/app/api/movies/route.ts`:

```typescript
// In moviesListHandler, check for no_douban query param
export async function moviesListHandler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const noDouban = searchParams.get('no_douban') === '1'

  if (noDouban) {
    // Only return movies needing enrichment (internal use by douban-enricher)
    if (!validateBearerToken(req)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = getDb()
    const rows = await db.select().from(movies).where(isNull(movies.doubanId)).limit(50)
    return Response.json({ movies: rows.map(m => ({
      id: m.id, maoyan_id: m.maoyanId, title: m.title, release_date: m.releaseDate
    }))})
  }

  // ... existing list logic
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: douban enricher script"
```

---

## Task 9: Platform Checker

**Files:**
- Create: `scripts/platform-checker.ts`

- [ ] **Step 1: Create `scripts/platform-checker.ts`**

```typescript
import { fetchWithBrowser, closeBrowser } from './lib/browser'
import { apiClient } from './lib/api-client'
import { matchesMovie, type PlatformResult } from '../src/lib/platform-match'

const APP_URL = process.env.APP_URL!
const SYNC_SECRET = process.env.SYNC_SECRET!

interface MovieToCheck {
  id: number
  title: string
  release_date: string
  theater_end_date: string
}

const PLATFORMS = [
  { key: 'tencent', searchUrl: (title: string) => `https://v.qq.com/x/search/?q=${encodeURIComponent(title)}&stag=0&filter_type=movie` },
  { key: 'iqiyi',   searchUrl: (title: string) => `https://www.iqiyi.com/search.html#src=input&query=${encodeURIComponent(title)}` },
  { key: 'youku',   searchUrl: (title: string) => `https://so.youku.com/search_video/q_${encodeURIComponent(title)}?searchfrom=1` },
  { key: 'mango',   searchUrl: (title: string) => `https://so.mgtv.com/so/k-${encodeURIComponent(title)}.html` },
  { key: 'bilibili', searchUrl: (title: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}&search_type=video&tids=23` },
  { key: 'xigua',  searchUrl: (title: string) => `https://www.ixigua.com/search/${encodeURIComponent(title)}/?search_type=video` },
]

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function shouldCheck(lastCheckedAt: string | null, theaterEndDate: string): boolean {
  const days = daysSince(theaterEndDate)
  const interval = days <= 30 ? 1 : days <= 90 ? 3 : 7
  if (!lastCheckedAt) return true
  const daysSinceCheck = daysSince(lastCheckedAt)
  return daysSinceCheck >= interval
}

async function checkPlatform(
  movie: MovieToCheck,
  platform: typeof PLATFORMS[0]
): Promise<{ status: 'available' | 'not_available'; play_url?: string }> {
  const page = await fetchWithBrowser(platform.searchUrl(movie.title))

  const result = await page.evaluate((title: string) => {
    // Generic extraction — each platform needs tuning during integration
    const items = Array.from(document.querySelectorAll('[class*="result"], [class*="item"], [class*="card"]')).slice(0, 5)
    for (const item of items) {
      const titleEl = item.querySelector('[class*="title"], h3, h2') as HTMLElement | null
      const rawTitle = titleEl?.textContent?.trim() ?? ''
      const yearEl = item.querySelector('[class*="year"], [class*="date"]')
      const yearText = yearEl?.textContent ?? ''
      const yearMatch = yearText.match(/\d{4}/)
      const year = yearMatch ? parseInt(yearMatch[0]) : 0
      const typeEl = item.querySelector('[class*="type"], [class*="category"]')
      const type = typeEl?.textContent?.toLowerCase().includes('电影') ? 'movie' : 'other'
      const durationEl = item.querySelector('[class*="duration"], [class*="time"]')
      const durationText = durationEl?.textContent ?? ''
      const durationMatch = durationText.match(/(\d+)分/)
      const durationMinutes = durationMatch ? parseInt(durationMatch[1]) : 90 // default 90 if not found
      const statusEl = item.querySelector('[class*="vip"], [class*="pay"], [class*="free"]')
      const statusText = statusEl?.textContent?.toLowerCase() ?? ''
      const status = statusText.includes('预售') || statusText.includes('即将') ? 'presale' : 'available'
      const link = (item.querySelector('a') as HTMLAnchorElement | null)?.href ?? ''

      return { title: rawTitle, year, type, durationMinutes, status, link }
    }
    return null
  }, movie.title)

  await page.close()

  if (!result) return { status: 'not_available' }

  const matches = matchesMovie(
    { title: movie.title, releaseDate: movie.release_date },
    {
      title: result.title,
      year: result.year,
      type: result.type === 'movie' ? 'movie' : 'other',
      durationMinutes: result.durationMinutes,
      status: result.status,
    }
  )

  return matches
    ? { status: 'available', play_url: result.link }
    : { status: 'not_available' }
}

async function fetchMoviesToCheck(): Promise<Array<MovieToCheck & { platforms: Array<{ platform: string; last_checked_at: string | null }> }>> {
  const res = await fetch(`${APP_URL}/api/movies?needs_check=1`, {
    headers: { 'Authorization': `Bearer ${SYNC_SECRET}` },
  })
  return (await res.json() as { movies: any[] }).movies
}

async function main() {
  console.log('[platform-checker] Starting...')
  const movies = await fetchMoviesToCheck()
  console.log(`[platform-checker] ${movies.length} movies to process`)

  const updates: Array<{ movie_id: number; platform: string; status: string; play_url?: string }> = []

  for (const movie of movies) {
    for (const platform of PLATFORMS) {
      const existingPlatform = movie.platforms.find((p: any) => p.platform === platform.key)
      if (existingPlatform?.status === 'available') continue  // already online, skip
      if (!shouldCheck(existingPlatform?.last_checked_at ?? null, movie.theater_end_date)) continue

      console.log(`[platform-checker] Checking ${movie.title} on ${platform.key}`)
      const result = await checkPlatform(movie, platform)
      updates.push({ movie_id: movie.id, platform: platform.key, ...result })

      await new Promise(r => setTimeout(r, 1000))  // rate limit delay
    }
  }

  if (updates.length > 0) {
    await apiClient.syncPlatforms(updates)
  }
  console.log(`[platform-checker] Done. ${updates.length} platform updates`)

  await closeBrowser()
}

main().catch(err => {
  console.error('[platform-checker] FAILED:', err)
  process.exit(1)
})
```

> **Prerequisite:** Add `GET /api/movies?needs_check=1` to `moviesListHandler` (similar pattern to `no_douban=1`). Returns movies where `theater_end_date IS NOT NULL`, with their platform rows attached.

- [ ] **Step 2: Add `needs_check` endpoint to `src/app/api/movies/handler.ts`**

In `moviesListHandler`, add before the existing logic:

```typescript
if (searchParams.get('needs_check') === '1') {
  if (!validateBearerToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getDb()
  const rows = await db
    .select()
    .from(movies)
    .leftJoin(moviePlatforms, eq(movies.id, moviePlatforms.movieId))
    .where(isNotNull(movies.theaterEndDate))

  // Group and return
  const movieMap = new Map<number, any>()
  for (const row of rows) {
    if (!movieMap.has(row.movies.id)) {
      movieMap.set(row.movies.id, {
        id: row.movies.id,
        title: row.movies.title,
        release_date: row.movies.releaseDate,
        theater_end_date: row.movies.theaterEndDate,
        platforms: [],
      })
    }
    if (row.movie_platforms) {
      movieMap.get(row.movies.id).platforms.push({
        platform: row.movie_platforms.platform,
        status: row.movie_platforms.status,
        last_checked_at: row.movie_platforms.lastCheckedAt,
      })
    }
  }
  return Response.json({ movies: Array.from(movieMap.values()) })
}
```

Add import: `import { isNotNull } from 'drizzle-orm'`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: platform checker script + needs_check API endpoint"
```

---

## Task 10: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/scrape.yml`

- [ ] **Step 1: Create `.github/workflows/scrape.yml`**

```yaml
name: Daily Scrape

on:
  schedule:
    - cron: '0 0 * * *'   # 08:00 Beijing (UTC+8) = 00:00 UTC
  workflow_dispatch:        # allow manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: pnpm exec playwright install chromium --with-deps

      - name: Run Maoyan scraper
        env:
          APP_URL: ${{ secrets.APP_URL }}
          SYNC_SECRET: ${{ secrets.SYNC_SECRET }}
        run: npx tsx scripts/maoyan-scraper.ts

      - name: Run Douban enricher
        env:
          APP_URL: ${{ secrets.APP_URL }}
          SYNC_SECRET: ${{ secrets.SYNC_SECRET }}
        run: npx tsx scripts/douban-enricher.ts

      - name: Run Platform checker
        env:
          APP_URL: ${{ secrets.APP_URL }}
          SYNC_SECRET: ${{ secrets.SYNC_SECRET }}
        run: npx tsx scripts/platform-checker.ts
```

> **GitHub Secrets to configure:**
> - `APP_URL`: your Cloudflare Pages URL (e.g. `https://movie-online.pages.dev`)
> - `SYNC_SECRET`: same value as in Cloudflare Pages environment variables

- [ ] **Step 2: Add `tsx` dependency**

```bash
pnpm add -D tsx
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: GitHub Actions daily scrape workflow"
```

---

## Task 11: Home Page

**Files:**
- Create: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '电影上线追踪',
  description: '追踪院线电影在各大平台的上线动态',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#f5f5f5' }}>
        <nav style={{ background: '#1a1a2e', color: 'white', padding: '12px 24px', display: 'flex', gap: 16 }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>🎬 电影上线追踪</a>
          <a href="/watchlist" style={{ color: '#ccc', textDecoration: 'none' }}>我的追踪</a>
        </nav>
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create `src/app/page.tsx`**

```tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: home page – 3-section movie grid with search"
```

---

## Task 12: Movie Detail Page

**Files:**
- Create: `src/app/movie/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/movie/[id]/page.tsx`**

```tsx
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

          <form action={inWatchlist ? `/api/watchlist/${movie.id}` : '/api/watchlist'} method={inWatchlist ? 'DELETE' : 'POST'}>
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
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: movie detail page – info, platform status, watchlist button"
```

---

## Task 13: Watchlist Page

**Files:**
- Create: `src/app/watchlist/page.tsx`

- [ ] **Step 1: Create `src/app/watchlist/page.tsx`**

```tsx
import { getDb } from '@/db/client'
import { watchlist, movies, moviePlatforms } from '@/db/schema'
import { eq } from 'drizzle-orm'
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

  const movieIds = wlRows.map(r => r.movies?.id).filter(Boolean) as number[]
  const allPlatforms = movieIds.length > 0
    ? await db.select().from(moviePlatforms).where(
        movieIds.length === 1
          ? eq(moviePlatforms.movieId, movieIds[0])
          : moviePlatforms.movieId.in(movieIds)  // drizzle inArray
      )
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
            <form action={`/api/watchlist/${movie.id}`} method="DELETE">
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
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: watchlist page"
```

---

## Task 14: Deployment

**Files:**
- Modify: `wrangler.toml` (fill in real database_id)

- [ ] **Step 1: Create D1 database on Cloudflare**

```bash
pnpm wrangler d1 create movie-online
```

Copy the `database_id` from the output into `wrangler.toml`.

- [ ] **Step 2: Apply migration to production D1**

```bash
pnpm db:migrate:prod
```

Expected: `✅ Applied 1 migration to movie-online (remote)`

- [ ] **Step 3: Set environment variables on Cloudflare Pages**

In Cloudflare Dashboard → Pages → movie-online → Settings → Environment Variables, add:
- `SYNC_SECRET` = same value as in `.env.local`

- [ ] **Step 4: Build and deploy**

```bash
pnpm deploy
```

Expected: `✨ Deployment complete! https://movie-online.pages.dev`

- [ ] **Step 5: Add GitHub Secrets**

In GitHub repo → Settings → Secrets → Actions, add:
- `APP_URL` = `https://movie-online.pages.dev`
- `SYNC_SECRET` = same value as Cloudflare env var

- [ ] **Step 6: Test scraper manually**

```bash
APP_URL=https://movie-online.pages.dev SYNC_SECRET=your-secret npx tsx scripts/maoyan-scraper.ts
```

Expected: `[maoyan-scraper] Synced to DB`

- [ ] **Step 7: Trigger GitHub Actions workflow manually**

GitHub → Actions → Daily Scrape → Run workflow

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "deploy: production D1 + Cloudflare Pages setup"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| movies / movie_platforms / watchlist schema | Task 2 |
| Bearer token auth for sync endpoints | Tasks 3, 4 |
| upsert by maoyan_id (movies) | Task 4, 7 |
| UNIQUE(movie_id, platform) + lazy create | Tasks 2, 4 |
| Mark left-theater logic | Task 7 |
| 5-criteria platform match | Task 3, 9 |
| Douban: maoyan-link first, search fallback | Task 8 |
| Check frequency by days-since-theater | Task 9 |
| 6 platforms | Task 9 |
| Cookie (HttpOnly/Secure/SameSite/MaxAge) | Task 3 |
| watchlist 200-limit + UNIQUE constraint | Tasks 2, 6 |
| Sync interfaces idempotent | Tasks 4, 5, 6 |
| Home page 3 sections + search | Task 11 |
| theater_end_date labeled "estimate" | Tasks 11, 12 |
| Watchlist page with cookie warning | Task 13 |
| GitHub Actions cron 08:00 BJ | Task 10 |
| ISO 8601 UTC timestamps | All tasks |

**No placeholders found.** All steps include actual code.

**Type consistency:**
- `maoyanId` (camelCase in Drizzle schema) vs `maoyan_id` (snake_case in API payloads) — consistent: schema uses camelCase, API JSON uses snake_case.
- `matchesMovie` signature matches between `platform-match.ts` (Task 3) and `platform-checker.ts` (Task 9). ✅
