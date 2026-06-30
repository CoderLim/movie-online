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
