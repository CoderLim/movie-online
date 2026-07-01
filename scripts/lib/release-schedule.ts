export interface ScheduledRelease {
  title: string
  release_date: string
}

const SCHEDULE_PAGES = [
  { year: 2025, month: 11, url: 'http://www.boxofficecn.com/archives/360343' },
  { year: 2025, month: 12, url: 'http://www.boxofficecn.com/archives/360344' },
]

function parseScheduleTable(html: string, year: number): ScheduledRelease[] {
  const releases: ScheduledRelease[] = []
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g

  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())

    if (cells.length < 2) continue

    const dateMatch = cells[0].match(/(\d{2})月(\d{2})日/)
    if (!dateMatch) continue

    const title = cells[1].replace(/（重影）|\(重影\)/g, '').trim()
    if (!title || title === '影片名称') continue

    releases.push({
      title,
      release_date: `${year}-${dateMatch[1]}-${dateMatch[2]}`,
    })
  }

  return releases
}

export async function fetchScheduledReleases(
  year: number,
  months: number[],
): Promise<ScheduledRelease[]> {
  const pages = SCHEDULE_PAGES.filter(p => p.year === year && months.includes(p.month))
  const all: ScheduledRelease[] = []

  for (const page of pages) {
    const res = await fetch(page.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; movie-online/1.0)' },
    })
    if (!res.ok) {
      throw new Error(`Failed to fetch release schedule: ${page.url} (${res.status})`)
    }
    all.push(...parseScheduleTable(await res.text(), page.year))
  }

  return all
}

export function estimateTheaterEndDate(releaseDate: string): string {
  const d = new Date(`${releaseDate}T12:00:00`)
  d.setDate(d.getDate() + 45)
  return d.toISOString().slice(0, 10)
}
