export function validateBearerToken(request: Request): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === process.env.SYNC_SECRET
}
