# Movie Online — 经验教训

> 更新时间：2026-07-05

## 部署与同步

1. **Cloudflare Pages 的运行时环境变量不能只按 Node.js 思路处理。**
   - 在 Edge runtime 里，同步 API 鉴权要优先从 `getRequestContext().env.SYNC_SECRET` 读取。
   - `process.env.SYNC_SECRET` 只能作为本地测试、脚本或非 Edge 环境 fallback。
   - 相关鉴权逻辑必须有测试覆盖 Cloudflare env 优先级，避免本地通过、生产 401。

2. **Cloudflare Secret 和 GitHub Actions Secret 是两份配置，值必须一致。**
   - Cloudflare Pages 的 `SYNC_SECRET` 负责生产 API 接收请求。
   - GitHub Actions 的 `SYNC_SECRET` 负责 scraper 发起请求。
   - 配好一次即可，不需要每次 workflow 前重复设置；只有换 URL、换 secret、换仓库或删除 secret 才需要重设。

3. **设置 GitHub Secrets 不等于数据已经纠正。**
   - 正确顺序是：设置 `APP_URL` / `SYNC_SECRET` → 手动触发 workflow → 查看 run 结果 → 查日志 → 查生产 API。
   - 只看到 `Created workflow_dispatch event` 说明任务已触发，不说明已完成。
   - 用 `gh run list --workflow scrape.yml --limit 3` 和 `gh run view <run_id> --log` 确认。

4. **验证数据要看生产 API，不只看 Actions 成功。**
   - Actions 成功代表脚本没有崩，但数据是否更新要查 API 返回。
   - 本次有效信号包括：`platform-checker Done. 336 platform updates`、生产 API 中 `lastCheckedAt` 更新到本次运行时间。
   - “大多数电影仍然 not_available”不一定是错误；平台搜索判断后确实未上线时，正确结果就是 `not_available`。

## 构建与依赖

5. **`@cloudflare/next-on-pages` 官方脚本内部仍会调用 Vercel build。**
   - 把 `pages:build` 从 `pnpm dlx @cloudflare/next-on-pages@1` 改成 `next-on-pages` 并不能消除内部 `pnpm dlx vercel build`。
   - 为了这个目的添加 `vercel` devDependency 会膨胀 lockfile，且不能解决内部下载行为。
   - 保持官方脚本更稳：`pnpm dlx @cloudflare/next-on-pages@1`。

6. **失败的 Pages/Vercel 构建可能会重建一半 `node_modules`。**
   - 如果之后出现 `next: command not found` 或 `vitest: command not found`，先怀疑依赖目录被中途重建。
   - 恢复方式：`pnpm install --frozen-lockfile`。
   - 恢复后检查 `git diff -- package.json pnpm-lock.yaml`，避免把实验性依赖改动带进提交。

7. **当前完整测试里两个 schema 测试失败是已知 native build 问题。**
   - `better-sqlite3` 的 native binding 未构建会导致 `tests/db/schema.test.ts` 两个测试失败。
   - 这不是本次同步/鉴权逻辑回归。
   - 判断本次改动时优先跑相关测试：`pnpm vitest run tests/api/sync.test.ts tests/lib/platform-search.test.ts`，再跑 `pnpm build` 和 `pnpm pages:build`。

## 平台检查

8. **芒果搜索结果包含聚合内容，不能把所有返回都当成芒果可播。**
   - Mango 搜索 API 可能返回腾讯、爱奇艺等聚合来源。
   - 只有 `source === "imgo"` 的媒体结果才应算作芒果自有可播候选。
   - 保留回归测试，防止“神偷奶爸”等聚合结果再次污染平台状态。

9. **`not_available` 要可重检。**
   - 平台上线状态是时间敏感数据。
   - 曾经为 `not_available` 的记录不能因为已有状态就长期跳过，否则上线后不会被发现。
   - 检查策略应确保 `not_available` 按间隔重新检查。

## 操作习惯

10. **不要在聊天里暴露 secret 明文。**
    - 用命令替换设置 GitHub Secret：
      ```bash
      gh secret set SYNC_SECRET --body "$(sed -n 's/^SYNC_SECRET=//p' .env.local)"
      ```
    - 对外只确认 “已设置”，不要打印真实值。

11. **遇到网络/TLS/DNS 问题先重试，不要马上改代码。**
    - `failed to fetch public key`、`TLS handshake timeout`、`Could not resolve host` 这类问题可能是临时网络状态。
    - 先重试同一命令或使用授权联网环境验证，再判断是否是代码或配置问题。

12. **最后收尾必须同时确认三件事。**
    - GitHub Actions 最新 run 是 `completed success`。
    - 生产 API 能读到更新后的数据。
    - 本地工作区 `git status --short --branch` 干净，提交已推送到 `origin/main`。
