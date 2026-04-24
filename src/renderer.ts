import type { Article } from './fetcher';

function formatUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function render(articles: Article[], generatedAt = new Date()): string {
  const sources = new Set(articles.map((a) => a.source));
  const perSource = new Map<string, number>();
  for (const a of articles) {
    perSource.set(a.source, (perSource.get(a.source) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# AI 新闻日报 · ${generatedAt.toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`生成时间：${formatUtc(generatedAt)}`);
  lines.push('');
  lines.push(
    `共收录 **${articles.length}** 篇，来自 **${sources.size}** 个源` +
      (perSource.size
        ? ` (${[...perSource.entries()]
            .map(([n, c]) => `${n} ${c}`)
            .join(' · ')})`
        : '') +
      '。',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  if (articles.length === 0) {
    lines.push('_过去 24 小时内未抓取到文章。_');
    lines.push('');
    return lines.join('\n');
  }

  for (const a of articles) {
    lines.push(`## [${a.title}](${a.link})`);
    lines.push('');
    lines.push(`*${a.source} · ${formatUtc(a.pubDate)}*`);
    lines.push('');
    if (a.summary) {
      lines.push(`> ${a.summary}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
