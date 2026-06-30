# Movie Online — 设计文档

**日期：** 2026-06-30  
**状态：** 已确认

---

## 背景与痛点

院线电影下映后，会陆续在各视频平台上线，但用户无法方便地得知「某部电影什么时候可以在我订阅的平台上看」。本项目解决这个信息断层，提供自动追踪和查询能力。

---

## 整体架构

### 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | Next.js (App Router) |
| 数据库 | Cloudflare D1 (SQLite) + Drizzle ORM |
| 托管 | Cloudflare Pages |
| 定时爬虫 | GitHub Actions Cron + Playwright |
| 部署配置 | wrangler.toml |

### 核心模块

```
movie-online/
├── src/
│   ├── app/                  Next.js 页面
│   │   ├── page.tsx          首页
│   │   ├── movie/[id]/       电影详情页
│   │   ├── watchlist/        追踪列表页
│   │   └── api/              Route Handlers
│   └── db/                   Drizzle schema + client
├── scripts/
│   ├── maoyan-scraper.ts     猫眼院线同步
│   ├── douban-enricher.ts    豆瓣详情补充
│   └── platform-checker.ts  各平台上线检查
└── .github/
    └── workflows/
        └── scrape.yml        每日定时触发
```

### 数据流

```
GitHub Actions（每天 08:00 北京时间）
    ① maoyan-scraper   → 同步院线/下映状态
    ② douban-enricher  → 补充新电影详情
    ③ platform-checker → 检查6个平台上线状态
         ↓（通过 API 写入）
    Cloudflare D1
         ↓（读取展示）
    Cloudflare Pages（Next.js）
```

---

## 数据模型

### `movies` — 电影基础信息

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | |
| title | text | 中文片名 |
| douban_id | text | 豆瓣 ID |
| maoyan_id | text | 猫眼 ID |
| poster_url | text | 海报图片地址 |
| rating | real | 豆瓣评分 |
| description | text | 简介 |
| release_date | text | 院线上映日期 |
| theater_end_date | text | 下映日期（NULL = 仍在院线） |
| created_at | text | |
| updated_at | text | |

> `theater_end_date IS NULL` → 在院线；`IS NOT NULL` → 已下映

### `movie_platforms` — 各平台上线状态

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | |
| movie_id | integer FK | → movies.id |
| platform | text | tencent \| iqiyi \| youku \| mango \| bilibili \| xigua |
| status | text | not_available \| available |
| play_url | text | 播放链接（上线后填入） |
| available_at | text | 上线时间 |
| last_checked_at | text | 最后检查时间 |

### `watchlist` — 用户追踪列表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | |
| movie_id | integer FK | → movies.id |
| user_token | text | Cookie UUID，首次访问时自动生成并写入 Cookie |
| created_at | text | |

---

## 爬虫层

### 执行顺序与触发方式

GitHub Actions Cron，每天 08:00 北京时间（UTC 00:00），三个脚本顺序执行。

### ① maoyan-scraper

- 抓猫眼「正在热映」榜单
- 榜单中存在的电影 → `theater_end_date = NULL`
- 上次在榜、本次消失的电影 → `theater_end_date = 今天`
- 全新电影 → 插入 `movies` 表

### ② douban-enricher

- 只处理 `douban_id IS NULL` 的电影（新入库）
- 用片名搜索豆瓣，取第一条结果
- 写入 `poster_url`、`rating`、`description`、`douban_id`

### ③ platform-checker

**检查范围：** `theater_end_date IS NOT NULL` 且至少一个平台仍为 `not_available` 的电影

**检查频率（减少无效请求）：**

| 下映时长 | 检查频率 |
|---|---|
| 0 – 30 天 | 每天 |
| 31 – 90 天 | 每 3 天 |
| > 90 天 | 每 7 天 |

**检查逻辑：** 用片名搜索各平台，判断搜索结果中是否包含匹配正片：
- 匹配 → `status = available`，写入 `play_url` + `available_at`
- 不匹配 → 更新 `last_checked_at`

全平台均上线后，该电影退出检查队列。

**支持平台：** 腾讯视频、爱奇艺、优酷、芒果TV、哔哩哔哩、西瓜视频

---

## 页面设计

### 首页 `/`

按状态分三个区块：

1. **🎬 正在院线** — `theater_end_date IS NULL`
2. **⏳ 等待上线** — 已下映，所有平台均未上线
3. **✅ 已上线** — 至少一个平台可观看，展示各平台状态图标

顶部提供搜索框，按片名模糊搜索。

### 电影详情页 `/movie/[id]`

- 海报、片名、评分、简介、下映日期
- 各平台状态列表：已上线显示「去看」链接，未上线显示最后检查时间
- 「加入追踪 / 取消追踪」按钮

### 追踪列表页 `/watchlist`

- 基于 Cookie `user_token` 展示当前用户追踪的电影
- 每部电影展示各平台当前状态
- 支持移除追踪

---

## API 接口

### 电影查询（公开）

```
GET  /api/movies              首页列表，按状态分组
GET  /api/movies/[id]         电影详情 + 各平台状态
GET  /api/movies/search?q=    按片名搜索
```

### 追踪列表（基于 Cookie）

```
GET     /api/watchlist
POST    /api/watchlist              body: { movie_id }
DELETE  /api/watchlist/[movie_id]
```

### 爬虫写入（需 Bearer Token）

```
POST  /api/sync/movies      maoyan-scraper 调用
POST  /api/sync/enrich      douban-enricher 调用
POST  /api/sync/platforms   platform-checker 调用
```

鉴权：`Authorization: Bearer <SYNC_SECRET>`，secret 存储于 GitHub Actions Secrets 和 Cloudflare 环境变量。

---

## 暂不实现（后续扩展）

- 上线通知推送（邮件 / 微信）
- 用户账号系统
- 手动添加电影（目前仅自动同步猫眼院线）
