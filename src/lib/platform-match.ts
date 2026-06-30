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
