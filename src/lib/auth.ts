export function validateBearerToken(request: Request): boolean {
  if (!process.env.SYNC_SECRET) {
    console.error('[auth] SYNC_SECRET is not set — all sync requests will be rejected')
    return false
  }
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === process.env.SYNC_SECRET
}
