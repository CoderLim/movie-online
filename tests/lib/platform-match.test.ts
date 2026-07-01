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

  it('matches title with HTML highlight tags', () => {
    expect(matchesMovie(baseMovie, {
      title: '<em class="keyword">哪吒之魔童降世</em>',
      year: 2019,
      type: 'movie',
      durationMinutes: 110,
      status: 'available',
    })).toBe(true)
  })
})
