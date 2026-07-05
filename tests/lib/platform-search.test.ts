import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchMango } from '../../scripts/lib/platform-search'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('searchMango', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns Mango-owned movie candidates from mobile media results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: {
        contents: [
          {
            type: 'media',
            data: [
              {
                source: 'imgo',
                title: '<B>纵</B><B>横</B><B>四</B><B>海</B>',
                desc: ['类型: 电影 / 中国香港 / 2025'],
                url: '/b/9283/24381872.html',
              },
            ],
          },
        ],
      },
    })))

    await expect(searchMango('纵横四海')).resolves.toEqual([
      expect.objectContaining({
        title: '纵横四海',
        year: 2025,
        play_url: 'https://www.mgtv.com/b/9283/24381872.html',
      }),
    ])
  })

  it('does not count aggregated Tencent or iQiyi media results as Mango availability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: {
        contents: [
          {
            type: 'media',
            data: [
              {
                source: 'qq',
                title: '<B>神</B><B>偷</B><B>奶</B><B>爸</B><B>3</B>',
                desc: ['类型: 电影 / 美国 / 2017'],
                url: 'https://m.v.qq.com/x/m/play?cid=y0vxr2r3ptzxbic&ptag=newmangotv',
              },
              {
                source: 'iqiyi',
                title: '<B>神</B><B>偷</B><B>奶</B><B>爸</B>4',
                desc: ['类型: 电影 / 欧美 / 2024'],
                url: 'http://m.iqiyi.com/v_1rq344gjc1o.html',
              },
            ],
          },
        ],
      },
    })))

    await expect(searchMango('神偷奶爸3')).resolves.toEqual([])
  })
})
