import Parser from 'rss-parser';
import type { Source } from './sources';

export interface Article {
  title: string;
  link: string;
  pubDate: Date;
  source: string;
  description: string;
  summary: string;
}

const parser = new Parser({ timeout: 10000 });

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(clean: string, max: number): string {
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
}

export async function fetchSource(source: Source): Promise<Article[]> {
  const feed = await parser.parseURL(source.url);
  const articles: Article[] = [];
  for (const item of feed.items) {
    const dateStr = item.isoDate ?? item.pubDate;
    if (!dateStr || !item.title || !item.link) continue;
    const pubDate = new Date(dateStr);
    if (Number.isNaN(pubDate.getTime())) continue;
    const rawSummary =
      item.contentSnippet ??
      (item as { summary?: string }).summary ??
      item.content ??
      '';
    const description = stripHtml(rawSummary);
    articles.push({
      title: item.title,
      link: item.link,
      pubDate,
      source: source.name,
      description,
      summary: truncate(description, 100),
    });
  }
  return articles;
}

export async function fetchAll(sources: Source[]): Promise<Article[]> {
  const results = await Promise.allSettled(sources.map(fetchSource));
  const articles: Article[] = [];
  results.forEach((r, i) => {
    const name = sources[i].name;
    if (r.status === 'fulfilled') {
      console.log(`  [${name}] fetched ${r.value.length} items`);
      articles.push(...r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`  [${name}] failed: ${msg}`);
    }
  });
  return articles;
}

export function filterLast24h(articles: Article[], now = Date.now()): Article[] {
  const cutoff = now - 24 * 60 * 60 * 1000;
  return articles.filter((a) => a.pubDate.getTime() >= cutoff);
}

export function dedupByUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles) {
    if (seen.has(a.link)) continue;
    seen.add(a.link);
    out.push(a);
  }
  return out;
}
