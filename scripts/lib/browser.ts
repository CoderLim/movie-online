import { chromium, type Browser, type Page } from 'playwright'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

export async function closeBrowser(): Promise<void> {
  await browser?.close()
  browser = null
}

export async function fetchWithBrowser(url: string): Promise<Page> {
  const b = await getBrowser()
  const page = await b.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  } catch (err) {
    await page.close()
    throw err
  }
  return page
}
