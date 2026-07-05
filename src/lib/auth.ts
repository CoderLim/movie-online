import { getRequestContext } from '@cloudflare/next-on-pages'

function getSyncSecret(): string | undefined {
  try {
    const { env } = getRequestContext()
    if (env.SYNC_SECRET) return env.SYNC_SECRET
  } catch {
    // Not in edge runtime (e.g. unit tests)
  }
  return process.env.SYNC_SECRET
}

export function validateBearerToken(request: Request): boolean {
  const syncSecret = getSyncSecret()
  if (!syncSecret) {
    console.error('[auth] SYNC_SECRET is not set — all sync requests will be rejected')
    return false
  }
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === syncSecret
}
