import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Article } from './fetcher'
import { truncate } from './fetcher'

const MODEL = 'claude-opus-4-7'
const BATCH_SIZE = 20
const INPUT_DESC_CAP = 600

const SummarySchema = z.object({
  summaries: z.array(
    z.object({
      index: z.number().int().min(0),
      summary: z.string(),
    }),
  ),
})

const SYSTEM_PROMPT =
  '你是 AI 新闻编辑。给你一组英文 AI 新闻（标题+描述），为每条生成一句中文摘要，控制在 40 字以内，聚焦核心事实，不加评论。严格按要求的 JSON 结构返回，index 与输入顺序一一对应。'

interface BatchItem {
  index: number
  title: string
  source: string
  description: string
}

async function summarizeBatch(client: Anthropic, items: BatchItem[]): Promise<Map<number, string>> {
  const userContent = items
    .map(
      (it) => `[${it.index}] (${it.source}) ${it.title}\n描述: ${truncate(it.description, INPUT_DESC_CAP) || '(无)'}`,
    )
    .join('\n\n')

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: zodOutputFormat(SummarySchema),
    },
  })

  const parsed = response.parsed_output
  const map = new Map<number, string>()
  if (!parsed) return map
  for (const { index, summary } of parsed.summaries) {
    map.set(index, summary.trim())
  }
  return map
}

export async function summarizeArticles(articles: Article[]): Promise<Article[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set; falling back to truncated summaries.')
    return articles
  }
  if (articles.length === 0) return articles

  const client = new Anthropic({ apiKey })
  const out = articles.map((a) => ({ ...a }))

  for (let i = 0; i < out.length; i += BATCH_SIZE) {
    const slice = out.slice(i, i + BATCH_SIZE)
    const items: BatchItem[] = slice.map((a, j) => ({
      index: j,
      title: a.title,
      source: a.source,
      description: a.description,
    }))
    try {
      const summaries = await summarizeBatch(client, items)
      for (let j = 0; j < slice.length; j++) {
        const s = summaries.get(j)
        if (s) out[i + j].summary = s
      }
      console.log(`  [summarizer] batch ${i / BATCH_SIZE + 1}: ${summaries.size}/${slice.length} summaries`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  [summarizer] batch ${i / BATCH_SIZE + 1} failed: ${msg}`)
    }
  }
  return out
}
