# Movie Online — 开发进度

> 更新时间：2026-06-30
> 分支：`main`

## 完成情况

| # | 任务 | 状态 |
|---|------|------|
| 1 | Project Scaffolding（Next.js 15 + Cloudflare Pages + Vitest）| ✅ APPROVED |
| 2 | Database Schema（movies / movie_platforms / watchlist + Drizzle ORM）| ✅ APPROVED |
| 3 | Utility Helpers（auth / cookie / platform-match）| ✅ APPROVED |
| 4 | Sync API Endpoints（/api/sync/movies、enrich、platforms）| ✅ APPROVED |
| 5 | Public Movies API（/api/movies list/detail/search）| ✅ APPROVED |
| 6 | Watchlist API（GET / POST / DELETE）| ✅ APPROVED |
| 7 | Maoyan Scraper（scripts/maoyan-scraper.ts）| ✅ APPROVED |
| 8 | Douban Enricher（scripts/douban-enricher.ts）| ✅ APPROVED |
| 9 | Platform Checker（scripts/platform-checker.ts，6 平台）| ✅ APPROVED |
| 10 | GitHub Actions Workflow（.github/workflows/scrape.yml，每日 08:00 北京）| ✅ APPROVED |
| 11 | Home Page（3-section 电影列表 + 搜索）| ✅ APPROVED |
| 12 | Movie Detail Page（平台状态 + 追踪按钮 + 估算下映日期）| ✅ APPROVED |
| 13 | Watchlist Page（Cookie 警告 + 移除按钮）| ✅ APPROVED |
| 14 | Deployment（Cloudflare D1 + Pages 部署）| ✅ **已部署**（GitHub Secrets 待配置）|

**测试：22/24 passing**（schema 测试因 better-sqlite3 native build 需 `pnpm approve-builds`）

---

## 生产环境

| 项目 | 值 |
|------|-----|
| **Pages URL** | https://movie-online-4d6.pages.dev |
| **D1 database_id** | `adb41511-e946-44d5-875c-074c02a661a9` |
| **Migration** | ✅ 已应用到 remote |
| **SYNC_SECRET** | ✅ 已通过 `wrangler pages secret put` 设置 |

验证：`POST /api/sync/movies` 返回 `{"ok":true,"count":0}` ✅

---

## 剩余手动步骤

### 1. 配置 GitHub Secrets

GitHub → Settings → Secrets → Actions：

- `APP_URL` = `https://movie-online-4d6.pages.dev`
- `SYNC_SECRET` = （与 Cloudflare Pages 中一致，见本地 `.env.local` 或部署时生成的值）

> 本地可用 `gh auth login` 后执行：
> ```bash
> gh secret set APP_URL --body "https://movie-online-4d6.pages.dev"
> gh secret set SYNC_SECRET --body "<your-secret>"
> ```

### 2. 手动触发 GitHub Actions

GitHub → Actions → Daily Scrape → Run workflow

### 3. 本地验证 scraper（可选）

```bash
APP_URL=https://movie-online-4d6.pages.dev SYNC_SECRET=<your-secret> npx tsx scripts/maoyan-scraper.ts
```

---

## 架构概览

```
movie-online/
├── src/
│   ├── db/         schema.ts + client.ts (Drizzle + D1)
│   ├── lib/        auth.ts / cookie.ts / platform-match.ts
│   └── app/
│       ├── page.tsx              首页（3-section + 搜索）
│       ├── movie/[id]/page.tsx   电影详情
│       ├── watchlist/page.tsx    追踪列表
│       └── api/
│           ├── movies/           公开 API
│           ├── watchlist/        追踪 API
│           └── sync/             抓取数据同步 API（Bearer Token）
├── scripts/
│   ├── lib/        browser.ts / api-client.ts
│   ├── maoyan-scraper.ts
│   ├── douban-enricher.ts
│   └── platform-checker.ts
├── tests/          24 个测试
└── .github/workflows/scrape.yml  每日 08:00 北京时间
```
