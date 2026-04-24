import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import cron from 'node-cron'
import { SOURCES } from './sources'
import { dedupByUrl, fetchAll, filterLast24h } from './fetcher'
import { summarizeArticles } from './summarizer'
import { render } from './renderer'

async function runOnce(): Promise<void> {
  console.log('Fetching feeds...')
  const raw = await fetchAll(SOURCES)
  const recent = filterLast24h(raw)
  const unique = dedupByUrl(recent)
  unique.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
  console.log(`Collected ${unique.length} articles (raw=${raw.length}, after 24h filter=${recent.length}).`)

  console.log('Summarizing with Claude...')
  const summarized = await summarizeArticles(unique)

  const now = new Date()
  const markdown = render(summarized, now)
  const outputDir = 'output'
  await mkdir(outputDir, { recursive: true })
  const filename = join(outputDir, `${now.toISOString().slice(0, 10)}.md`)
  await writeFile(filename, markdown, 'utf8')
  console.log(`Wrote ${filename}`)
}

async function main(): Promise<void> {
  const isCron = process.argv.includes('--cron') || process.env.npm_config_cron === 'true'
  if (!isCron) {
    await runOnce()
    return
  }

  const schedule = '0 8 * * *'
  console.log(`Cron mode enabled: running daily at 08:00 (${schedule}).`)
  cron.schedule(schedule, () => {
    console.log(`[${new Date().toISOString()}] Cron tick: starting run...`)
    runOnce().catch((err) => {
      console.error('Scheduled run failed:', err)
    })
  })
  console.log('Waiting for next trigger. Press Ctrl+C to exit.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
