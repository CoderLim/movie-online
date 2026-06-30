# Movie Online — 设计文档

**日期：** 2026-06-30  
**状态：** 已确认（v2，根据 Codex review 修订）

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
         ↓（通过 API 写入，所有写入均为幂等 upsert）
    Cloudflare D1
         ↓（读取展示）
    Cloudflare Pages（Next.js）
```

---

## 数据模型

### 时间字段格式约定

所有 `text` 类型的时间字段统一使用 **ISO 8601 UTC** 格式：`YYYY-MM-DDTHH:mm:ssZ`。  
日期字段（如 `release_date`、`theater_end_date`）使用 `YYYY-MM-DD`。

### `movies` — 电影基础信息

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | 自增 |
| title | text NOT NULL | 中文片名 |
| maoyan_id | text UNIQUE NOT NULL | 猫眼 ID，去重主键 |
| douban_id | text | 豆瓣 ID（enricher 填入） |
| poster_url | text | 海报图片地址 |
| rating | real | 豆瓣评分 |
| description | text | 简介 |
| release_date | text | 院线上映日期（YYYY-MM-DD） |
| theater_end_date | text | 下映日期估算值（NULL = 仍在院线） |
| created_at | text | ISO 8601 UTC |
| updated_at | text | ISO 8601 UTC |

> `theater_end_date IS NULL` → 在院线；`IS NOT NULL` → 已下映  
> `theater_end_date` 为**估算值**：当电影从猫眼榜单消失时，记为当天日期。非精确下映时间。  
> 去重策略：按 `maoyan_id` 做 upsert，避免重名片重复插入。

**索引：**
- `CREATE INDEX ON movies(theater_end_date)`
- `CREATE INDEX ON movies(title)`

### `movie_platforms` — 各平台上线状态

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | 自增 |
| movie_id | integer NOT NULL | → movies.id |
| platform | text NOT NULL | tencent \| iqiyi \| youku \| mango \| bilibili \| xigua |
| status | text NOT NULL DEFAULT 'not_available' | not_available \| available |
| play_url | text | 播放链接（上线后填入） |
| available_at | text | 上线时间（ISO 8601 UTC） |
| last_checked_at | text | 最后检查时间（ISO 8601 UTC） |

**约束：**
- `UNIQUE (movie_id, platform)` — 每部电影每个平台只有一条记录
- 生命周期：**懒创建**，platform-checker 首次检查该电影时按需 upsert；所有写入使用 `INSERT OR REPLACE`

**索引：**
- `CREATE INDEX ON movie_platforms(movie_id)`
- `CREATE INDEX ON movie_platforms(status, last_checked_at)`

### `watchlist` — 用户追踪列表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | integer PK | 自增 |
| movie_id | integer NOT NULL | → movies.id |
| user_token | text NOT NULL | Cookie UUID，首次访问时自动生成 |
| created_at | text | ISO 8601 UTC |

**约束：**
- `UNIQUE (user_token, movie_id)` — 防止重复追踪同一部电影
- 每个 `user_token` 最多追踪 200 部电影（API 层校验，超出返回 429）

**Cookie 属性：** `HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`（1年）

**说明：** 换设备或清除 Cookie 后追踪列表丢失，产品层面可接受（个人工具，页面有提示）。

**索引：**
- `CREATE INDEX ON watchlist(user_token)`

---

## 爬虫层

### 执行顺序与触发方式

GitHub Actions Cron，每天 08:00 北京时间（UTC 00:00），三个步骤顺序执行。  
任意步骤失败 → GitHub Actions 自动发送邮件通知，后续步骤跳过。  
所有写入均为幂等 upsert，重跑安全。

### ① maoyan-scraper

- 抓猫眼「正在热映」榜单，获取 `maoyan_id`、`title`、`release_date`
- 按 `maoyan_id` 做 upsert：
  - 榜单中存在 → `theater_end_date = NULL`（保持在院线状态）
  - 上次在榜、本次消失 → `theater_end_date = 今天`（估算下映）
  - 全新电影 → 插入 `movies` 表

### ② douban-enricher

- 只处理 `douban_id IS NULL` 的电影（新入库未补充详情）
- **豆瓣 ID 获取策略（优先级从高到低）：**
  1. 从猫眼电影详情页直接读取豆瓣链接（猫眼通常内嵌豆瓣评分）
  2. 用 `title + release_date 年份` 搜索豆瓣，对结果校验年份（±1年内），取第一条通过校验的结果
- 写入 `poster_url`、`rating`、`description`、`douban_id`
- 若两种方式均无法匹配，跳过该电影（`douban_id` 保持 NULL，不填入错误数据）

### ③ platform-checker

**检查范围：** `theater_end_date IS NOT NULL` 且至少一个平台 `last_checked_at` 超过检查间隔（或从未检查）的电影

**检查频率：**

| 下映时长 | 检查间隔 |
|---|---|
| 0 – 30 天 | 每天 |
| 31 – 90 天 | 每 3 天 |
| > 90 天 | 每 7 天 |

**平台匹配标准（同时满足以下条件才算上线）：**
1. 片名完全匹配或仅差标点（忽略大小写、全半角符号）
2. 年份匹配（搜索结果年份与 `release_date` 年份相差 ≤ 1年）
3. 内容类型为「电影」（非剧集、综艺、纪录片等）
4. 时长 ≥ 60 分钟（排除预告片、花絮、片段）
5. 内容状态为「会员可看」或「免费可看」（预售/即将上线不算）

**检查逻辑：**
- 匹配 → `status = available`，写入 `play_url` + `available_at`（upsert）
- 不匹配 → 更新 `last_checked_at`（upsert）

全平台均上线后，该电影退出检查队列。

**支持平台：** 腾讯视频、爱奇艺、优酷、芒果TV、哔哩哔哩、西瓜视频

---

## 页面设计

### 首页 `/`

按状态分三个区块，规则如下：

| 区块 | 条件 |
|---|---|
| 🎬 正在院线 | `theater_end_date IS NULL` |
| ⏳ 等待上线 | `theater_end_date IS NOT NULL` 且所有平台 `status = not_available` |
| ✅ 已上线 | `theater_end_date IS NOT NULL` 且至少一个平台 `status = available` |

> 边界情况：若电影记录存在但 `movie_platforms` 尚无数据（platform-checker 未跑），归入「等待上线」区块。

顶部提供搜索框，按片名模糊搜索（跨三个区块）。

### 电影详情页 `/movie/[id]`

- 海报、片名、评分、简介、下映日期（标注为估算值）
- 各平台状态列表：已上线显示「去看」链接，未上线显示最后检查时间
- 「加入追踪 / 取消追踪」按钮

### 追踪列表页 `/watchlist`

- 基于 Cookie `user_token` 展示当前用户追踪的电影
- 每部电影展示各平台当前状态
- 支持移除追踪
- 顶部提示：「追踪列表保存在本设备，清除 Cookie 或换设备后将重置」

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
POST    /api/watchlist              body: { movie_id }  → 超过200条返回 429
DELETE  /api/watchlist/[movie_id]
```

### 爬虫写入（需 Bearer Token，幂等）

```
POST  /api/sync/movies      maoyan-scraper 调用（upsert by maoyan_id）
POST  /api/sync/enrich      douban-enricher 调用（upsert by maoyan_id）
POST  /api/sync/platforms   platform-checker 调用（upsert by movie_id + platform）
```

鉴权：`Authorization: Bearer <SYNC_SECRET>`，secret 存储于 GitHub Actions Secrets 和 Cloudflare 环境变量。  
所有同步接口均为幂等，重复调用不产生副作用。

---

## 暂不实现（后续扩展）

- 上线通知推送（邮件 / 微信）
- 用户账号系统（当前用 Cookie token）
- 手动添加电影（目前仅自动同步猫眼院线）
- 爬虫成功率监控 Dashboard
