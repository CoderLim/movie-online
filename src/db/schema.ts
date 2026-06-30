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
  movieId: integer('movie_id').notNull().references(() => movies.id),
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
  movieId: integer('movie_id').notNull().references(() => movies.id),
  userToken: text('user_token').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  uniq: unique().on(t.userToken, t.movieId),
}))

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type MoviePlatform = typeof moviePlatforms.$inferSelect
export type NewMoviePlatform = typeof moviePlatforms.$inferInsert
export type Watchlist = typeof watchlist.$inferSelect
export type NewWatchlist = typeof watchlist.$inferInsert
