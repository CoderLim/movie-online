import type { Config } from 'drizzle-kit'

// Note: migrations are applied via `wrangler d1 migrations apply` (not drizzle-kit migrate).
// drizzle-kit studio is not supported in this setup (D1 runs in Cloudflare's runtime).
export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
} satisfies Config
