import { cookies } from 'next/headers'

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

  const token = crypto.randomUUID()  // Web Crypto API (available in both edge and Node)
  try {
    cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS)
  } catch {
    // set() can throw if response headers are already sent (e.g. cached Server Component)
    // Return the token anyway — caller can still use it for this request
    console.error('[cookie] Failed to set user_token cookie — headers may already be sent')
  }
  return token
}
