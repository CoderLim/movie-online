# Movie Online — 开发进度

> 更新时间：2026-06-30
> 分支：`feat/movie-online-impl`

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
| 14 | Deployment（Cloudflare D1 + Pages 部署）| ⏳ **待手动操作** |

**测试：20/20 passing（5 test files）**

---

## Task 14：部署步骤（待完成）

需要手动执行以下操作：

### 1. 创建 Cloudflare D1 数据库

```bash
cd .worktrees/impl
pnpm wrangler d1 create movie-online
```

将输出的 `database_id` 填入 `wrangler.toml`：
```toml
[[d1_databases]]
binding = "DB"
database_name = "movie-online"
database_id = "YOUR_REAL_ID_HERE"   # ← 填这里
```

### 2. 应用 migration 到生产环境

```bash
pnpm db:migrate:prod
```

### 3. 在 Cloudflare Pages 设置环境变量

Dashboard → Pages → movie-online → Settings → Environment Variables：
- `SYNC_SECRET` = 一个随机字符串（`openssl rand -hex 32` 生成）

### 4. 部署

```bash
pnpm deploy
```

部署成功后得到 URL：`https://movie-online.pages.dev`

### 5. 配置 GitHub Secrets

GitHub → Settings → Secrets → Actions：
- `APP_URL` = `https://movie-online.pages.dev`
- `SYNC_SECRET` = 与 Cloudflare 一致

### 6. 手动触发一次 GitHub Actions

GitHub → Actions → Daily Scrape → Run workflow

---

## 技术说明

- **分支**：`feat/movie-online-impl`（未合并到 main）
- **Worktree**：`.worktrees/impl/`
- **所有代码**：已推送到 `git@github.com:CoderLim/movie-online.git`
- **PR 链接**：https://github.com/CoderLim/movie-online/pull/new/feat/movie-online-impl

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
├── tests/          20 个测试，全部通过
└── .github/workflows/scrape.yml  每日 08:00 北京时间
```
