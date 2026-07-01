import type { PlatformResult } from '../../src/lib/platform-match'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface PlatformCandidate extends PlatformResult {
  play_url: string
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '')
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json() as Promise<T>
}

function toCandidate(
  partial: Omit<PlatformCandidate, 'type' | 'durationMinutes' | 'status'> &
    Partial<Pick<PlatformCandidate, 'type' | 'durationMinutes' | 'status'>>
): PlatformCandidate {
  return {
    type: 'movie',
    durationMinutes: 90,
    status: 'available',
    ...partial,
    title: stripHtml(partial.title),
  }
}

export async function searchTencent(title: string): Promise<PlatformCandidate[]> {
  const data = await fetchJson<{
    data?: {
      normalList?: {
        itemList?: Array<{
          doc?: { id?: string }
          videoInfo?: {
            typeName?: string
            title?: string
            year?: number
            imgTag?: string
            coverDoc?: { timeLong?: number } | null
          }
        }>
      }
    }
  }>('https://pbaccess.video.qq.com/trpc.videosearch.mobile_search.MultiTerminalSearch/MbSearch?vversion_platform=2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://v.qq.com/',
      Origin: 'https://v.qq.com',
    },
    body: JSON.stringify({
      version: '26022601',
      clientType: 1,
      filterValue: '',
      uuid: crypto.randomUUID(),
      retry: 0,
      query: title,
      pagenum: 0,
      isPrefetch: true,
      pagesize: 30,
      queryFrom: 0,
      searchDatakey: '',
      transInfo: '',
      isneedQc: true,
      preQid: '',
      adClientInfo: '',
      extraInfo: {
        isNewMarkLabel: '1',
        multi_terminal_pc: '1',
        themeType: '1',
        sugRelatedIds: '{}',
        appVersion: '',
        frontVersion: '26060108',
      },
      featureList: [
        'DEFAULT_FEFEATURE',
        'PC_SHORT_VIDEOS_WATERFALL',
        'PC_WANT_EPISODE_V2',
        'PC_WANT_EPISODE',
      ],
    }),
  })

  const items = data.data?.normalList?.itemList ?? []
  const candidates: PlatformCandidate[] = []

  for (const item of items) {
    const info = item.videoInfo
    const cid = item.doc?.id
    if (!info || info.typeName !== '电影' || !cid) continue

    const seconds = info.coverDoc?.timeLong ?? 0
    if (seconds < 3600) continue

    const durationMinutes = Math.round(seconds / 60)
    const isVip = (info.imgTag ?? '').includes('VIP')

    candidates.push(
      toCandidate({
        title: info.title ?? '',
        year: info.year ?? 0,
        durationMinutes,
        status: isVip ? 'vip' : 'available',
        play_url: `https://v.qq.com/x/cover/${cid}.html`,
      })
    )
  }

  return candidates
}

export async function searchIqiyi(title: string): Promise<PlatformCandidate[]> {
  const url = new URL('https://mesh.if.iqiyi.com/portal/lw/search/homePageV3')
  url.searchParams.set('key', title)
  url.searchParams.set('version', '13.112.21939')
  url.searchParams.set('pageNum', '1')
  url.searchParams.set('pageSize', '10')
  url.searchParams.set('site', 'iqiyi')
  url.searchParams.set('src', 'home')
  url.searchParams.set('channel', '1')

  const data = await fetchJson<{
    data?: {
      templates?: Array<{
        template?: number
        albumInfo?: {
          title?: string
          channel?: string
          year?: { value?: string }
          playUrl?: string
          firstVideoIsVip?: boolean
          autoPlayVideo?: { duration?: number }
          duration?: number
        }
      }>
    }
  }>(url.toString(), { headers: { Referer: 'https://www.iqiyi.com/' } })

  const candidates: PlatformCandidate[] = []

  for (const tpl of data.data?.templates ?? []) {
    if (tpl.template !== 103) continue
    const album = tpl.albumInfo
    if (!album?.title || !(album.channel ?? '').includes('电影')) continue

    const year = parseInt(album.year?.value ?? '0', 10)
    const rawDuration = album.autoPlayVideo?.duration ?? album.duration ?? 0
    const durationMinutes =
      rawDuration >= 3_600_000
        ? Math.round(rawDuration / 60_000)
        : rawDuration >= 60
          ? Math.round(rawDuration / 60)
          : 90

    const vidMatch = (album.playUrl ?? '').match(/(?:^|;)vid=([a-f0-9]+)/i)
    const playUrl = vidMatch
      ? `https://www.iqiyi.com/v_${vidMatch[1]}.html`
      : `https://www.iqiyi.com/search/${encodeURIComponent(title)}.html`

    candidates.push(
      toCandidate({
        title: album.title,
        year,
        durationMinutes,
        status: album.firstVideoIsVip ? 'vip' : 'available',
        play_url: playUrl,
      })
    )
  }

  return candidates
}

interface YoukuComponent {
  commonData?: {
    titleDTO?: { displayName?: string }
    feature?: string
    leftButtonDTO?: { action?: { value?: string } }
    action?: { value?: string }
  }
  componentMap?: Record<
    string,
    {
      componentId?: string
      data?: Array<{
        titleDTO?: { displayName?: string }
        feature?: string
        leftButtonDTO?: { action?: { value?: string } }
        action?: { value?: string }
      }>
    }
  >
}

export async function searchYouku(title: string): Promise<PlatformCandidate[]> {
  const url = new URL('https://search.youku.com/api/search')
  url.searchParams.set('keyword', title)
  url.searchParams.set('userAgent', 'pc')
  url.searchParams.set('site', '1')
  url.searchParams.set('searchType', '7')
  url.searchParams.set('pg', '1')
  url.searchParams.set('pz', '10')

  const data = await fetchJson<{ pageComponentList?: YoukuComponent[] }>(url.toString(), {
    headers: { Referer: 'https://search.youku.com/' },
  })

  const candidates: PlatformCandidate[] = []
  const seen = new Set<string>()

  for (const comp of data.pageComponentList ?? []) {
    const blocks: Array<{
      titleDTO?: { displayName?: string }
      feature?: string
      leftButtonDTO?: { action?: { value?: string } }
      action?: { value?: string }
    }> = []

    if (comp.commonData?.titleDTO?.displayName) {
      blocks.push(comp.commonData)
    }
    for (const entry of Object.values(comp.componentMap ?? {})) {
      if (entry.componentId === 'H5ShowCard') {
        blocks.push(...(entry.data ?? []))
      }
    }

    for (const block of blocks) {
      const name = block.titleDTO?.displayName?.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)

      const feature = block.feature ?? ''
      if (!feature.includes('电影')) continue

      const yearMatch = feature.match(/(\d{4})/)
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0
      const playUrl =
        block.leftButtonDTO?.action?.value ??
        (block.action?.value?.startsWith('http') ? block.action.value : '') ??
        `https://so.youku.com/search_video/q_${encodeURIComponent(title)}`

      if (!playUrl.includes('youku.com')) continue

      candidates.push(
        toCandidate({
          title: name,
          year,
          play_url: playUrl,
        })
      )
    }
  }

  return candidates
}

export async function searchMango(title: string): Promise<PlatformCandidate[]> {
  const url = new URL('https://mobileso.bz.mgtv.com/msite/search/v2')
  url.searchParams.set('q', title)
  url.searchParams.set('pn', '1')
  url.searchParams.set('pc', '10')

  const data = await fetchJson<{
    data?: {
      contents?: Array<{
        type?: string
        data?: Array<{
          title?: string
          desc?: string[]
          url?: string
          source?: string
        }>
      }>
    }
  }>(url.toString(), { headers: { Referer: 'https://so.mgtv.com/' } })

  const candidates: PlatformCandidate[] = []

  for (const section of data.data?.contents ?? []) {
    if (section.type !== 'media') continue
    for (const item of section.data ?? []) {
      if (item.source && item.source !== 'imgo') continue
      const desc = (item.desc ?? []).join(' ')
      if (!desc.includes('电影')) continue

      const yearMatch = desc.match(/(\d{4})/)
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0
      const path = item.url ?? ''
      const playUrl = path.startsWith('http')
        ? path
        : path
          ? `https://www.mgtv.com${path}`
          : `https://so.mgtv.com/so/k-${encodeURIComponent(title)}.html`

      candidates.push(
        toCandidate({
          title: stripHtml(item.title ?? ''),
          year,
          play_url: playUrl,
        })
      )
    }
  }

  return candidates
}

export async function searchBilibili(title: string): Promise<PlatformCandidate[]> {
  const url = new URL('https://api.bilibili.com/x/web-interface/search/all/v2')
  url.searchParams.set('keyword', title)

  const data = await fetchJson<{
    data?: {
      result?: Array<{
        result_type?: string
        data?: Array<{
          season_type_name?: string
          title?: string
          org_title?: string
          pubtime?: number
          goto_url?: string
          url?: string
          badges?: Array<{ text?: string }>
        }>
      }>
    }
  }>(url.toString(), { headers: { Referer: 'https://search.bilibili.com/' } })

  const candidates: PlatformCandidate[] = []

  for (const block of data.data?.result ?? []) {
    if (block.result_type !== 'media_ft') continue
    for (const item of block.data ?? []) {
      if (item.season_type_name !== '电影') continue

      const year = item.pubtime ? new Date(item.pubtime * 1000).getFullYear() : 0
      const isVip = (item.badges ?? []).some(b => (b.text ?? '').includes('会员'))

      candidates.push(
        toCandidate({
          title: item.org_title ?? item.title ?? '',
          year,
          status: isVip ? 'vip' : 'available',
          play_url: item.goto_url ?? item.url ?? `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`,
        })
      )
    }
  }

  return candidates
}

/** 西瓜视频暂无稳定公开搜索 API，保留空实现供后续扩展 */
export async function searchXigua(_title: string): Promise<PlatformCandidate[]> {
  return []
}

export const PLATFORM_SEARCHERS: Record<string, (title: string) => Promise<PlatformCandidate[]>> = {
  tencent: searchTencent,
  iqiyi: searchIqiyi,
  youku: searchYouku,
  mango: searchMango,
  bilibili: searchBilibili,
  xigua: searchXigua,
}
