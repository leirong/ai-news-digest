# CLAUDE.md

本文件为在此仓库中工作的 Claude Code (claude.ai/code) 提供指引。

## 常用命令

- `npm install` — 安装依赖。
- `npm start` — 单次运行:抓取 RSS → 过滤近 24 小时 → 去重 → 调 Claude 生成摘要 → 写入 `output/YYYY-MM-DD.md`。
- `npm start -- --cron` — 驻留运行,按 `0 8 * * *`(每日 08:00,本地时区)触发同一条流水线。
- `npx tsc --noEmit` — 仅做类型检查(没有构建步骤,`tsx` 直接运行 TS)。

`ANTHROPIC_API_KEY` 通过 `tsx --env-file-if-exists=.env` 从 `.env` 加载。若未设置,`summarizeArticles` 会打印警告并回退到 100 字截断的 RSS 摘要 —— 流水线仍会跑完。

仓库未配置测试框架、lint 或 formatter。

## 架构

四段式流水线,由 `src/index.ts::runOnce` 串联:

1. **`fetcher.ts`** — `fetchAll(SOURCES)` 用 `Promise.allSettled` 并发抓取每个 RSS(单个 feed 失败不会中断整体运行)。每条 item 被规范化为 `Article`,带有去 HTML 后的 `description` 和占位 `summary`(由 `description` 截断而来)。随后 `filterLast24h` + `dedupByUrl` 收窄集合。
2. **`summarizer.ts`** — 以 20 篇为一批,通过 `client.messages.parse` 调用 Claude(`claude-opus-4-7`),并用 `@anthropic-ai/sdk/helpers/zod` 的 Zod schema 作为 `output_config`。system prompt 带 `cache_control: { type: 'ephemeral' }`,以便多批命中 prompt 缓存。返回的 `summaries[]` 按 `index` 写回文章副本;任何批次抛错会被记录,该批文章保留占位摘要。
3. **`renderer.ts`** — 纯函数,输出 Markdown 报告(表头、各源计数、每篇文章一个 `##` 段)。
4. **`index.ts`** — 把报告写到 `output/<ISO 日期>.md`。传入 `--cron`(或 `npm_config_cron=true`)会把单次运行切换为 `node-cron` 定时任务。

`sources.ts` 是增删 feed 的唯一入口。`Article` 类型定义在 `fetcher.ts`,为各阶段共享。

## 需保留的约定

- 摘要阶段走 **结构化输出**(`messages.parse` + `zodOutputFormat`),不是"自由文本再解析 JSON"。扩展时保留这种形态,不要回退到字符串解析。
- system prompt 上的 prompt-cache 标记是刻意的;编辑 `SYSTEM_PROMPT` 时请保留。
- 纯 ESM(`"type": "module"` + `"module": "ESNext"`,`moduleResolution: "Bundler"`)。和 `src/` 其他文件一样,`.ts` 之间的 import 不带扩展名。
- 摘要为中文(不超过 40 字、不带评论),见 `SYSTEM_PROMPT`;生成的报告也使用中文标签。
